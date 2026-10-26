// Comptes : enseignants, parents, personnel administratif.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, UserCog, Users } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../contexte/Auth.jsx';
import { useRetours } from '../contexte/Retours.jsx';
import CrudPage from '../composants/CrudPage.jsx';
import Identifiants from '../composants/Identifiants.jsx';
import { Bouton, Modale, Onglets, Pastille } from '../composants/ui.jsx';
import { relatif } from '../utils/format.js';

const champsBase = [
  { nom: 'prenom', label: 'Prénom', requis: true },
  { nom: 'nom', label: 'Nom', requis: true },
  { nom: 'email', label: 'E-mail (identifiant)', type: 'email', requis: true },
  { nom: 'telephone', label: 'Téléphone', type: 'tel' },
];

function useIdentifiants() {
  const [liste, setListe] = useState(null);
  const { utilisateur } = useAuth();
  const modale = liste && (
    <Modale
      titre="Identifiants du compte"
      onFermer={() => setListe(null)}
      pied={
        <Bouton variante="primaire" onClick={() => setListe(null)}>
          Terminer
        </Bouton>
      }
    >
      <Identifiants liste={liste} emailActif={utilisateur.email_actif} />
    </Modale>
  );
  return { montrer: setListe, modale };
}

function BoutonReinit({ u, montrer }) {
  const { confirmer, erreur } = useRetours();
  return (
    <Bouton
      petit
      variante="fantome"
      icone={KeyRound}
      title="Nouveau mot de passe"
      aria-label={`Générer un nouveau mot de passe pour ${u.prenom} ${u.nom}`}
      onClick={async () => {
        if (!(await confirmer({ titre: 'Générer un nouveau mot de passe ?', message: `Un mot de passe provisoire sera créé pour ${u.prenom} ${u.nom} (et envoyé par e-mail). L’ancien ne fonctionnera plus.`, libelle: 'Générer' }))) return;
        try {
          const r = await api.post(`/utilisateurs/${u.id}/reinitialiser-mot-de-passe`);
          montrer([{ role: u.role, nom: `${u.prenom} ${u.nom}`, ...r.identifiants }]);
        } catch (e) {
          erreur(e);
        }
      }}
    />
  );
}

const statut = (u) => (u.actif ? <Pastille ton="vert">Actif</Pastille> : <Pastille ton="rouge">Désactivé</Pastille>);

function Enseignants() {
  const { montrer, modale } = useIdentifiants();
  return (
    <>
      <CrudPage
        titre="Enseignants"
        description="Comptes des enseignants et matières qui leur sont confiées. Les affectations se gèrent depuis la fiche de chaque classe."
        endpoint="/utilisateurs"
        requete="?role=enseignant"
        singulier="un enseignant"
        icone={Users}
        initial={{ actif: true }}
        rechercheSur={['nom', 'prenom', 'email', 'specialite']}
        libelleSuppression={(u) => `${u.prenom} ${u.nom}`}
        messageSuppression={(u) => (u.affectations.length ? `${u.prenom} ${u.nom} a ${u.affectations.length} affectation(s) en cours.` : 'Le compte sera désactivé et retiré des listes.')}
        versApi={(v) => ({ ...v, role: 'enseignant' })}
        apresCreation={(r) => montrer([{ role: 'enseignant', nom: `${r.utilisateur.prenom} ${r.utilisateur.nom}`, ...r.identifiants }])}
        actionsLigne={(u) => <BoutonReinit u={u} montrer={montrer} />}
        champs={[...champsBase, { nom: 'specialite', label: 'Spécialité', plein: true }, { nom: 'actif', label: 'Compte actif', type: 'checkbox', plein: true }]}
        colonnes={[
          {
            titre: 'Enseignant',
            rendu: (u) => (
              <span>
                <span className="gras" style={{ display: 'block' }}>
                  {u.prenom} {u.nom}
                </span>
                <span className="petit muet">{u.specialite || '—'}</span>
              </span>
            ),
          },
          {
            titre: 'Enseigne',
            rendu: (u) =>
              u.affectations.length ? (
                <span className="groupe-btn" style={{ gap: 4 }}>
                  {u.titulaire_de && <Pastille ton="bleu">Titulaire {u.titulaire_de}</Pastille>}
                  {[...new Set(u.affectations.map((a) => a.matiere))].map((m) => (
                    <Pastille key={m}>
                      {m} ({u.affectations.filter((a) => a.matiere === m).map((a) => a.classe).join(', ')})
                    </Pastille>
                  ))}
                </span>
              ) : (
                <span className="muet petit">Aucune affectation</span>
              ),
          },
          { titre: 'Contact', rendu: (u) => <span className="petit">{u.email}<br />{u.telephone || ''}</span> },
          { titre: 'Statut', rendu: statut },
        ]}
      />
      {modale}
    </>
  );
}

