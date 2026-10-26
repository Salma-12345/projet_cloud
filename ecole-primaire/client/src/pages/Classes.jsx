import { Link } from 'react-router-dom';
import { School } from 'lucide-react';
import { qs } from '../api.js';
import { useAuth } from '../contexte/Auth.jsx';
import { useDonnees } from '../utils/useDonnees.js';
import CrudPage from '../composants/CrudPage.jsx';
import { Etat, Feuille, Jauge, PageTete, Pastille, Vide } from '../composants/ui.jsx';
import { NIVEAUX } from '../utils/format.js';

function MesClasses() {
  const { annee } = useAuth();
  const { donnees, chargement, erreur, recharger } = useDonnees(`/classes${qs({ annee })}`);
  return (
    <>
      <PageTete titre="Mes classes" texte="Classes dont vous êtes titulaire ou dans lesquelles vous enseignez une matière." />
      <Feuille serre>
        <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
          {(liste) =>
            liste.length ? (
              <ul className="liste-reglee">
                {liste.map((c) => (
                  <li key={c.id}>
                    <Link to={`/classes/${c.id}`} className="liste-reglee__lien">
                      <span className="gras" style={{ width: 70, fontSize: 'var(--t-md)' }}>
                        {c.nom}
                      </span>
                      <span className="liste-reglee__principal">
                        <span className="liste-reglee__meta">Titulaire : {c.titulaire || '—'}</span>
                      </span>
                      <span className="petit muet">{c.effectif} élèves</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Vide icone={School} titre="Aucune classe" texte="Aucune classe ne vous est affectée pour cette année." />
            )
          }
        </Etat>
      </Feuille>
    </>
  );
}

export default function Classes() {
  const { role, annee, estAnneeCourante } = useAuth();
  const { donnees: enseignants } = useDonnees(role === 'admin' ? '/utilisateurs?role=enseignant' : null);
  if (role === 'enseignant') return <MesClasses />;
  const optionsEnseignants = (enseignants || []).map((e) => ({ valeur: e.id, libelle: `${e.prenom} ${e.nom}` }));
  return (
    <CrudPage
      titre="Classes"
      description={`Classes de l’année ${annee}. Une classe contenant des élèves ne peut être supprimée qu’après réaffectation ou confirmation.`}
      endpoint="/classes"
      requete={qs({ annee })}
      singulier="une classe"
      icone={School}
      peutCreer={estAnneeCourante}
      initial={{ niveau: '', section: 'A', capacite_max: 26 }}
      rechercheSur={['nom', 'titulaire']}
      libelleSuppression={(c) => `la classe ${c.nom}`}
      messageSuppression={(c) => (c.effectif ? `La classe contient ${c.effectif} élève(s).` : 'La classe est vide et peut être supprimée.')}
      versApi={(v) => ({ ...v, titulaire_id: v.titulaire_id || null, annee_scolaire: annee })}
      champs={[
        { nom: 'niveau', label: 'Niveau', type: 'select', requis: true, options: NIVEAUX.map((n) => ({ valeur: n, libelle: n })) },
        { nom: 'section', label: 'Section', requis: true, aide: 'Lettre de la classe : A, B, C…' },
        { nom: 'capacite_max', label: 'Capacité maximale', type: 'number', requis: true, min: 1, max: 60 },
        { nom: 'titulaire_id', label: 'Enseignant titulaire', type: 'select', options: optionsEnseignants, placeholder: 'Aucun pour l’instant' },
      ]}
      colonnes={[
        { titre: 'Classe', rendu: (c) => <Link to={`/classes/${c.id}`} className="gras">{c.nom}</Link> },
        { titre: 'Titulaire', rendu: (c) => c.titulaire || <span className="muet">Non désigné</span> },
        {
          titre: 'Effectif',
          rendu: (c) => (
            <div style={{ display: 'grid', gap: 6, minWidth: 140 }}>
              <span className="petit">
                {c.effectif} / {c.capacite_max} élèves {c.effectif >= c.capacite_max && <Pastille ton="rouge">Complète</Pastille>}
              </span>
              <Jauge valeur={c.effectif} max={c.capacite_max} libelle={`Effectif ${c.nom}`} />
            </div>
          ),
        },
      ]}
    />
  );
}
