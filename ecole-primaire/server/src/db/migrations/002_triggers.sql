-- =====================================================================
--  Règles garanties au niveau de la base de données
--  1. Journalisation : toute création / modification / suppression est
--     enregistrée avec l'utilisateur, la date, les anciennes et nouvelles valeurs.
--  2. Immuabilité : un message envoyé ou une annonce publiée ne peut être
--     ni modifié(e) ni supprimé(e).
--  3. updated_at mis à jour automatiquement.
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_maj_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_journal_audit() RETURNS trigger AS $$
DECLARE
  v_user    INT;
  v_ip      TEXT;
  v_action  TEXT;
  v_old     JSONB;
  v_new     JSONB;
  v_id      INT;
  k         TEXT;
  ancien    JSONB := '{}'::jsonb;
  nouveau   JSONB := '{}'::jsonb;
BEGIN
  -- Le chargement des données de démonstration n'est pas journalisé
  IF current_setting('app.seed', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Les secrets techniques ne sont jamais copiés dans le journal
  IF TG_TABLE_NAME = 'parametres' THEN
    IF COALESCE(to_jsonb(NEW)->>'cle', to_jsonb(OLD)->>'cle') IN ('jwt_secret', 'vapid_prive', 'vapid_public') THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;

  v_user := NULLIF(current_setting('app.utilisateur_id', true), '')::INT;
  v_ip   := NULLIF(current_setting('app.ip', true), '');

  IF TG_OP = 'INSERT' THEN
    v_action := 'creation';
    v_new    := to_jsonb(NEW);
    nouveau  := v_new - 'mot_de_passe' - 'created_at' - 'updated_at';
    v_id     := (v_new->>'id')::INT;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_id  := (v_new->>'id')::INT;

    IF (v_old->>'deleted_at') IS NULL AND (v_new->>'deleted_at') IS NOT NULL THEN
      v_action := 'suppression';
    ELSIF (v_old->>'deleted_at') IS NOT NULL AND (v_new->>'deleted_at') IS NULL THEN
      v_action := 'restauration';
    ELSE
      v_action := 'modification';
    END IF;

    FOR k IN SELECT jsonb_object_keys(v_new) LOOP
      CONTINUE WHEN k IN ('updated_at', 'derniere_connexion', 'recu_id');
      IF v_old->k IS DISTINCT FROM v_new->k THEN
        IF k = 'mot_de_passe' THEN
          ancien  := ancien  || jsonb_build_object(k, '***');
          nouveau := nouveau || jsonb_build_object(k, '***');
        ELSE
          ancien  := ancien  || jsonb_build_object(k, v_old->k);
          nouveau := nouveau || jsonb_build_object(k, v_new->k);
        END IF;
      END IF;
    END LOOP;

    -- Aucune modification réelle : rien à journaliser
    IF ancien = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

  ELSE
    v_action := 'suppression_definitive';
    v_old    := to_jsonb(OLD);
    ancien   := v_old - 'mot_de_passe';
    v_id     := (v_old->>'id')::INT;
  END IF;

  INSERT INTO journal_audit (utilisateur_id, action, entite, entite_id, anciennes_valeurs, nouvelles_valeurs, ip)
  VALUES (v_user, v_action, TG_TABLE_NAME, v_id,
          NULLIF(ancien, '{}'::jsonb), NULLIF(nouveau, '{}'::jsonb), v_ip);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Immuabilité des messages envoyés
CREATE OR REPLACE FUNCTION fn_message_immuable() RETURNS trigger AS $$
BEGIN
  IF OLD.statut = 'envoye' THEN
    RAISE EXCEPTION 'Un message envoyé est immuable : il ne peut être ni modifié ni supprimé.'
      USING ERRCODE = 'P0001', HINT = 'immuable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Immuabilité des annonces publiées
CREATE OR REPLACE FUNCTION fn_annonce_immuable() RETURNS trigger AS $$
BEGIN
  IF OLD.statut = 'publiee' THEN
    RAISE EXCEPTION 'Une annonce publiée est immuable : publiez une annonce corrective.'
      USING ERRCODE = 'P0001', HINT = 'immuable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_message_immuable BEFORE UPDATE OR DELETE ON messages
  FOR EACH ROW EXECUTE FUNCTION fn_message_immuable();
CREATE TRIGGER trg_annonce_immuable BEFORE UPDATE OR DELETE ON annonces
  FOR EACH ROW EXECUTE FUNCTION fn_annonce_immuable();

-- updated_at + journal d'audit sur toutes les tables métier
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'utilisateurs','classes','matieres','salles','affectations','eleves','inscriptions',
    'preinscriptions','creneaux','evaluations','notes','absences','tarifs','paiements',
    'devoirs','soumissions','messages','annonces'
  ] LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION fn_maj_updated_at()', t, t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'utilisateurs','classes','matieres','salles','affectations','eleves','inscriptions','parents_eleves',
    'preinscriptions','creneaux','evaluations','notes','absences','tarifs','paiements',
    'devoirs','soumissions','messages','annonces','parametres'
  ] LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION fn_journal_audit()', t, t);
  END LOOP;
END $$;
