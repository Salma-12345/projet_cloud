import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { api, qs } from '../api.js';
import { useAuth } from '../contexte/Auth.jsx';
import { useRetours } from '../contexte/Retours.jsx';
import { useDonnees } from '../utils/useDonnees.js';
import Edt from '../composants/Edt.jsx';
import { Bouton, Champ, Encart, Etat, Feuille, Modale, PageTete } from '../composants/ui.jsx';
import { JOURS } from '../utils/format.js';

function ModaleCreneau({ initial, classes, onFermer, onTermine }) {
  const { annee } = useAuth();
  const { confirmer } = useRetours();
  const { donnees: matieres } = useDonnees('/matieres');
  const { donnees: enseignants } = useDonnees('/utilisateurs?role=enseignant');
  const { donnees: salles } = useDonnees('/salles');
  const { donnees: affectations } = useDonnees(`/affectations${qs({ annee })}`);
  const [v, setV] = useState(initial);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const classe = classes.find((c) => String(c.id) === String(v.classe_id));
  const matieresClasse = (matieres || []).filter((m) => !classe || !m.niveau || m.niveau === classe.niveau);

  const choisirMatiere = (matiereId) => {
    const a = (affectations || []).find((x) => String(x.classe_id) === String(v.classe_id) && String(x.matiere_id) === String(matiereId));
    setV({ ...v, matiere_id: matiereId, enseignant_id: a ? String(a.enseignant_id) : v.enseignant_id });
  };

  const envoyer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    const corps = { ...v, salle_id: v.salle_id || null };
    try {
      if (v.id) await api.put(`/creneaux/${v.id}`, corps);
      else await api.post('/creneaux', corps);
      onTermine(v.id ? 'Créneau modifié.' : 'Créneau ajouté.');
    } catch (err) {
      setErreur(err);
    } finally {
      setEnvoi(false);
    }
  };

  const supprimer = async () => {
    if (!(await confirmer({ titre: 'Supprimer ce créneau ?', message: `${JOURS[v.jour]} ${v.heure_debut}–${v.heure_fin}`, libelle: 'Supprimer', danger: true }))) return;
    await api.del(`/creneaux/${v.id}`);
    onTermine('Créneau supprimé.');
  };

  return (
    <Modale
      titre={v.id ? 'Modifier le créneau' : 'Ajouter un créneau'}
      sousTitre="Les conflits (enseignant, salle ou classe déjà occupés) sont détectés à l’enregistrement."
      onFermer={onFermer}
      pied={
        <>
          {v.id && (
            <Bouton variante="danger" icone={Trash2} onClick={supprimer} style={{ marginRight: 'auto' }}>
              Supprimer
            </Bouton>
          )}
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" form="form-creneau" variante="primaire" chargement={envoi}>
            Enregistrer
          </Bouton>
        </>
      }
    >
      <form id="form-creneau" onSubmit={envoyer} style={{ display: 'grid', gap: 16 }}>
        {erreur && (
          <Encart ton="alerte">
            {erreur.donnees.conflits && erreur.donnees.conflits.length ? (
              <>
                <strong>Conflit d’emploi du temps</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {erreur.donnees.conflits.map((c, i) => (
                    <li key={i}>{c.message}</li>
                  ))}
                </ul>
              </>
            ) : (
              erreur.message
            )}
          </Encart>
        )}
        <div className="grille-form">
          <Champ label="Classe" requis>
            {(id) => (
              <select id={id} value={v.classe_id} onChange={(e) => setV({ ...v, classe_id: e.target.value, matiere_id: '', enseignant_id: '' })} required>
                <option value="" disabled>
                  Choisir…
                </option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            )}
          </Champ>
          <Champ label="Matière" requis>
            {(id) => (
              <select id={id} value={v.matiere_id} onChange={(e) => choisirMatiere(e.target.value)} required>
                <option value="" disabled>
                  Choisir…
                </option>
                {matieresClasse.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nom}
                    {m.niveau ? ` (${m.niveau})` : ''}
                  </option>
                ))}
              </select>
            )}
          </Champ>
          <Champ label="Enseignant" requis aide="Rempli automatiquement selon l’affectation de la matière.">
            {(id) => (
              <select id={id} value={v.enseignant_id} onChange={(e) => setV({ ...v, enseignant_id: e.target.value })} required>
                <option value="" disabled>
                  Choisir…
                </option>
                {(enseignants || []).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.prenom} {x.nom}
                  </option>
                ))}
              </select>
            )}
          </Champ>
          <Champ label="Salle">
            {(id) => (
              <select id={id} value={v.salle_id || ''} onChange={(e) => setV({ ...v, salle_id: e.target.value })}>
                <option value="">Sans salle</option>
                {(salles || []).map((s) => (
                  <option key={s.id} value={s.id} disabled={!s.disponible}>
                    {s.nom} ({s.capacite} places){s.disponible ? '' : ' — indisponible'}
                  </option>
                ))}
              </select>
            )}
          </Champ>
          <Champ label="Jour" requis>
            {(id) => (
              <select id={id} value={v.jour} onChange={(e) => setV({ ...v, jour: Number(e.target.value) })}>
                {JOURS.slice(1).map((j, i) => (
                  <option key={j} value={i + 1}>
                    {j}
                  </option>
                ))}
              </select>
            )}
          </Champ>
          <div className="grille-form" style={{ gap: 12 }}>
            <Champ label="Début" requis>
              {(id) => <input id={id} type="time" value={v.heure_debut} onChange={(e) => setV({ ...v, heure_debut: e.target.value })} step="900" required />}
            </Champ>
            <Champ label="Fin" requis>
              {(id) => <input id={id} type="time" value={v.heure_fin} onChange={(e) => setV({ ...v, heure_fin: e.target.value })} step="900" required />}
            </Champ>
          </div>
        </div>
      </form>
    </Modale>
  );
}

