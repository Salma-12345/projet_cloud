// Matières et salles.
import { BookOpen, DoorOpen } from 'lucide-react';
import CrudPage from '../composants/CrudPage.jsx';
import { Pastille } from '../composants/ui.jsx';
import { NIVEAUX, nombre } from '../utils/format.js';

export default function Referentiels({ type }) {
  if (type === 'matieres') {
    return (
      <CrudPage
        key="matieres"
        titre="Matières"
        description="Le coefficient pondère la moyenne générale du bulletin. Une matière rattachée à des notes ou à un enseignant ne peut pas être supprimée."
        endpoint="/matieres"
        singulier="une matière"
        icone={BookOpen}
        initial={{ coefficient: 1, niveau: '' }}
        rechercheSur={['nom', 'niveau']}
        libelleSuppression={(m) => `« ${m.nom} »`}
        messageSuppression={(m) =>
          m.nb_notes || m.nb_affectations
            ? `Attention : ${m.nb_notes} note(s) et ${m.nb_affectations} affectation(s) y sont rattachées, la suppression sera refusée.`
            : 'Cette matière n’est utilisée nulle part.'
        }
        versFormulaire={(m) => ({ ...m, niveau: m.niveau || '' })}
        versApi={(v) => ({ ...v, niveau: v.niveau || null })}
        champs={[
          { nom: 'nom', label: 'Nom', requis: true },
          { nom: 'coefficient', label: 'Coefficient', type: 'number', requis: true, min: 0.5, max: 10, step: 0.5 },
          { nom: 'niveau', label: 'Niveau concerné', type: 'select', options: NIVEAUX.map((n) => ({ valeur: n, libelle: n })), placeholder: 'Tous les niveaux' },
        ]}
        colonnes={[
          { titre: 'Matière', rendu: (m) => <strong>{m.nom}</strong> },
          { titre: 'Coefficient', classe: 'num', rendu: (m) => nombre(m.coefficient) },
          { titre: 'Niveau', rendu: (m) => (m.niveau ? <Pastille ton="bleu">{m.niveau}</Pastille> : <span className="muet">Tous</span>) },
          { titre: 'Utilisation', rendu: (m) => <span className="petit muet">{m.nb_affectations} affectation(s), {m.nb_notes} note(s)</span> },
        ]}
      />
    );
  }
  return (
    <CrudPage
      key="salles"
      titre="Salles"
      description="Une salle indisponible ne peut pas recevoir de cours dans l’emploi du temps."
      endpoint="/salles"
      singulier="une salle"
      icone={DoorOpen}
      initial={{ capacite: 30, disponible: true }}
      rechercheSur={['nom', 'description']}
      libelleSuppression={(s) => `« ${s.nom} »`}
      messageSuppression={(s) => (s.nb_creneaux ? `Cette salle est utilisée dans ${s.nb_creneaux} créneau(x).` : 'Cette salle n’est utilisée dans aucun cours.')}
      champs={[
        { nom: 'nom', label: 'Nom', requis: true },
        { nom: 'capacite', label: 'Capacité (places)', type: 'number', requis: true, min: 1, max: 500 },
        { nom: 'description', label: 'Description', plein: true },
        { nom: 'disponible', label: 'Disponible pour les cours', type: 'checkbox', plein: true },
      ]}
      colonnes={[
        { titre: 'Salle', rendu: (s) => <strong>{s.nom}</strong> },
        { titre: 'Capacité', classe: 'num', rendu: (s) => `${s.capacite} places` },
        { titre: 'Disponibilité', rendu: (s) => (s.disponible ? <Pastille ton="vert">Disponible</Pastille> : <Pastille ton="rouge">Indisponible</Pastille>) },
        { titre: 'Description', rendu: (s) => s.description || <span className="muet">—</span> },
        { titre: 'Cours / semaine', classe: 'num', rendu: (s) => s.nb_creneaux },
      ]}
    />
  );
}
