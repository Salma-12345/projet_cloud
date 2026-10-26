// Dossier d'un élève (vue personnel) : identité, scolarité, absences, paiements, RGPD.
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Camera, Download, KeyRound, MessageSquare, Pencil, School, ShieldCheck, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { api, formulaire, qs } from '../api.js';
import { useAuth } from '../contexte/Auth.jsx';
import { useRetours, useSuppression } from '../contexte/Retours.jsx';
import { useDonnees } from '../utils/useDonnees.js';
import { Avatar, Bouton, Champ, Encart, Etat, Feuille, Modale, Onglets, PageTete, Pastille, Tableau } from '../composants/ui.jsx';
import { ModaleFormulaire } from '../composants/Formulaire.jsx';
import Identifiants from '../composants/Identifiants.jsx';
import { AbsencesEleve, BulletinEleve, PaiementsEleve } from '../composants/Eleve.jsx';
import { age, date } from '../utils/format.js';

function ModaleClasse({ eleve, onFermer, onTermine }) {
  const { annee } = useAuth();
  const { donnees: classes } = useDonnees(`/classes${qs({ annee })}`);
  const [choix, setChoix] = useState(eleve.classe ? String(eleve.classe.classe_id) : 'auto');
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const envoyer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      const corps = choix === 'auto' ? { auto: true } : choix === 'aucune' ? {} : { classe_id: Number(choix) };
      const r = await api.put(`/eleves/${eleve.id}/classe`, corps);
      const e_ = eleve.sexe === 'F' ? 'e' : '';
      onTermine(r.classe ? `${eleve.prenom} est affecté${e_} en ${r.classe.niveau} ${r.classe.section}.` : `${eleve.prenom} est retiré${e_} de sa classe.`);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <Modale
      titre="Affectation à une classe"
      sousTitre={`Niveau correspondant à l’âge : ${eleve.niveau_theorique}`}
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" form="form-classe" variante="primaire" chargement={envoi}>
            Affecter
          </Bouton>
        </>
      }
    >
      <form id="form-classe" onSubmit={envoyer} style={{ display: 'grid', gap: 14 }}>
        {erreur && <Encart ton="alerte">{erreur}</Encart>}
        <Champ label="Classe" aide="Les classes complètes sont refusées (contrôle des effectifs).">
          {(id) => (
            <select id={id} value={choix} onChange={(e) => setChoix(e.target.value)}>
              <option value="auto">Automatique selon l’âge ({eleve.niveau_theorique})</option>
              {(classes || []).map((c) => (
                <option key={c.id} value={c.id} disabled={c.effectif >= c.capacite_max && String(c.id) !== choix}>
                  {c.nom} — {c.effectif}/{c.capacite_max} élèves{c.effectif >= c.capacite_max ? ' (complète)' : ''}
                </option>
              ))}
              <option value="aucune">Retirer de sa classe</option>
            </select>
          )}
        </Champ>
      </form>
    </Modale>
  );
}

