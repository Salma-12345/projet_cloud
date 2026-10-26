import { useState } from 'react';
import { History } from 'lucide-react';
import { qs } from '../api.js';
import { useDonnees } from '../utils/useDonnees.js';
import { Champ, Etat, Feuille, Onglets, PageTete, Pagination, Pastille, Tableau, Vide } from '../composants/ui.jsx';
import { LIBELLES, dateHeure } from '../utils/format.js';

const TONS_ACTION = { creation: 'vert', modification: 'bleu', suppression: 'rouge', suppression_definitive: 'rouge', connexion: 'gris', masquage: 'jaune', restauration: 'violet' };
const CACHES = ['id', 'created_at', 'updated_at', 'mot_de_passe'];

function valeur(v) {
  if (v === null || v === undefined || v === '') return '∅';
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return dateHeure(s);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

function Differences({ a }) {
  if (a.action === 'modification' || a.action === 'restauration') {
    const cles = Object.keys(a.nouvelles_valeurs || {}).filter((k) => !CACHES.includes(k) || k === 'mot_de_passe');
    return (
      <span className="petit" style={{ display: 'grid', gap: 2 }}>
        {cles.slice(0, 6).map((k) => (
          <span key={k}>
            <span className="muet">{k}</span> : {valeur(a.anciennes_valeurs && a.anciennes_valeurs[k])} → <strong>{valeur(a.nouvelles_valeurs[k])}</strong>
          </span>
        ))}
        {cles.length > 6 && <span className="muet">et {cles.length - 6} autre(s) champ(s)</span>}
      </span>
    );
  }
  const source = a.nouvelles_valeurs || a.anciennes_valeurs;
  if (!source) return <span className="muet petit">—</span>;
  const extrait = ['nom', 'prenom', 'titre', 'objet', 'libelle', 'numero_recu', 'montant', 'valeur', 'niveau', 'section', 'email', 'statut', 'deleted_at']
    .filter((k) => source[k] !== undefined && source[k] !== null)
    .slice(0, 4)
    .map((k) => `${k} : ${valeur(source[k])}`)
    .join(', ');
  return <span className="petit muet">{extrait || '—'}</span>;
}

function Audit() {
  const [f, setF] = useState({ entite: '', action: '', page: 1 });
  const { donnees, chargement, erreur, recharger } = useDonnees(`/journal/audit${qs(f)}`);
  return (
    <Feuille serre>
      <div className="filtres">
        <Champ label="Élément">
          {(id) => (
            <select id={id} value={f.entite} onChange={(e) => setF({ ...f, entite: e.target.value, page: 1 })}>
              <option value="">Tous</option>
              {Object.entries(LIBELLES.entite).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          )}
        </Champ>
        <Champ label="Action">
          {(id) => (
            <select id={id} value={f.action} onChange={(e) => setF({ ...f, action: e.target.value, page: 1 })}>
              <option value="">Toutes</option>
              {Object.entries(LIBELLES.action).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          )}
        </Champ>
      </div>
      <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
        {(d) => (
          <>
            <Tableau
              lignes={d.items}
              colonnes={[
                { titre: 'Date', rendu: (a) => <span className="nowrap petit">{dateHeure(a.created_at)}</span> },
                { titre: 'Utilisateur', rendu: (a) => (a.utilisateur ? <span>{a.utilisateur} <span className="muet petit">({LIBELLES.role[a.utilisateur_role]})</span></span> : <span className="muet">Système (automatique)</span>) },
                { titre: 'Action', rendu: (a) => <Pastille ton={TONS_ACTION[a.action] || 'gris'}>{LIBELLES.action[a.action] || a.action}</Pastille> },
                { titre: 'Élément', rendu: (a) => <span className="nowrap">{LIBELLES.entite[a.entite] || a.entite}{a.entite_id ? ` n°${a.entite_id}` : ''}</span> },
                { titre: 'Anciennes → nouvelles valeurs', rendu: (a) => <Differences a={a} /> },
              ]}
              vide={<Vide icone={History} texte="Aucune opération enregistrée." />}
            />
            <Pagination page={d.page} pages={d.pages} total={d.total} onPage={(page) => setF({ ...f, page })} />
          </>
        )}
      </Etat>
    </Feuille>
  );
}

function Envois() {
  const [f, setF] = useState({ contexte: '', canal: '', page: 1 });
  const { donnees, chargement, erreur, recharger } = useDonnees(`/journal/envois${qs(f)}`);
  const [ouvert, setOuvert] = useState(null);
  return (
    <Feuille serre sousTitre="">
      <div className="filtres">
        <Champ label="Contexte">
          {(id) => (
            <select id={id} value={f.contexte} onChange={(e) => setF({ ...f, contexte: e.target.value, page: 1 })}>
              <option value="">Tous</option>
              <option value="paiement">Paiements</option>
              <option value="relance">Relances</option>
              <option value="message">Messages</option>
              <option value="annonce">Annonces</option>
              <option value="devoir">Devoirs</option>
              <option value="absence">Absences</option>
              <option value="identifiants">Identifiants</option>
            </select>
          )}
        </Champ>
        <Champ label="Canal">
          {(id) => (
            <select id={id} value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value, page: 1 })}>
              <option value="">Tous</option>
              <option value="messagerie">Messagerie interne</option>
              <option value="email">E-mail</option>
              <option value="push">Notification push</option>
            </select>
          )}
        </Champ>
        <span className="petit muet" style={{ alignSelf: 'center' }}>
          « Simulé » : aucun serveur d’e-mail n’est configuré, le contenu est conservé ici.
        </span>
      </div>
      <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
        {(d) => (
          <>
            <Tableau
              lignes={d.items}
              colonnes={[
                { titre: 'Date', rendu: (j) => <span className="nowrap petit">{dateHeure(j.created_at)}</span> },
                { titre: 'Destinataire', rendu: (j) => j.destinataire },
                { titre: 'Canal', rendu: (j) => ({ messagerie: 'Messagerie', email: 'E-mail', push: 'Push' })[j.canal] },
                { titre: 'Contexte', rendu: (j) => j.contexte },
                {
                  titre: 'Sujet',
                  rendu: (j) => (
                    <span>
                      {j.sujet}
                      {j.contenu && (
                        <button className="btn btn--fantome btn--petit" style={{ height: 24, marginLeft: 6 }} onClick={() => setOuvert(ouvert === j.id ? null : j.id)}>
                          {ouvert === j.id ? 'Masquer' : 'Contenu'}
                        </button>
                      )}
                      {ouvert === j.id && <span className="pre petit" style={{ display: 'block', marginTop: 6, padding: 10, background: '#f8fafc', borderRadius: 6 }}>{j.contenu}</span>}
                    </span>
                  ),
                },
                {
                  titre: 'Statut',
                  rendu: (j) => <Pastille ton={j.statut === 'envoye' ? 'vert' : j.statut === 'simule' ? 'jaune' : 'rouge'}>{j.statut === 'envoye' ? 'Envoyé' : j.statut === 'simule' ? 'Simulé' : 'Échec'}</Pastille>,
                },
              ]}
              vide={<Vide texte="Aucun envoi enregistré." />}
            />
            <Pagination page={d.page} pages={d.pages} total={d.total} onPage={(page) => setF({ ...f, page })} />
          </>
        )}
      </Etat>
    </Feuille>
  );
}

