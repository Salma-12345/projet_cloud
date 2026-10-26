import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Save } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../contexte/Auth.jsx';
import { useRetours } from '../contexte/Retours.jsx';
import { useDonnees } from '../utils/useDonnees.js';
import { Bouton, Encart, Etat, Feuille, NoteManuscrite, PageTete, Pastille } from '../composants/ui.jsx';
import { LIBELLES, date, nombre } from '../utils/format.js';

export default function SaisieNotes() {
  const { id } = useParams();
  const { estAnneeCourante } = useAuth();
  const { succes } = useRetours();
  const { donnees, chargement, erreur, recharger } = useDonnees(`/evaluations/${id}/notes`);
  const [saisies, setSaisies] = useState({});
  const [envoi, setEnvoi] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState(null);
  const champs = useRef({});

  useEffect(() => {
    if (!donnees) return;
    const s = {};
    for (const l of donnees.lignes) s[l.eleve_id] = { valeur: l.valeur === null ? '' : String(l.valeur).replace('.', ','), commentaire: l.commentaire || '' };
    setSaisies(s);
  }, [donnees]);

  const bareme = donnees ? donnees.evaluation.bareme : 20;
  const valeurs = useMemo(
    () =>
      Object.values(saisies)
        .map((s) => Number(String(s.valeur).replace(',', '.')))
        .filter((v, i) => String(Object.values(saisies)[i].valeur).trim() !== '' && Number.isFinite(v)),
    [saisies]
  );
  const invalide = (v) => {
    if (String(v).trim() === '') return false;
    const n = Number(String(v).replace(',', '.'));
    return !Number.isFinite(n) || n < 0 || n > bareme;
  };
  const nbInvalides = Object.values(saisies).filter((s) => invalide(s.valeur)).length;
  const moyenne = valeurs.length ? (valeurs.reduce((a, b) => a + b, 0) / valeurs.length / bareme) * 20 : null;
  const modifie = donnees && donnees.lignes.some((l) => {
    const s = saisies[l.eleve_id];
    if (!s) return false;
    const avant = l.valeur === null ? '' : String(l.valeur).replace('.', ',');
    return s.valeur.trim() !== avant || (s.commentaire || '') !== (l.commentaire || '');
  });

  const enregistrer = async () => {
    setEnvoi(true);
    setErreurEnvoi(null);
    try {
      const notes = Object.entries(saisies).map(([eleveId, s]) => ({
        eleve_id: Number(eleveId),
        valeur: s.valeur.trim() === '' ? null : s.valeur.trim(),
        commentaire: s.commentaire.trim() || null,
      }));
      const r = await api.put(`/evaluations/${id}/notes`, { notes });
      succes(r.modifiees ? `${r.modifiees} note(s) enregistrée(s). Les moyennes sont à jour.` : 'Aucune modification.');
      recharger();
    } catch (e) {
      setErreurEnvoi(e.message);
    } finally {
      setEnvoi(false);
    }
  };

  const suivant = (index) => (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const ids = donnees.lignes.map((l) => l.eleve_id);
      const prochain = champs.current[ids[index + 1]];
      if (prochain) prochain.focus();
      else enregistrer();
    }
  };

  return (
    <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
      {({ evaluation: ev, lignes }) => (
        <>
          <PageTete
            titre={ev.titre}
            texte={`${ev.classe}, ${ev.matiere} (coef. ${nombre(ev.coefficient)}). ${LIBELLES.typeEval[ev.type]} du ${date(ev.date_evaluation)}, trimestre ${ev.trimestre}, noté sur ${nombre(ev.bareme)}.`}
            retour={{ to: `/evaluations?classe_id=${ev.classe_id}`, libelle: 'Évaluations' }}
            actions={
              estAnneeCourante && (
                <Bouton variante="primaire" icone={Save} onClick={enregistrer} chargement={envoi} disabled={nbInvalides > 0 || !modifie}>
                  Enregistrer les notes
                </Bouton>
              )
            }
          />
          <div className="grille-principale">
            <Feuille serre titre="Notes de la classe" sousTitre="Laissez une case vide pour un élève absent ou non évalué. Entrée : élève suivant.">
              {erreurEnvoi && (
                <div style={{ padding: '12px 20px 0' }}>
                  <Encart ton="alerte">{erreurEnvoi}</Encart>
                </div>
              )}
              <div className="tableau-conteneur">
                <table className="tableau">
                  <thead>
                    <tr>
                      <th scope="col">Élève</th>
                      <th scope="col" className="num">
                        Note /{nombre(ev.bareme)}
                      </th>
                      <th scope="col">Commentaire</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l, i) => {
                      const s = saisies[l.eleve_id] || { valeur: '', commentaire: '' };
                      const err = invalide(s.valeur);
                      return (
                        <tr key={l.eleve_id}>
                          <td>
                            <label htmlFor={`note-${l.eleve_id}`} className="gras">
                              {l.nom} {l.prenom}
                            </label>
                          </td>
                          <td className="num">
                            <input
                              id={`note-${l.eleve_id}`}
                              ref={(el) => (champs.current[l.eleve_id] = el)}
                              className="saisie saisie-note"
                              inputMode="decimal"
                              value={s.valeur}
                              disabled={!estAnneeCourante}
                              aria-invalid={err}
                              style={err ? { borderColor: 'var(--marge)' } : undefined}
                              onChange={(e) => setSaisies({ ...saisies, [l.eleve_id]: { ...s, valeur: e.target.value } })}
                              onKeyDown={suivant(i)}
                              placeholder="—"
                            />
                          </td>
                          <td>
                            <input
                              className="saisie"
                              value={s.commentaire}
                              disabled={!estAnneeCourante}
                              aria-label={`Commentaire pour ${l.prenom}`}
                              onChange={(e) => setSaisies({ ...saisies, [l.eleve_id]: { ...s, commentaire: e.target.value } })}
                              placeholder="Facultatif"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Feuille>
            <div className="pile">
              <Feuille titre="Bilan de l’évaluation">
                <div style={{ display: 'grid', justifyItems: 'start', gap: 14 }}>
                  {moyenne === null ? (
                    <p className="muet">Aucune note saisie pour l’instant.</p>
                  ) : (
                    <>
                      <NoteManuscrite valeur={Math.round(moyenne * 100) / 100} taille="grande" />
                      <span className="petit muet">moyenne de la classe (sur 20)</span>
                    </>
                  )}
                  <dl className="definitions">
                    <dt>Notes saisies</dt>
                    <dd>
                      {valeurs.length} / {lignes.length}
                    </dd>
                    <dt>Plus haute</dt>
                    <dd>{valeurs.length ? nombre(Math.max(...valeurs)) : '—'}</dd>
                    <dt>Plus basse</dt>
                    <dd>{valeurs.length ? nombre(Math.min(...valeurs)) : '—'}</dd>
                    <dt>Sous la moyenne</dt>
                    <dd>{valeurs.filter((v) => (v / bareme) * 20 < 10).length} élève(s)</dd>
                  </dl>
                  {nbInvalides > 0 && <Pastille ton="rouge">{nbInvalides} note(s) hors barème</Pastille>}
                  {modifie && !nbInvalides && <Pastille ton="jaune">Modifications non enregistrées</Pastille>}
                </div>
              </Feuille>
            </div>
          </div>
        </>
      )}
    </Etat>
  );
}
