import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Download, FileSpreadsheet, GraduationCap, Plus, Upload } from 'lucide-react';
import { api, formulaire, qs } from '../api.js';
import { useAuth } from '../contexte/Auth.jsx';
import { useRetours } from '../contexte/Retours.jsx';
import { useDonnees } from '../utils/useDonnees.js';
import { Avatar, Bouton, Champ, Encart, Etat, Feuille, Modale, PageTete, Pastille, Recherche, Tableau, Vide } from '../composants/ui.jsx';
import { ChampsFormulaire } from '../composants/Formulaire.jsx';
import Identifiants from '../composants/Identifiants.jsx';
import { SelecteurFichiers } from '../composants/Fichiers.jsx';
import { NIVEAUX, age, dateCourte } from '../utils/format.js';

function ModaleNouvelEleve({ classes, onFermer, onCree }) {
  const { utilisateur } = useAuth();
  const [v, setV] = useState({ sexe: '', affectation_auto: true, creer_compte_eleve: true, consentement: true });
  const [parent, setParent] = useState({ mode: 'nouveau', lien: 'Mère' });
  const [rechercheParent, setRechercheParent] = useState('');
  const { donnees: parents } = useDonnees(parent.mode === 'existant' ? `/utilisateurs?role=parent${rechercheParent ? `&q=${encodeURIComponent(rechercheParent)}` : ''}` : null);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState(null);

  const champs = [
    { nom: 'prenom', label: 'Prénom', requis: true },
    { nom: 'nom', label: 'Nom', requis: true },
    { nom: 'date_naissance', label: 'Date de naissance', type: 'date', requis: true },
    { nom: 'lieu_naissance', label: 'Lieu de naissance' },
    { nom: 'sexe', label: 'Sexe', type: 'select', requis: true, options: [{ valeur: 'F', libelle: 'Fille' }, { valeur: 'M', libelle: 'Garçon' }] },
    { nom: 'adresse', label: 'Adresse' },
    { nom: 'antecedents_medicaux', label: 'Antécédents médicaux', type: 'textarea', lignes: 2, plein: true, aide: 'Allergies, traitements, informations utiles à l’équipe éducative.' },
    { nom: 'affectation_auto', label: 'Affecter automatiquement à une classe selon l’âge (classe la moins chargée du niveau)', type: 'checkbox', plein: true },
    {
      nom: 'classe_id',
      label: 'Classe',
      type: 'select',
      visible: (x) => !x.affectation_auto,
      options: classes.map((c) => ({ valeur: c.id, libelle: `${c.nom} (${c.effectif}/${c.capacite_max})` })),
      placeholder: 'Sans classe pour l’instant',
    },
    { nom: 'creer_compte_eleve', label: 'Créer un compte de connexion pour l’élève', type: 'checkbox', plein: true },
    { nom: 'consentement', label: 'Consentement parental (RGPD) recueilli', type: 'checkbox', plein: true },
  ];

  const envoyer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    const parents = [];
    if (parent.mode === 'existant' && parent.parent_id) parents.push({ parent_id: Number(parent.parent_id), lien: parent.lien });
    if (parent.mode === 'nouveau' && parent.email) parents.push({ nom: parent.nom, prenom: parent.prenom, email: parent.email, telephone: parent.telephone, lien: parent.lien });
    try {
      const r = await api.post('/eleves', { ...v, classe_id: v.affectation_auto ? null : v.classe_id || null, parents });
      setResultat(r);
    } catch (err) {
      setErreur(err);
    } finally {
      setEnvoi(false);
    }
  };

  if (resultat) {
    return (
      <Modale
        titre="Élève inscrit(e)"
        onFermer={() => onCree(null)}
        pied={
          <>
            <Bouton onClick={() => onCree(null)}>Fermer</Bouton>
            <Bouton variante="primaire" onClick={() => onCree(resultat.eleve.id)}>
              Ouvrir le dossier
            </Bouton>
          </>
        }
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <Encart ton="succes">
            {resultat.eleve.prenom} {resultat.eleve.nom} (matricule {resultat.eleve.matricule})
            {resultat.classe
              ? ` est affecté${resultat.eleve.sexe === 'F' ? 'e' : ''} en ${resultat.classe.niveau} ${resultat.classe.section}.`
              : ` est inscrit${resultat.eleve.sexe === 'F' ? 'e' : ''}, sans classe pour le moment.`}
          </Encart>
          <Identifiants liste={resultat.identifiants} emailActif={utilisateur.email_actif} />
        </div>
      </Modale>
    );
  }

  return (
    <Modale
      large
      titre="Inscrire un élève"
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" form="form-eleve" variante="primaire" chargement={envoi}>
            Inscrire l’élève
          </Bouton>
        </>
      }
    >
      <form id="form-eleve" onSubmit={envoyer} style={{ display: 'grid', gap: 20 }}>
        {erreur && <Encart ton="alerte">{erreur.message}</Encart>}
        <ChampsFormulaire champs={champs} valeurs={v} onChange={setV} erreurs={(erreur && erreur.donnees.erreurs) || {}} />
        <fieldset style={{ border: '1px solid var(--ligne)', borderRadius: 8, padding: 16, margin: 0 }}>
          <legend className="gras" style={{ padding: '0 6px' }}>
            Responsable légal
          </legend>
          <div className="groupe-btn" style={{ marginBottom: 14 }} role="radiogroup" aria-label="Type de responsable">
            {[
              ['nouveau', 'Nouveau parent'],
              ['existant', 'Parent déjà inscrit (fratrie)'],
              ['aucun', 'Plus tard'],
            ].map(([k, l]) => (
              <label key={k} className="case" style={{ marginRight: 12 }}>
                <input type="radio" name="mode-parent" checked={parent.mode === k} onChange={() => setParent({ ...parent, mode: k })} />
                {l}
              </label>
            ))}
          </div>
          {parent.mode === 'nouveau' && (
            <ChampsFormulaire
              valeurs={parent}
              onChange={setParent}
              champs={[
                { nom: 'prenom', label: 'Prénom', requis: true },
                { nom: 'nom', label: 'Nom', requis: true },
                { nom: 'email', label: 'E-mail', type: 'email', requis: true, aide: 'Servira d’identifiant de connexion.' },
                { nom: 'telephone', label: 'Téléphone', type: 'tel' },
                { nom: 'lien', label: 'Lien', type: 'select', requis: true, options: ['Mère', 'Père', 'Tuteur', 'Tutrice'].map((x) => ({ valeur: x, libelle: x })) },
              ]}
            />
          )}
          {parent.mode === 'existant' && (
            <div className="grille-form">
              <Champ label="Rechercher un parent">
                {(id) => <input id={id} value={rechercheParent} onChange={(e) => setRechercheParent(e.target.value)} placeholder="Nom, e-mail ou enfant" />}
              </Champ>
              <Champ label="Parent" requis>
                {(id) => (
                  <select id={id} value={parent.parent_id || ''} onChange={(e) => setParent({ ...parent, parent_id: e.target.value })} required>
                    <option value="" disabled>
                      Choisir…
                    </option>
                    {(parents || []).slice(0, 50).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.prenom} {p.nom} ({p.enfants.map((x) => x.nom.split(' ')[0]).join(', ') || p.email})
                      </option>
                    ))}
                  </select>
                )}
              </Champ>
              <Champ label="Lien">
                {(id) => (
                  <select id={id} value={parent.lien} onChange={(e) => setParent({ ...parent, lien: e.target.value })}>
                    {['Mère', 'Père', 'Tuteur', 'Tutrice'].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                )}
              </Champ>
            </div>
          )}
        </fieldset>
      </form>
    </Modale>
  );
}