function Parents() {
  const { montrer, modale } = useIdentifiants();
  return (
    <>
      <CrudPage
        titre="Parents"
        description="Comptes des responsables légaux. Le lien avec un enfant se fait depuis le dossier de l’élève ou lors de l’inscription."
        endpoint="/utilisateurs"
        requete="?role=parent"
        singulier="un parent"
        icone={Users}
        initial={{ actif: true }}
        rechercheSur={['nom', 'prenom', 'email', 'telephone', (u) => u.enfants.map((e) => e.nom).join(' ')]}
        libelleSuppression={(u) => `${u.prenom} ${u.nom}`}
        messageSuppression={(u) => (u.enfants.length ? `Ce parent est rattaché à ${u.enfants.length} enfant(s).` : 'Le compte sera désactivé.')}
        versApi={(v) => ({ ...v, role: 'parent' })}
        apresCreation={(r) => montrer([{ role: 'parent', nom: `${r.utilisateur.prenom} ${r.utilisateur.nom}`, ...r.identifiants }])}
        actionsLigne={(u) => <BoutonReinit u={u} montrer={montrer} />}
        champs={[...champsBase, { nom: 'adresse', label: 'Adresse', plein: true }, { nom: 'actif', label: 'Compte actif', type: 'checkbox', plein: true }]}
        colonnes={[
          { titre: 'Parent', rendu: (u) => <strong>{u.prenom} {u.nom}</strong> },
          {
            titre: 'Enfants',
            rendu: (u) =>
              u.enfants.length ? (
                <span className="groupe-btn" style={{ gap: 4 }}>
                  {u.enfants.map((e) => (
                    <Link key={e.id} to={`/eleves/${e.id}`} className="pastille pastille--bleu" style={{ textDecoration: 'none' }}>
                      {e.nom} ({e.classe || 'sans classe'})
                    </Link>
                  ))}
                </span>
              ) : (
                <span className="muet petit">Aucun</span>
              ),
          },
          { titre: 'Contact', rendu: (u) => <span className="petit">{u.email}<br />{u.telephone || ''}</span> },
          { titre: 'Dernière connexion', rendu: (u) => <span className="petit muet">{u.derniere_connexion ? relatif(u.derniere_connexion) : 'Jamais'}</span> },
          { titre: 'Statut', rendu: statut },
        ]}
      />
      {modale}
    </>
  );
}

function Personnel() {
  const [role, setRole] = useState('comptable');
  const { montrer, modale } = useIdentifiants();
  return (
    <>
      <CrudPage
        key={role}
        titre="Personnel administratif"
        description="Comptes de la direction (accès complet) et de la comptabilité / secrétariat (finances et inscriptions)."
        filtres={
          <Onglets
            actif={role}
            onChange={setRole}
            onglets={[
              { cle: 'comptable', libelle: 'Comptabilité et secrétariat' },
              { cle: 'admin', libelle: 'Direction' },
            ]}
          />
        }
        endpoint="/utilisateurs"
        requete={`?role=${role}`}
        singulier="un compte"
        icone={UserCog}
        initial={{ actif: true }}
        rechercheSur={['nom', 'prenom', 'email']}
        libelleSuppression={(u) => `${u.prenom} ${u.nom}`}
        versApi={(v) => ({ ...v, role })}
        apresCreation={(r) => montrer([{ role, nom: `${r.utilisateur.prenom} ${r.utilisateur.nom}`, ...r.identifiants }])}
        actionsLigne={(u) => <BoutonReinit u={u} montrer={montrer} />}
        champs={[...champsBase, { nom: 'actif', label: 'Compte actif', type: 'checkbox', plein: true }]}
        colonnes={[
          { titre: 'Nom', rendu: (u) => <strong>{u.prenom} {u.nom}</strong> },
          { titre: 'E-mail', cle: 'email' },
          { titre: 'Téléphone', rendu: (u) => u.telephone || '—' },
          { titre: 'Dernière connexion', rendu: (u) => <span className="petit muet">{u.derniere_connexion ? relatif(u.derniere_connexion) : 'Jamais'}</span> },
          { titre: 'Statut', rendu: statut },
        ]}
      />
      {modale}
    </>
  );
}

export default function Personnes({ role }) {
  if (role === 'enseignant') return <Enseignants />;
  if (role === 'parent') return <Parents />;
  return <Personnel />;
}