export default function EmploiDuTemps() {
  const { role, annee, utilisateur, estAnneeCourante } = useAuth();
  const [params, setParams] = useSearchParams();
  const { succes } = useRetours();
  const personnel = ['admin', 'comptable', 'enseignant'].includes(role);
  const { donnees: classes } = useDonnees(personnel ? `/classes${qs({ annee, toutes: 1 })}` : null);
  const { donnees: enseignants } = useDonnees(role === 'admin' || role === 'comptable' ? '/utilisateurs?role=enseignant' : null);
  const { donnees: salles } = useDonnees(personnel ? '/salles' : null);

  const parDefaut = role === 'enseignant' ? 'enseignant' : 'classe';
  const vue = params.get('vue') || (params.get('enseignant_id') ? 'enseignant' : params.get('salle_id') ? 'salle' : parDefaut);
  const [enfant, setEnfant] = useState(role === 'parent' && utilisateur.enfants.length ? String(utilisateur.enfants[0].id) : '');

  const selection = params.get(`${vue}_id`) || '';
  useEffect(() => {
    if (!personnel || selection) return;
    // Sélection par défaut
    if (vue === 'enseignant' && role === 'enseignant') setParams({ vue, enseignant_id: String(utilisateur.id) }, { replace: true });
    else if (vue === 'classe' && classes && classes.length) setParams({ vue, classe_id: String(classes[0].id) }, { replace: true });
  }, [personnel, selection, vue, classes, role, utilisateur.id, setParams]);

  const chemin = useMemo(() => {
    if (role === 'eleve') return '/creneaux';
    if (role === 'parent') {
      const e = utilisateur.enfants.find((x) => String(x.id) === enfant);
      return e && e.classe_id ? `/creneaux?classe_id=${e.classe_id}` : null;
    }
    return selection ? `/creneaux${qs({ annee, [`${vue}_id`]: selection })}` : null;
  }, [role, utilisateur, enfant, selection, vue, annee]);
  const { donnees, chargement, erreur, recharger } = useDonnees(chemin);
  const [edition, setEdition] = useState(null);
  const modifiable = role === 'admin' && estAnneeCourante && vue === 'classe';

  const listeSelection = vue === 'classe' ? (classes || []).map((c) => ({ id: c.id, nom: c.nom })) : vue === 'enseignant' ? (role === 'enseignant' ? [{ id: utilisateur.id, nom: `${utilisateur.prenom} ${utilisateur.nom} (moi)` }] : (enseignants || []).map((e) => ({ id: e.id, nom: `${e.prenom} ${e.nom}` }))) : (salles || []).map((s) => ({ id: s.id, nom: s.nom }));

  return (
    <>
      <PageTete
        titre="Emploi du temps"
        texte={personnel ? 'Vue par classe, par enseignant ou par salle. Un enseignant ou une salle ne peut pas avoir deux cours en même temps.' : 'Les cours de la semaine.'}
        actions={
          modifiable && (
            <Bouton variante="primaire" icone={Plus} onClick={() => setEdition({ classe_id: selection, matiere_id: '', enseignant_id: '', salle_id: '', jour: 1, heure_debut: '08:00', heure_fin: '09:00' })}>
              Ajouter un créneau
            </Bouton>
          )
        }
      />
      <Feuille serre>
        {personnel && (
          <div className="filtres">
            <Champ label="Afficher">
              {(id) => (
                <select id={id} value={vue} onChange={(e) => setParams({ vue: e.target.value }, { replace: true })}>
                  <option value="classe">Par classe</option>
                  <option value="enseignant">Par enseignant</option>
                  <option value="salle">Par salle</option>
                </select>
              )}
            </Champ>
            <Champ label={vue === 'classe' ? 'Classe' : vue === 'enseignant' ? 'Enseignant' : 'Salle'}>
              {(id) => (
                <select id={id} value={selection} onChange={(e) => setParams({ vue, [`${vue}_id`]: e.target.value }, { replace: true })}>
                  <option value="" disabled>
                    Choisir…
                  </option>
                  {listeSelection.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nom}
                    </option>
                  ))}
                </select>
              )}
            </Champ>
            {modifiable && <span className="petit muet" style={{ alignSelf: 'center' }}>Cliquez sur une case vide pour ajouter un cours, ou sur un cours pour le modifier.</span>}
          </div>
        )}
        {role === 'parent' && utilisateur.enfants.length > 1 && (
          <div className="filtres">
            <Champ label="Enfant">
              {(id) => (
                <select id={id} value={enfant} onChange={(e) => setEnfant(e.target.value)}>
                  {utilisateur.enfants.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.prenom} ({e.classe || 'sans classe'})
                    </option>
                  ))}
                </select>
              )}
            </Champ>
          </div>
        )}
        <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
          {(liste) => (
            <Edt
              creneaux={liste}
              mode={vue}
              onCreneau={modifiable ? (c) => setEdition({ ...c, classe_id: String(c.classe_id), matiere_id: String(c.matiere_id), enseignant_id: String(c.enseignant_id), salle_id: c.salle_id ? String(c.salle_id) : '' }) : undefined}
              onVide={
                modifiable
                  ? (jour, debut) => {
                      const fin = `${String(Number(debut.slice(0, 2)) + 1).padStart(2, '0')}:00`;
                      setEdition({ classe_id: selection, matiere_id: '', enseignant_id: '', salle_id: '', jour, heure_debut: debut, heure_fin: fin });
                    }
                  : undefined
              }
            />
          )}
        </Etat>
      </Feuille>
      {edition && (
        <ModaleCreneau
          initial={edition}
          classes={classes || []}
          onFermer={() => setEdition(null)}
          onTermine={(msg) => {
            setEdition(null);
            succes(msg);
            recharger();
          }}
        />
      )}
    </>
  );
}