function ModaleLienParent({ eleve, onFermer, onTermine }) {
  const [q, setQ] = useState('');
  const { donnees: parents } = useDonnees(`/utilisateurs?role=parent${q ? `&q=${encodeURIComponent(q)}` : ''}`);
  const [parentId, setParentId] = useState('');
  const [lien, setLien] = useState('Mère');
  const [erreur, setErreur] = useState(null);
  const envoyer = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/utilisateurs/${parentId}/enfants`, { eleve_id: eleve.id, lien });
      onTermine('Responsable rattaché.');
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale
      titre="Rattacher un responsable"
      sousTitre="Pour créer un nouveau compte parent, passez par le menu Parents."
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" form="form-lien" variante="primaire" disabled={!parentId}>
            Rattacher
          </Bouton>
        </>
      }
    >
      <form id="form-lien" onSubmit={envoyer} className="grille-form">
        {erreur && (
          <div className="plein">
            <Encart ton="alerte">{erreur}</Encart>
          </div>
        )}
        <Champ label="Rechercher" plein>
          {(id) => <input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom ou e-mail du parent" />}
        </Champ>
        <Champ label="Parent" requis>
          {(id) => (
            <select id={id} value={parentId} onChange={(e) => setParentId(e.target.value)} required>
              <option value="" disabled>
                Choisir…
              </option>
              {(parents || []).slice(0, 60).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.prenom} {p.nom} — {p.email}
                </option>
              ))}
            </select>
          )}
        </Champ>
        <Champ label="Lien">
          {(id) => (
            <select id={id} value={lien} onChange={(e) => setLien(e.target.value)}>
              {['Mère', 'Père', 'Tuteur', 'Tutrice', 'Parent'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          )}
        </Champ>
      </form>
    </Modale>
  );
}

function Identite({ e, gestion, recharger }) {
  const { role } = useAuth();
  const { succes, erreur: toastErreur, confirmer } = useRetours();
  const supprimer = useSuppression();
  const naviguer = useNavigate();
  const [modale, setModale] = useState(null);
  const [identifiants, setIdentifiants] = useState(null);
  const fichierPhoto = useRef(null);

  const terminer = (msg) => {
    setModale(null);
    if (msg) succes(msg);
    recharger();
  };

  const envoyerPhoto = async (f) => {
    if (!f) return;
    try {
      await api.post(`/eleves/${e.id}/photo`, formulaire({ photo: f }));
      succes('Photo mise à jour.');
      recharger();
    } catch (err) {
      toastErreur(err);
    }
  };

  const compte = async () => {
    try {
      const r = e.utilisateur_id && e.compte_email
        ? await api.post(`/utilisateurs/${e.utilisateur_id}/reinitialiser-mot-de-passe`)
        : await api.post(`/eleves/${e.id}/compte`);
      setIdentifiants([{ role: 'eleve', nom: `${e.prenom} ${e.nom}`, ...r.identifiants }]);
      recharger();
    } catch (err) {
      toastErreur(err);
    }
  };

  const anonymiser = async () => {
    const ok = await confirmer({
      titre: 'Anonymiser ce dossier ?',
      message:
        'Droit à l’effacement (RGPD) : le nom, l’adresse, la photo, les informations médicales et le compte de l’élève seront effacés définitivement. Les notes et paiements sont conservés sans données personnelles. Cette action est irréversible.',
      libelle: 'Anonymiser définitivement',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post(`/eleves/${e.id}/anonymiser`);
      succes('Dossier anonymisé.');
      recharger();
    } catch (err) {
      toastErreur(err);
    }
  };

  return (
    <div className="grille-principale">
      <div className="pile">
        <Feuille
          titre="Identité"
          actions={
            gestion &&
            e.statut !== 'anonymise' && (
              <Bouton petit icone={Pencil} onClick={() => setModale('modifier')}>
                Modifier
              </Bouton>
            )
          }
        >
          <div className="fiche" style={{ marginBottom: 20 }}>
            <div style={{ position: 'relative' }}>
              <Avatar prenom={e.prenom} nom={e.nom} photoId={e.photo_id} taille="grand" />
              {gestion && e.statut !== 'anonymise' && (
                <>
                  <input ref={fichierPhoto} type="file" accept="image/*" hidden onChange={(ev) => envoyerPhoto(ev.target.files[0])} />
                  <Bouton
                    petit
                    icone={Camera}
                    title="Changer la photo"
                    aria-label="Changer la photo"
                    onClick={() => fichierPhoto.current.click()}
                    style={{ position: 'absolute', right: -6, bottom: -6, borderRadius: '50%', width: 32 }}
                  />
                </>
              )}
            </div>
            <div className="fiche__infos">
              <div className="fiche__nom">
                {e.prenom} {e.nom}
              </div>
              <div className="muet">Matricule {e.matricule}</div>
              <div className="groupe-btn" style={{ marginTop: 8 }}>
                {e.classe ? <Pastille ton="bleu">{e.classe.classe}</Pastille> : <Pastille ton="jaune">Sans classe</Pastille>}
                {e.statut !== 'actif' && <Pastille ton="rouge">{e.statut === 'sorti' ? 'Sorti' : 'Anonymisé'}</Pastille>}
              </div>
            </div>
          </div>
          <dl className="definitions">
            <dt>Date de naissance</dt>
            <dd>
              {date(e.date_naissance)} ({age(e.date_naissance)}){e.lieu_naissance ? `, à ${e.lieu_naissance}` : ''}
            </dd>
            <dt>Sexe</dt>
            <dd>{e.sexe === 'F' ? 'Fille' : e.sexe === 'M' ? 'Garçon' : '—'}</dd>
            <dt>Adresse</dt>
            <dd>{e.adresse || '—'}</dd>
            <dt>Année d’entrée</dt>
            <dd>{e.annee_entree}</dd>
            <dt>Informations médicales</dt>
            <dd style={{ color: e.antecedents_medicaux ? 'var(--marge-fonce)' : undefined }}>{e.antecedents_medicaux || 'Aucune'}</dd>
            <dt>Consentement RGPD</dt>
            <dd>{e.consentement_rgpd_at ? `Recueilli le ${date(e.consentement_rgpd_at)}` : 'Non recueilli'}</dd>
          </dl>
        </Feuille>
        <Feuille
          titre="Scolarité"
          serre
          actions={
            gestion &&
            e.statut === 'actif' && (
              <Bouton petit icone={School} onClick={() => setModale('classe')}>
                Changer de classe
              </Bouton>
            )
          }
        >
          <Tableau
            lignes={e.inscriptions}
            colonnes={[
              { titre: 'Année', rendu: (i) => <strong>{i.annee_scolaire}</strong> },
              { titre: 'Classe', rendu: (i) => (role === 'enseignant' ? i.classe : <Link to={`/classes/${i.classe_id}`}>{i.classe}</Link>) },
              { titre: 'Titulaire', rendu: (i) => i.titulaire || '—' },
              { titre: 'Affectation', rendu: (i) => ({ manuelle: 'Manuelle', automatique: 'Automatique (âge)', import: 'Import de fichier', passage: 'Passage de niveau' })[i.mode_affectation] || i.mode_affectation },
            ]}
            vide={<p className="muet" style={{ padding: 20 }}>Aucune inscription en classe.</p>}
          />
        </Feuille>
      </div>
      <div className="pile">
        <Feuille
          titre="Responsables légaux"
          serre
          actions={
            gestion && (
              <Bouton petit icone={UserPlus} onClick={() => setModale('parent')}>
                Rattacher
              </Bouton>
            )
          }
        >
          {e.parents.length ? (
            <ul className="liste-reglee">
              {e.parents.map((p) => (
                <li key={p.id}>
                  <Avatar prenom={p.prenom} nom={p.nom} taille="petit" />
                  <div className="liste-reglee__principal">
                    <div className="liste-reglee__titre">
                      {p.prenom} {p.nom} <span className="muet petit">({p.lien})</span>
                    </div>
                    <div className="liste-reglee__meta">
                      {p.telephone || 'Pas de téléphone'}
                      <br />
                      {p.email}
                    </div>
                  </div>
                  {gestion && (
                    <Bouton
                      petit
                      variante="fantome"
                      icone={UserMinus}
                      title="Détacher"
                      aria-label={`Détacher ${p.prenom} ${p.nom}`}
                      onClick={async () => {
                        if (await confirmer({ titre: 'Détacher ce responsable ?', message: `${p.prenom} ${p.nom} n’aura plus accès au suivi de ${e.prenom}.`, libelle: 'Détacher', danger: true })) {
                          await api.del(`/utilisateurs/${p.id}/enfants/${e.id}`);
                          succes('Responsable détaché.');
                          recharger();
                        }
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muet" style={{ padding: 20 }}>
              Aucun responsable rattaché.
            </p>
          )}
        </Feuille>
        {gestion && (
          <Feuille titre="Compte de l’élève">
            <p className="petit" style={{ marginBottom: 12 }}>
              {e.compte_email ? (
                <>
                  Identifiant : <strong>{e.compte_email}</strong>
                </>
              ) : (
                'L’élève n’a pas encore de compte pour consulter son emploi du temps et déposer ses devoirs.'
              )}
            </p>
            <Bouton petit icone={KeyRound} onClick={compte} disabled={e.statut === 'anonymise'}>
              {e.compte_email ? 'Réinitialiser le mot de passe' : 'Créer le compte'}
            </Bouton>
            {identifiants && (
              <div style={{ marginTop: 14 }}>
                <Identifiants liste={identifiants} emailActif={false} />
              </div>
            )}
          </Feuille>
        )}
        {role === 'admin' && (
          <Feuille titre="Données personnelles (RGPD)">
            <div style={{ display: 'grid', gap: 10 }}>
              <a className="btn btn--secondaire btn--petit" href={`/api/eleves/${e.id}/rgpd`} download>
                <Download size={15} aria-hidden="true" /> Exporter les données (portabilité)
              </a>
              {e.statut !== 'anonymise' && (
                <Bouton petit variante="danger" icone={ShieldCheck} onClick={anonymiser}>
                  Anonymiser (droit à l’effacement)
                </Bouton>
              )}
              <Bouton
                petit
                variante="danger"
                icone={Trash2}
                onClick={async () => {
                  if (await supprimer(`/eleves/${e.id}`, { titre: 'Archiver ce dossier ?', message: 'Le dossier sera retiré des listes (suppression logique) ; l’historique est conservé.' }))
                    naviguer('/eleves');
                }}
              >
                Supprimer le dossier
              </Bouton>
            </div>
          </Feuille>
        )}
      </div>
      {modale === 'modifier' && (
        <ModaleFormulaire
          titre="Modifier l’identité"
          initial={e}
          onFermer={() => setModale(null)}
          onEnvoyer={async (v) => {
            await api.put(`/eleves/${e.id}`, v);
            terminer('Dossier mis à jour.');
          }}
          champs={[
            { nom: 'prenom', label: 'Prénom', requis: true },
            { nom: 'nom', label: 'Nom', requis: true },
            { nom: 'date_naissance', label: 'Date de naissance', type: 'date', requis: true },
            { nom: 'lieu_naissance', label: 'Lieu de naissance' },
            { nom: 'sexe', label: 'Sexe', type: 'select', requis: true, options: [{ valeur: 'F', libelle: 'Fille' }, { valeur: 'M', libelle: 'Garçon' }] },
            { nom: 'statut', label: 'Statut', type: 'select', requis: true, options: [{ valeur: 'actif', libelle: 'Actif' }, { valeur: 'sorti', libelle: 'Sorti de l’école' }] },
            { nom: 'adresse', label: 'Adresse', plein: true },
            { nom: 'antecedents_medicaux', label: 'Antécédents médicaux', type: 'textarea', lignes: 3, plein: true },
          ]}
        />
      )}
      {modale === 'classe' && <ModaleClasse eleve={e} onFermer={() => setModale(null)} onTermine={terminer} />}
      {modale === 'parent' && <ModaleLienParent eleve={e} onFermer={() => setModale(null)} onTermine={terminer} />}
    </div>
  );
}

export default function DossierEleve() {
  const { id } = useParams();
  const { role, estAnneeCourante } = useAuth();
  const [params, setParams] = useSearchParams();
  const onglet = params.get('onglet') || 'identite';
  const { donnees, chargement, erreur, recharger } = useDonnees(`/eleves/${id}`);
  const gestion = ['admin', 'comptable'].includes(role) && estAnneeCourante;
  const onglets = [
    { cle: 'identite', libelle: 'Dossier' },
    { cle: 'notes', libelle: 'Notes et bulletins' },
    { cle: 'absences', libelle: 'Absences' },
    ...(['admin', 'comptable'].includes(role) ? [{ cle: 'paiements', libelle: 'Paiements' }] : []),
  ];
  return (
    <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
      {(e) => (
        <>
          <PageTete
            titre={`${e.prenom} ${e.nom}`}
            texte={`${e.classe ? e.classe.classe : 'Sans classe'}, matricule ${e.matricule}`}
            retour={{ to: role === 'enseignant' ? '/classes' : '/eleves', libelle: role === 'enseignant' ? 'Mes classes' : 'Élèves' }}
            actions={
              role !== 'enseignant' && (
                <Link className="btn btn--secondaire" to={`/messagerie?nouveau=1&eleve=${e.id}`}>
                  <MessageSquare size={17} aria-hidden="true" /> Écrire aux parents
                </Link>
              )
            }
          />
          <Onglets
            onglets={onglets}
            actif={onglet}
            onChange={(o) => {
              const p = new URLSearchParams(params);
              p.set('onglet', o);
              setParams(p, { replace: true });
            }}
          />
          {onglet === 'identite' && <Identite e={e} gestion={gestion} recharger={recharger} />}
          {onglet === 'notes' && <BulletinEleve eleveId={e.id} annees={e.inscriptions.map((i) => i.annee_scolaire)} />}
          {onglet === 'absences' && <AbsencesEleve eleveId={e.id} prenom={e.prenom} />}
          {onglet === 'paiements' && <PaiementsEleve eleve={e} gestion={gestion} />}
        </>
      )}
    </Etat>
  );
}