function Acces() {
  const [f, setF] = useState({ ressource: '', page: 1 });
  const { donnees, chargement, erreur, recharger } = useDonnees(`/journal/acces${qs(f)}`);
  return (
    <Feuille serre>
      <div className="filtres">
        <Champ label="Ressource">
          {(id) => (
            <select id={id} value={f.ressource} onChange={(e) => setF({ ressource: e.target.value, page: 1 })}>
              <option value="">Toutes</option>
              <option value="conversation">Historique des conversations</option>
              <option value="dossier_eleve">Dossiers élèves</option>
              <option value="export_rgpd">Exports RGPD</option>
            </select>
          )}
        </Champ>
      </div>
      <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
        {(d) => (
          <>
            <Tableau
              lignes={d.items}
              colonnes={[
                { titre: 'Date', rendu: (j) => <span className="nowrap petit">{dateHeure(j.created_at)}</span> },
                { titre: 'Qui', rendu: (j) => <span>{j.utilisateur} <span className="muet petit">({LIBELLES.role[j.utilisateur_role]})</span></span> },
                { titre: 'A consulté', rendu: (j) => ({ conversation: 'Conversation', dossier_eleve: 'Dossier élève', export_rgpd: 'Export RGPD' })[j.ressource] || j.ressource },
                { titre: 'Détail', rendu: (j) => j.detail || '—' },
                { titre: 'Adresse IP', rendu: (j) => <span className="petit muet">{j.ip || '—'}</span> },
              ]}
              vide={<Vide texte="Aucun accès enregistré." />}
            />
            <Pagination page={d.page} pages={d.pages} total={d.total} onPage={(page) => setF({ ...f, page })} />
          </>
        )}
      </Etat>
    </Feuille>
  );
}

export default function Journal() {
  const [onglet, setOnglet] = useState('audit');
  return (
    <>
      <PageTete
        titre="Journal d’activité"
        texte="Traçabilité : chaque création, modification ou suppression est enregistrée automatiquement par la base de données, avec les anciennes et nouvelles valeurs."
      />
      <Onglets
        actif={onglet}
        onChange={setOnglet}
        onglets={[
          { cle: 'audit', libelle: 'Modifications' },
          { cle: 'envois', libelle: 'Envois (messages, e-mails, push)' },
          { cle: 'acces', libelle: 'Consultations' },
        ]}
      />
      {onglet === 'audit' && <Audit />}
      {onglet === 'envois' && <Envois />}
      {onglet === 'acces' && <Acces />}
    </>
  );
}