function ModaleImport({ onFermer, onTermine }) {
  const { utilisateur } = useAuth();
  const [fichier, setFichier] = useState(null);
  const [rapport, setRapport] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const envoyer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      setRapport(await api.post('/eleves/import', formulaire({ fichier })));
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <Modale
      titre="Importer des élèves"
      sousTitre="Fichier CSV (séparateur ; ou ,) ou Excel, une ligne par élève."
      onFermer={rapport ? onTermine : onFermer}
      pied={
        rapport ? (
          <Bouton variante="primaire" onClick={onTermine}>
            Terminer
          </Bouton>
        ) : (
          <>
            <Bouton onClick={onFermer}>Annuler</Bouton>
            <Bouton type="submit" form="form-import" variante="primaire" chargement={envoi} disabled={!fichier}>
              Importer
            </Bouton>
          </>
        )
      }
    >
      {rapport ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <Encart ton={rapport.erreurs.length ? 'attention' : 'succes'}>
            {rapport.crees} élève(s) importé(s){rapport.erreurs.length ? `, ${rapport.erreurs.length} ligne(s) refusée(s).` : '.'}
          </Encart>
          {rapport.erreurs.length > 0 && (
            <ul className="petit" style={{ margin: 0, paddingLeft: 20 }}>
              {rapport.erreurs.map((x) => (
                <li key={x.ligne}>
                  Ligne {x.ligne} : {x.message}
                </li>
              ))}
            </ul>
          )}
          <Identifiants liste={rapport.identifiants} emailActif={utilisateur.email_actif} />
        </div>
      ) : (
        <form id="form-import" onSubmit={envoyer} style={{ display: 'grid', gap: 16 }}>
          {erreur && <Encart ton="alerte">{erreur}</Encart>}
          <p className="petit">
            Colonnes reconnues : nom, prenom, date_naissance, sexe, lieu_naissance, classe (ex. CE1 A), adresse, antecedents_medicaux,
            parent_nom, parent_prenom, parent_lien, parent_email, parent_telephone. Les comptes parents manquants sont créés.
          </p>
          <div className="groupe-btn">
            <a className="btn btn--secondaire btn--petit" href="/api/eleves/modele-import?format=xlsx">
              <FileSpreadsheet size={15} aria-hidden="true" /> Modèle Excel
            </a>
            <a className="btn btn--secondaire btn--petit" href="/api/eleves/modele-import?format=csv">
              <Download size={15} aria-hidden="true" /> Modèle CSV
            </a>
          </div>
          <SelecteurFichiers
            id="fichier-import"
            label="Fichier à importer"
            aide="Format .csv ou .xlsx."
            accept=".csv,.xlsx"
            multiple={false}
            fichiers={fichier ? [fichier] : []}
            onChange={(liste) => setFichier(liste[0] || null)}
          />
        </form>
      )}
    </Modale>
  );
}

