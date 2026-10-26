-- =====================================================================
--  Gestion d'école primaire (mono-école) — schéma de la base de données
--  PostgreSQL 16
--  * Une seule école, une seule base (pas de multi-tenancy)
--  * Colonne annee_scolaire sur les tables métier (historique pluriannuel)
--  * Suppression logique (deleted_at) pour conserver l'historique
--  * Journalisation automatique (trigger) : utilisateur, date, anciennes et nouvelles valeurs
--  * Immuabilité des messages envoyés et des annonces publiées (trigger)
-- =====================================================================

CREATE TABLE parametres (
  cle     TEXT PRIMARY KEY,
  valeur  TEXT NOT NULL
);

-- ---------------------------------------------------------------------
-- Utilisateurs (tous les rôles)
-- ---------------------------------------------------------------------
CREATE TABLE utilisateurs (
  id                 SERIAL PRIMARY KEY,
  role               TEXT NOT NULL CHECK (role IN ('admin','enseignant','parent','eleve','comptable')),
  email              TEXT NOT NULL,
  mot_de_passe       TEXT NOT NULL,
  nom                TEXT NOT NULL,
  prenom             TEXT NOT NULL,
  telephone          TEXT,
  adresse            TEXT,
  specialite         TEXT,
  actif              BOOLEAN NOT NULL DEFAULT TRUE,
  doit_changer_mdp   BOOLEAN NOT NULL DEFAULT FALSE,
  derniere_connexion TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ
);
CREATE UNIQUE INDEX utilisateurs_email_unique ON utilisateurs (lower(email)) WHERE deleted_at IS NULL;
CREATE INDEX utilisateurs_role ON utilisateurs (role) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- Référentiels : classes, matières, salles
-- ---------------------------------------------------------------------
CREATE TABLE classes (
  id              SERIAL PRIMARY KEY,
  niveau          TEXT NOT NULL,
  section         TEXT NOT NULL,
  capacite_max    INT  NOT NULL CHECK (capacite_max > 0),
  annee_scolaire  TEXT NOT NULL,
  titulaire_id    INT REFERENCES utilisateurs(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX classes_unique ON classes (niveau, upper(section), annee_scolaire) WHERE deleted_at IS NULL;

CREATE TABLE matieres (
  id           SERIAL PRIMARY KEY,
  nom          TEXT NOT NULL,
  coefficient  NUMERIC(4,2) NOT NULL CHECK (coefficient > 0),
  niveau       TEXT,                       -- NULL = tous les niveaux
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX matieres_unique ON matieres (lower(nom), COALESCE(niveau, '*')) WHERE deleted_at IS NULL;

CREATE TABLE salles (
  id           SERIAL PRIMARY KEY,
  nom          TEXT NOT NULL,
  capacite     INT NOT NULL CHECK (capacite > 0),
  disponible   BOOLEAN NOT NULL DEFAULT TRUE,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX salles_unique ON salles (lower(nom)) WHERE deleted_at IS NULL;

-- Affectation matière <-> enseignant <-> classe
CREATE TABLE affectations (
  id              SERIAL PRIMARY KEY,
  enseignant_id   INT NOT NULL REFERENCES utilisateurs(id),
  matiere_id      INT NOT NULL REFERENCES matieres(id),
  classe_id       INT NOT NULL REFERENCES classes(id),
  annee_scolaire  TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX affectations_unique ON affectations (matiere_id, classe_id) WHERE deleted_at IS NULL;
CREATE INDEX affectations_enseignant ON affectations (enseignant_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- Fichiers (photos, reçus, devoirs, pièces jointes…)
-- ---------------------------------------------------------------------
CREATE TABLE fichiers (
  id            SERIAL PRIMARY KEY,
  categorie     TEXT NOT NULL CHECK (categorie IN ('photo_eleve','recu','devoir_enonce','devoir_correction','soumission','message_pj','justificatif')),
  ref_id        INT,
  chemin        TEXT NOT NULL,
  nom_original  TEXT NOT NULL,
  mime          TEXT NOT NULL,
  taille        INT  NOT NULL,
  depose_par    INT REFERENCES utilisateurs(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX fichiers_ref ON fichiers (categorie, ref_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- Élèves, parents, inscriptions
-- ---------------------------------------------------------------------
CREATE SEQUENCE seq_matricule START 1;
CREATE SEQUENCE seq_preinscription START 1;
CREATE SEQUENCE seq_recu START 1;

CREATE TABLE eleves (
  id                    SERIAL PRIMARY KEY,
  matricule             TEXT NOT NULL,
  nom                   TEXT NOT NULL,
  prenom                TEXT NOT NULL,
  date_naissance        DATE NOT NULL,
  lieu_naissance        TEXT,
  sexe                  TEXT CHECK (sexe IN ('F','M')),
  adresse               TEXT,
  antecedents_medicaux  TEXT,
  annee_entree          TEXT NOT NULL,
  utilisateur_id        INT REFERENCES utilisateurs(id),
  photo_id              INT REFERENCES fichiers(id),
  statut                TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif','sorti','anonymise')),
  consentement_rgpd_at  TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);
CREATE UNIQUE INDEX eleves_matricule_unique ON eleves (matricule) WHERE deleted_at IS NULL;
CREATE INDEX eleves_utilisateur ON eleves (utilisateur_id);

CREATE TABLE parents_eleves (
  parent_id  INT NOT NULL REFERENCES utilisateurs(id),
  eleve_id   INT NOT NULL REFERENCES eleves(id),
  lien       TEXT NOT NULL DEFAULT 'Parent',
  PRIMARY KEY (parent_id, eleve_id)
);
CREATE INDEX parents_eleves_eleve ON parents_eleves (eleve_id);

-- Une inscription = un élève dans une classe pour une année scolaire
CREATE TABLE inscriptions (
  id                SERIAL PRIMARY KEY,
  eleve_id          INT NOT NULL REFERENCES eleves(id),
  classe_id         INT NOT NULL REFERENCES classes(id),
  annee_scolaire    TEXT NOT NULL,
  mode_affectation  TEXT NOT NULL DEFAULT 'manuelle' CHECK (mode_affectation IN ('manuelle','automatique','import','passage')),
  date_affectation  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX inscriptions_unique ON inscriptions (eleve_id, annee_scolaire);
CREATE INDEX inscriptions_classe ON inscriptions (classe_id);

CREATE TABLE preinscriptions (
  id                    SERIAL PRIMARY KEY,
  reference             TEXT NOT NULL UNIQUE,
  enfant_nom            TEXT NOT NULL,
  enfant_prenom         TEXT NOT NULL,
  date_naissance        DATE NOT NULL,
  lieu_naissance        TEXT,
  sexe                  TEXT CHECK (sexe IN ('F','M')),
  niveau_souhaite       TEXT,
  ecole_precedente      TEXT,
  antecedents_medicaux  TEXT,
  parent_nom            TEXT NOT NULL,
  parent_prenom         TEXT NOT NULL,
  lien                  TEXT NOT NULL DEFAULT 'Parent',
  email                 TEXT NOT NULL,
  telephone             TEXT NOT NULL,
  adresse               TEXT,
  consentement          BOOLEAN NOT NULL,
  consentement_at       TIMESTAMPTZ,
  statut                TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','validee','refusee')),
  motif_refus           TEXT,
  eleve_id              INT REFERENCES eleves(id),
  traite_par            INT REFERENCES utilisateurs(id),
  traite_at             TIMESTAMPTZ,
  annee_scolaire        TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- Emploi du temps
-- ---------------------------------------------------------------------
CREATE TABLE creneaux (
  id              SERIAL PRIMARY KEY,
  classe_id       INT NOT NULL REFERENCES classes(id),
  matiere_id      INT NOT NULL REFERENCES matieres(id),
  enseignant_id   INT NOT NULL REFERENCES utilisateurs(id),
  salle_id        INT REFERENCES salles(id),
  jour            SMALLINT NOT NULL CHECK (jour BETWEEN 1 AND 6),   -- 1 = lundi … 6 = samedi
  heure_debut     TIME NOT NULL,
  heure_fin       TIME NOT NULL,
  annee_scolaire  TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  CHECK (heure_fin > heure_debut)
);
CREATE INDEX creneaux_classe ON creneaux (classe_id) WHERE deleted_at IS NULL;
CREATE INDEX creneaux_enseignant ON creneaux (enseignant_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- Évaluations, notes, absences
-- ---------------------------------------------------------------------
CREATE TABLE evaluations (
  id               SERIAL PRIMARY KEY,
  classe_id        INT NOT NULL REFERENCES classes(id),
  matiere_id       INT NOT NULL REFERENCES matieres(id),
  enseignant_id    INT REFERENCES utilisateurs(id),
  titre            TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('controle_continu','examen')),
  trimestre        SMALLINT NOT NULL CHECK (trimestre BETWEEN 1 AND 3),
  date_evaluation  DATE NOT NULL,
  bareme           NUMERIC(5,2) NOT NULL DEFAULT 20 CHECK (bareme > 0),
  annee_scolaire   TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);
CREATE INDEX evaluations_classe ON evaluations (classe_id, matiere_id, trimestre) WHERE deleted_at IS NULL;

CREATE TABLE notes (
  id              SERIAL PRIMARY KEY,
  evaluation_id   INT NOT NULL REFERENCES evaluations(id),
  eleve_id        INT NOT NULL REFERENCES eleves(id),
  valeur          NUMERIC(5,2) NOT NULL CHECK (valeur >= 0),
  commentaire     TEXT,
  annee_scolaire  TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX notes_unique ON notes (evaluation_id, eleve_id) WHERE deleted_at IS NULL;
CREATE INDEX notes_eleve ON notes (eleve_id) WHERE deleted_at IS NULL;

CREATE TABLE absences (
  id               SERIAL PRIMARY KEY,
  eleve_id         INT NOT NULL REFERENCES eleves(id),
  date_absence     DATE NOT NULL,
  periode          TEXT NOT NULL CHECK (periode IN ('matin','apres_midi','journee')),
  motif            TEXT,
  statut           TEXT NOT NULL DEFAULT 'non_justifiee' CHECK (statut IN ('non_justifiee','en_attente','justifiee','refusee')),
  justification    TEXT,
  justificatif_id  INT REFERENCES fichiers(id),
  justifie_par     INT REFERENCES utilisateurs(id),
  justifie_at      TIMESTAMPTZ,
  valide_par       INT REFERENCES utilisateurs(id),
  valide_at        TIMESTAMPTZ,
  annee_scolaire   TEXT NOT NULL,
  saisi_par        INT REFERENCES utilisateurs(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);
CREATE UNIQUE INDEX absences_unique ON absences (eleve_id, date_absence, periode) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- Finances
-- ---------------------------------------------------------------------
CREATE TABLE tarifs (
  id              SERIAL PRIMARY KEY,
  libelle         TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('inscription','tranche','autre')),
  montant         NUMERIC(10,3) NOT NULL CHECK (montant >= 0),
  niveau          TEXT,                    -- NULL = tous les niveaux
  date_echeance   DATE,
  annee_scolaire  TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE paiements (
  id               SERIAL PRIMARY KEY,
  numero_recu      TEXT NOT NULL UNIQUE,
  eleve_id         INT NOT NULL REFERENCES eleves(id),
  tarif_id         INT REFERENCES tarifs(id),
  montant          NUMERIC(10,3) NOT NULL CHECK (montant > 0),
  date_paiement    DATE NOT NULL,
  mode             TEXT NOT NULL CHECK (mode IN ('especes','virement','mobile_money','cheque')),
  reference        TEXT,
  remarque         TEXT,
  recu_id          INT REFERENCES fichiers(id),
  annee_scolaire   TEXT NOT NULL,
  enregistre_par   INT REFERENCES utilisateurs(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);
CREATE INDEX paiements_eleve ON paiements (eleve_id, annee_scolaire) WHERE deleted_at IS NULL;

CREATE TABLE relances (
  id              SERIAL PRIMARY KEY,
  eleve_id        INT NOT NULL REFERENCES eleves(id),
  montant_du      NUMERIC(10,3) NOT NULL,
  annee_scolaire  TEXT NOT NULL,
  automatique     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Devoirs (homework)
-- ---------------------------------------------------------------------
CREATE TABLE devoirs (
  id                     SERIAL PRIMARY KEY,
  titre                  TEXT NOT NULL,
  description            TEXT,
  matiere_id             INT NOT NULL REFERENCES matieres(id),
  classe_id              INT NOT NULL REFERENCES classes(id),
  enseignant_id          INT NOT NULL REFERENCES utilisateurs(id),
  date_remise            TIMESTAMPTZ NOT NULL,
  bareme                 NUMERIC(5,2) NOT NULL DEFAULT 20 CHECK (bareme > 0),
  correction_publiee_at  TIMESTAMPTZ,
  annee_scolaire         TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at             TIMESTAMPTZ
);
CREATE INDEX devoirs_classe ON devoirs (classe_id) WHERE deleted_at IS NULL;

CREATE TABLE soumissions (
  id                      SERIAL PRIMARY KEY,
  devoir_id               INT NOT NULL REFERENCES devoirs(id),
  eleve_id                INT NOT NULL REFERENCES eleves(id),
  commentaire_eleve       TEXT,
  depose_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_at              TIMESTAMPTZ,
  note                    NUMERIC(5,2) CHECK (note >= 0),
  commentaire_enseignant  TEXT,
  note_publiee_at         TIMESTAMPTZ,
  annee_scolaire          TEXT NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (devoir_id, eleve_id)
);

CREATE TABLE devoirs_vus (
  devoir_id  INT NOT NULL REFERENCES devoirs(id),
  eleve_id   INT NOT NULL REFERENCES eleves(id),
  parent_id  INT NOT NULL REFERENCES utilisateurs(id),
  vu_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (devoir_id, eleve_id, parent_id)
);

-- ---------------------------------------------------------------------
-- Messagerie et annonces
-- ---------------------------------------------------------------------
CREATE TABLE messages (
  id             SERIAL PRIMARY KEY,
  expediteur_id  INT NOT NULL REFERENCES utilisateurs(id),
  objet          TEXT NOT NULL,
  corps          TEXT NOT NULL,
  eleve_id       INT REFERENCES eleves(id),          -- fil de discussion par élève
  fil_id         INT REFERENCES messages(id),        -- message racine de la conversation
  statut         TEXT NOT NULL CHECK (statut IN ('brouillon','envoye')),
  automatique    BOOLEAN NOT NULL DEFAULT FALSE,
  envoye_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ                          -- uniquement pour les brouillons
);
CREATE INDEX messages_expediteur ON messages (expediteur_id);
CREATE INDEX messages_fil ON messages (fil_id);

CREATE TABLE messages_destinataires (
  message_id      INT NOT NULL REFERENCES messages(id),
  destinataire_id INT NOT NULL REFERENCES utilisateurs(id),
  lu_at           TIMESTAMPTZ,
  masque_at       TIMESTAMPTZ,                        -- suppression côté destinataire uniquement
  PRIMARY KEY (message_id, destinataire_id)
);
CREATE INDEX messages_destinataires_dest ON messages_destinataires (destinataire_id);

CREATE TABLE annonces (
  id           SERIAL PRIMARY KEY,
  titre        TEXT NOT NULL,
  contenu      TEXT NOT NULL,
  audience     TEXT NOT NULL CHECK (audience IN ('tous','parents','enseignants','eleves','personnel')),
  auteur_id    INT NOT NULL REFERENCES utilisateurs(id),
  statut       TEXT NOT NULL CHECK (statut IN ('brouillon','publiee')),
  corrige_id   INT REFERENCES annonces(id),           -- annonce corrective
  publiee_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- Notifications et journaux
-- ---------------------------------------------------------------------
CREATE TABLE notifications (
  id              SERIAL PRIMARY KEY,
  utilisateur_id  INT NOT NULL REFERENCES utilisateurs(id),
  type            TEXT NOT NULL,
  titre           TEXT NOT NULL,
  contenu         TEXT,
  lien            TEXT,
  lu_at           TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_utilisateur ON notifications (utilisateur_id, created_at DESC);

CREATE TABLE abonnements_push (
  id              SERIAL PRIMARY KEY,
  utilisateur_id  INT NOT NULL REFERENCES utilisateurs(id),
  endpoint        TEXT NOT NULL UNIQUE,
  p256dh          TEXT NOT NULL,
  auth            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Journal des envois (messagerie interne, e-mail, push)
CREATE TABLE journal_envois (
  id               SERIAL PRIMARY KEY,
  destinataire_id  INT REFERENCES utilisateurs(id),
  destinataire     TEXT,
  canal            TEXT NOT NULL CHECK (canal IN ('messagerie','email','push')),
  contexte         TEXT NOT NULL,
  sujet            TEXT,
  contenu          TEXT,
  statut           TEXT NOT NULL CHECK (statut IN ('envoye','simule','echec')),
  erreur           TEXT,
  ref_type         TEXT,
  ref_id           INT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX journal_envois_date ON journal_envois (created_at DESC);

-- Journal d'audit (alimenté automatiquement par trigger)
CREATE TABLE journal_audit (
  id                 BIGSERIAL PRIMARY KEY,
  utilisateur_id     INT REFERENCES utilisateurs(id),
  action             TEXT NOT NULL,
  entite             TEXT NOT NULL,
  entite_id          INT,
  anciennes_valeurs  JSONB,
  nouvelles_valeurs  JSONB,
  ip                 TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX journal_audit_date ON journal_audit (created_at DESC);
CREATE INDEX journal_audit_entite ON journal_audit (entite, entite_id);

-- Journal des accès (consultation des conversations et des dossiers élèves)
CREATE TABLE journal_acces (
  id              BIGSERIAL PRIMARY KEY,
  utilisateur_id  INT REFERENCES utilisateurs(id),
  ressource       TEXT NOT NULL,
  ressource_id    INT,
  detail          TEXT,
  ip              TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX journal_acces_date ON journal_acces (created_at DESC);
