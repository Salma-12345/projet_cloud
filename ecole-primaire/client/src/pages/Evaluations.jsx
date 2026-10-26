import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardList, PenLine } from 'lucide-react';
import { qs } from '../api.js';
import { useAuth } from '../contexte/Auth.jsx';
import { useDonnees } from '../utils/useDonnees.js';
import CrudPage from '../composants/CrudPage.jsx';
import { Champ, Pastille } from '../composants/ui.jsx';
import { LIBELLES, aujourdhuiIso, dateCourte, nombre } from '../utils/format.js';
import { trimestreCourant } from '../composants/Eleve.jsx';

export default function Evaluations() {
  const { role, annee, utilisateur, estAnneeCourante } = useAuth();
  const [params, setParams] = useSearchParams();
  const [filtres, setFiltres] = useState({ classe_id: params.get('classe_id') || '', trimestre: params.get('trimestre') || '' });
  const { donnees: classes } = useDonnees(`/classes${qs({ annee })}`);
  const { donnees: matieres } = useDonnees('/matieres');
  const { donnees: affectations } = useDonnees(`/affectations${qs({ annee, enseignant_id: role === 'enseignant' ? utilisateur.id : '' })}`);

  const classesPossibles = classes || [];
  const matieresPour = (classeId) => {
    const classe = classesPossibles.find((c) => String(c.id) === String(classeId));
    if (!classe) return [];
    const toutes = (matieres || []).filter((m) => !m.niveau || m.niveau === classe.niveau);
    if (role === 'admin' || classe.titulaire_id === utilisateur.id) return toutes;
    const ids = (affectations || []).filter((a) => String(a.classe_id) === String(classeId)).map((a) => a.matiere_id);
    return toutes.filter((m) => ids.includes(m.id));
  };

  const majFiltre = (cle, val) => {
    const f = { ...filtres, [cle]: val };
    setFiltres(f);
    setParams(Object.fromEntries(Object.entries(f).filter(([, x]) => x)), { replace: true });
  };

  return (
    <CrudPage
      key={`${filtres.classe_id}-${filtres.trimestre}-${annee}`}
      titre="Évaluations et notes"
      description="Créez une évaluation, puis saisissez les notes de la classe. Les moyennes et les bulletins sont recalculés automatiquement."
      endpoint="/evaluations"
      requete={qs({ annee, classe_id: filtres.classe_id, trimestre: filtres.trimestre })}
      singulier="une évaluation"
      icone={ClipboardList}
      peutCreer={estAnneeCourante}
      initial={{ type: 'controle_continu', trimestre: String(trimestreCourant()), date_evaluation: aujourdhuiIso(), bareme: 20, classe_id: filtres.classe_id }}
      rechercheSur={['titre', 'matiere', 'classe']}
      libelleSuppression={(e) => `« ${e.titre} »`}
      messageSuppression={(e) => (e.nb_notes ? `${e.nb_notes} note(s) ont déjà été saisies pour cette évaluation.` : 'Aucune note n’a encore été saisie.')}
      versFormulaire={(e) => ({ ...e, classe_id: String(e.classe_id), matiere_id: String(e.matiere_id), trimestre: String(e.trimestre) })}
      champs={[
        { nom: 'titre', label: 'Titre', requis: true, plein: true, placeholder: 'Ex. Contrôle n°3 — Les fractions' },
        { nom: 'classe_id', label: 'Classe', type: 'select', requis: true, options: classesPossibles.map((c) => ({ valeur: String(c.id), libelle: c.nom })) },
        { nom: 'matiere_id', label: 'Matière', type: 'select', requis: true, options: (v) => matieresPour(v.classe_id).map((m) => ({ valeur: String(m.id), libelle: m.nom })) },
        { nom: 'type', label: 'Type', type: 'select', requis: true, options: Object.entries(LIBELLES.typeEval).map(([k, l]) => ({ valeur: k, libelle: l })) },
        { nom: 'trimestre', label: 'Trimestre', type: 'select', requis: true, options: [1, 2, 3].map((t) => ({ valeur: String(t), libelle: `Trimestre ${t}` })) },
        { nom: 'date_evaluation', label: 'Date', type: 'date', requis: true },
        { nom: 'bareme', label: 'Noté sur', type: 'number', requis: true, min: 1, max: 100, aide: 'Les notes sont ramenées sur 20 pour les moyennes.' },
      ]}
      filtres={
        <div className="filtres">
          <Champ label="Classe">
            {(id) => (
              <select id={id} value={filtres.classe_id} onChange={(e) => majFiltre('classe_id', e.target.value)}>
                <option value="">Toutes</option>
                {classesPossibles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            )}
          </Champ>
          <Champ label="Trimestre">
            {(id) => (
              <select id={id} value={filtres.trimestre} onChange={(e) => majFiltre('trimestre', e.target.value)}>
                <option value="">Tous</option>
                {[1, 2, 3].map((t) => (
                  <option key={t} value={t}>
                    Trimestre {t}
                  </option>
                ))}
              </select>
            )}
          </Champ>
        </div>
      }
      actionsLigne={(e) => (
        <Link className={`btn btn--petit ${e.nb_notes < e.effectif ? 'btn--primaire' : 'btn--secondaire'}`} to={`/evaluations/${e.id}`}>
          <PenLine size={15} aria-hidden="true" /> {e.nb_notes < e.effectif ? 'Saisir les notes' : 'Voir les notes'}
        </Link>
      )}
      colonnes={[
        { titre: 'Date', rendu: (e) => <span className="nowrap">{dateCourte(e.date_evaluation)}</span> },
        {
          titre: 'Évaluation',
          rendu: (e) => (
            <span>
              <span className="gras" style={{ display: 'block' }}>
                {e.titre}
              </span>
              <span className="petit muet">
                {e.classe}, {e.matiere}
              </span>
            </span>
          ),
        },
        { titre: 'Type', rendu: (e) => <Pastille ton={e.type === 'examen' ? 'violet' : 'gris'}>{LIBELLES.typeEval[e.type]}</Pastille> },
        { titre: 'Trim.', rendu: (e) => `T${e.trimestre}` },
        {
          titre: 'Notes saisies',
          rendu: (e) => (e.nb_notes >= e.effectif ? <Pastille ton="vert">{e.nb_notes}/{e.effectif}</Pastille> : <Pastille ton="jaune">{e.nb_notes}/{e.effectif}</Pastille>),
        },
        { titre: 'Moyenne /20', classe: 'num', rendu: (e) => <strong>{nombre(e.moyenne_sur_20)}</strong> },
      ]}
    />
  );
}