export default function Eleves() {
  const { role, annee, estAnneeCourante } = useAuth();
  const [params, setParams] = useSearchParams();
  const naviguer = useNavigate();
  const [texte, setTexte] = useState('');
  const [modale, setModale] = useState(null);
  const { succes } = useRetours();
  const classeId = params.get('classe_id') || '';
  const sansClasse = params.get('sans_classe') === '1';
  const statut = params.get('statut') || 'actif';
  const { donnees: classes } = useDonnees(`/classes${qs({ annee, toutes: role === 'enseignant' ? undefined : undefined })}`);
  const { donnees, chargement, erreur, recharger } = useDonnees(`/eleves${qs({ annee, classe_id: classeId, sans_classe: sansClasse ? 1 : '', statut })}`);
  const gestion = ['admin', 'comptable'].includes(role) && estAnneeCourante;

  const lignes = useMemo(() => {
    const q = texte.trim().toLowerCase();
    if (!donnees) return [];
    if (!q) return donnees;
    return donnees.filter((e) => `${e.nom} ${e.prenom} ${e.matricule} ${e.parents.map((p) => p.nom).join(' ')}`.toLowerCase().includes(q));
  }, [donnees, texte]);

  const filtre = (cle, valeur) => {
    const p = new URLSearchParams(params);
    if (valeur) p.set(cle, valeur);
    else p.delete(cle);
    setParams(p, { replace: true });
  };

  return (
    <>
      <PageTete
        titre={role === 'enseignant' ? 'Mes élèves' : 'Élèves'}
        texte={role === 'enseignant' ? 'Les élèves des classes qui vous sont affectées.' : `Dossiers des élèves pour l’année ${annee}.`}
        actions={
          ['admin', 'comptable'].includes(role) && (
            <>
              <a className="btn btn--secondaire" href={`/api/eleves/export${qs({ annee, format: 'xlsx', classe_id: classeId })}`}>
                <FileSpreadsheet size={17} aria-hidden="true" /> Exporter (Excel)
              </a>
              <a className="btn btn--secondaire" href={`/api/eleves/export${qs({ annee, format: 'csv', classe_id: classeId })}`}>
                <Download size={17} aria-hidden="true" /> CSV
              </a>
              {gestion && (
                <>
                  <Bouton icone={Upload} onClick={() => setModale('import')}>
                    Importer
                  </Bouton>
                  <Bouton variante="primaire" icone={Plus} onClick={() => setModale('nouveau')}>
                    Inscrire un élève
                  </Bouton>
                </>
              )}
            </>
          )
        }
      />
      <Feuille serre>
        <div className="filtres">
          <Recherche valeur={texte} onChange={setTexte} placeholder="Nom, prénom, matricule ou parent" />
          <Champ label="Classe">
            {(id) => (
              <select id={id} value={sansClasse ? 'sans' : classeId} onChange={(e) => {
                const p = new URLSearchParams(params);
                p.delete('classe_id');
                p.delete('sans_classe');
                if (e.target.value === 'sans') p.set('sans_classe', '1');
                else if (e.target.value) p.set('classe_id', e.target.value);
                setParams(p, { replace: true });
              }}>
                <option value="">Toutes les classes</option>
                {(classes || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
                {role !== 'enseignant' && <option value="sans">Sans classe</option>}
              </select>
            )}
          </Champ>
          {role !== 'enseignant' && (
            <Champ label="Statut">
              {(id) => (
                <select id={id} value={statut} onChange={(e) => filtre('statut', e.target.value === 'actif' ? '' : e.target.value)}>
                  <option value="actif">Actifs</option>
                  <option value="sorti">Sortis</option>
                  <option value="anonymise">Anonymisés</option>
                  <option value="tous">Tous</option>
                </select>
              )}
            </Champ>
          )}
          <span className="muet petit" style={{ marginLeft: 'auto', alignSelf: 'center' }}>
            {lignes.length} élève(s)
          </span>
        </div>
        <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
          {() => (
            <Tableau
              lignes={lignes}
              colonnes={[
                {
                  titre: 'Élève',
                  rendu: (e) => (
                    <Link to={`/eleves/${e.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
                      <Avatar prenom={e.prenom} nom={e.nom} photoId={e.photo_id} taille="petit" />
                      <span style={{ textAlign: 'left' }}>
                        <span className="gras" style={{ display: 'block', color: 'var(--encre)' }}>
                          {e.nom} {e.prenom}
                        </span>
                        <span className="tres-petit muet">{e.matricule}</span>
                      </span>
                    </Link>
                  ),
                },
                { titre: 'Classe', rendu: (e) => (e.classe ? <Pastille ton="bleu">{e.classe}</Pastille> : <Pastille ton="jaune">Sans classe</Pastille>) },
                { titre: 'Naissance', rendu: (e) => <span className="nowrap">{dateCourte(e.date_naissance)} ({age(e.date_naissance)})</span> },
                {
                  titre: 'Responsables',
                  rendu: (e) =>
                    e.parents.length ? (
                      <span className="petit">
                        {e.parents.map((p) => (
                          <span key={p.id} style={{ display: 'block' }}>
                            {p.nom} ({p.lien}){p.telephone ? `, ${p.telephone}` : ''}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="muet petit">Aucun</span>
                    ),
                },
                ...(role === 'enseignant'
                  ? []
                  : [{ titre: 'Statut', rendu: (e) => (e.statut === 'actif' ? <Pastille ton="vert">Actif</Pastille> : <Pastille>{e.statut === 'sorti' ? 'Sorti' : 'Anonymisé'}</Pastille>) }]),
              ]}
              vide={
                <Vide
                  icone={GraduationCap}
                  titre={texte ? 'Aucun élève ne correspond' : 'Aucun élève'}
                  texte={texte ? 'Vérifiez l’orthographe ou changez de classe.' : gestion ? 'Inscrivez un premier élève ou importez une liste.' : null}
                />
              }
            />
          )}
        </Etat>
      </Feuille>
      {modale === 'nouveau' && (
        <ModaleNouvelEleve
          classes={(classes || []).filter((c) => NIVEAUX.includes(c.niveau))}
          onFermer={() => setModale(null)}
          onCree={(id) => {
            setModale(null);
            recharger();
            if (id) naviguer(`/eleves/${id}`);
          }}
        />
      )}
      {modale === 'import' && (
        <ModaleImport
          onFermer={() => setModale(null)}
          onTermine={() => {
            setModale(null);
            succes('Import terminé.');
            recharger();
          }}
        />
      )}
    </>
  );
}
