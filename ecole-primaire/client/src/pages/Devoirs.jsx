import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { NotebookPen, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, formulaire, qs } from '../api.js';
import { useAuth } from '../contexte/Auth.jsx';
import { useRetours, useSuppression } from '../contexte/Retours.jsx';
import { useDonnees } from '../utils/useDonnees.js';
import { Bouton, Champ, Encart, Etat, Feuille, Modale, NoteManuscrite, PageTete, Pastille, Tableau, Vide } from '../composants/ui.jsx';
import { ListeFichiers, SelecteurFichiers } from '../composants/Fichiers.jsx';
import { LIBELLES, TONS_SOUMISSION, dateHeure, echeance, versDatetimeLocal } from '../utils/format.js';

export function ModaleDevoir({ devoir, onFermer, onTermine }) {
  const { role, annee, utilisateur } = useAuth();
  const { donnees: classes } = useDonnees(`/classes${qs({ annee })}`);
  const { donnees: matieres } = useDonnees('/matieres');
  const { donnees: affectations } = useDonnees(`/affectations${qs({ annee, enseignant_id: role === 'enseignant' ? utilisateur.id : '' })}`);
  const { donnees: detail } = useDonnees(devoir && devoir.id ? `/devoirs/${devoir.id}` : null);
  const [v, setV] = useState(() =>
    devoir && devoir.id
      ? {
          titre: devoir.titre,
          description: devoir.description || '',
          classe_id: String(devoir.classe_id),
          matiere_id: String(devoir.matiere_id),
          date_remise: versDatetimeLocal(devoir.date_remise),
          bareme: devoir.bareme,
        }
      : { titre: '', description: '', classe_id: '', matiere_id: '', date_remise: versDatetimeLocal(new Date(Date.now() + 3 * 86400000).setHours(18, 0, 0, 0)), bareme: 20 }
  );
  const [fichiers, setFichiers] = useState([]);
  const [aRetirer, setARetirer] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const classe = (classes || []).find((c) => String(c.id) === v.classe_id);
  const matieresClasse = useMemo(() => {
    if (!classe) return [];
    const toutes = (matieres || []).filter((m) => !m.niveau || m.niveau === classe.niveau);
    if (role === 'admin' || classe.titulaire_id === utilisateur.id) return toutes;
    const ids = (affectations || []).filter((a) => String(a.classe_id) === v.classe_id).map((a) => a.matiere_id);
    return toutes.filter((m) => ids.includes(m.id));
  }, [classe, matieres, affectations, role, utilisateur.id, v.classe_id]);

  const envoyer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    const corps = formulaire({
      ...v,
      date_remise: new Date(v.date_remise).toISOString(),
      fichiers,
      fichiers_supprimes: aRetirer.join(','),
    });
    try {
      const r = devoir && devoir.id ? await api.put(`/devoirs/${devoir.id}`, corps) : await api.post('/devoirs', corps);
      onTermine(r, devoir && devoir.id ? 'Devoir modifié.' : 'Devoir publié. Les élèves et leurs parents sont notifiés.');
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modale
      large
      titre={devoir && devoir.id ? 'Modifier le devoir' : 'Publier un devoir'}
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" form="form-devoir" variante="primaire" chargement={envoi}>
            {devoir && devoir.id ? 'Enregistrer' : 'Publier le devoir'}
          </Bouton>
        </>
      }
    >
      <form id="form-devoir" onSubmit={envoyer} style={{ display: 'grid', gap: 16 }}>
        {erreur && <Encart ton="alerte">{erreur}</Encart>}
        <div className="grille-form">
          <Champ label="Titre" requis plein>
            {(id) => <input id={id} value={v.titre} onChange={(e) => setV({ ...v, titre: e.target.value })} required placeholder="Ex. Fiche n°4 — Les doubles" />}
          </Champ>
          <Champ label="Classe" requis>
            {(id) => (
              <select id={id} value={v.classe_id} onChange={(e) => setV({ ...v, classe_id: e.target.value, matiere_id: '' })} required>
                <option value="" disabled>
                  Choisir…
                </option>
                {(classes || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            )}
          </Champ>
          <Champ label="Matière" requis>
            {(id) => (
              <select id={id} value={v.matiere_id} onChange={(e) => setV({ ...v, matiere_id: e.target.value })} required>
                <option value="" disabled>
                  {v.classe_id ? 'Choisir…' : 'Choisissez d’abord la classe'}
                </option>
                {matieresClasse.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nom}
                  </option>
                ))}
              </select>
            )}
          </Champ>
          <Champ label="À rendre avant le" requis>
            {(id) => <input id={id} type="datetime-local" value={v.date_remise} onChange={(e) => setV({ ...v, date_remise: e.target.value })} required />}
          </Champ>
          <Champ label="Noté sur" requis>
            {(id) => <input id={id} type="number" min="1" max="100" value={v.bareme} onChange={(e) => setV({ ...v, bareme: e.target.value })} required />}
          </Champ>
          <Champ label="Consignes" plein>
            {(id) => <textarea id={id} rows={4} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="Ce que l’élève doit faire, le matériel nécessaire…" />}
          </Champ>
        </div>
        {detail && detail.fichiers.length > 0 && (
          <div>
            <p className="gras petit">Fichiers déjà joints</p>
            <ListeFichiers fichiers={detail.fichiers.filter((f) => !aRetirer.includes(f.id))} onRetirer={(f) => setARetirer([...aRetirer, f.id])} />
          </div>
        )}
        <SelecteurFichiers id="fichiers-devoir" fichiers={fichiers} onChange={setFichiers} label="Énoncé, fiche d’exercices…" />
      </form>
    </Modale>
  );
}

function VueEnseignant() {
  const { role, annee, estAnneeCourante } = useAuth();
  const { succes } = useRetours();
  const supprimer = useSuppression();
  const naviguer = useNavigate();
  const [classeId, setClasseId] = useState('');
  const { donnees: classes } = useDonnees(`/classes${qs({ annee })}`);
  const { donnees, chargement, erreur, recharger } = useDonnees(`/devoirs${qs({ annee, classe_id: classeId })}`);
  const [edition, setEdition] = useState(null);
  return (
    <>
      <PageTete
        titre="Devoirs"
        texte="Publiez un devoir avec ses pièces jointes, suivez les dépôts des élèves, notez, puis publiez les notes et la correction."
        actions={
          estAnneeCourante && (
            <Bouton variante="primaire" icone={Plus} onClick={() => setEdition({})}>
              Publier un devoir
            </Bouton>
          )
        }
      />
      <Feuille serre>
        <div className="filtres">
          <Champ label="Classe">
            {(id) => (
              <select id={id} value={classeId} onChange={(e) => setClasseId(e.target.value)}>
                <option value="">Toutes</option>
                {(classes || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            )}
          </Champ>
        </div>
        <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
          {(liste) => (
            <Tableau
              lignes={liste}
              colonnes={[
                {
                  titre: 'Devoir',
                  rendu: (d) => (
                    <Link to={`/devoirs/${d.id}`} style={{ textDecoration: 'none' }}>
                      <span className="gras" style={{ display: 'block' }}>
                        {d.titre}
                      </span>
                      <span className="petit muet">
                        {d.matiere}, {d.classe}
                        {role === 'admin' ? `, ${d.enseignant}` : ''}
                      </span>
                    </Link>
                  ),
                },
                {
                  titre: 'Remise',
                  rendu: (d) => (
                    <span>
                      <span className="nowrap" style={{ display: 'block' }}>
                        {dateHeure(d.date_remise)}
                      </span>
                      <span className="petit" style={{ color: new Date(d.date_remise) < new Date() ? 'var(--graphite-doux)' : 'var(--encre)' }}>
                        {echeance(d.date_remise)}
                      </span>
                    </span>
                  ),
                },
                { titre: 'Rendus', rendu: (d) => <Pastille ton={d.nb_rendus >= d.effectif ? 'vert' : 'bleu'}>{d.nb_rendus}/{d.effectif}</Pastille> },
                {
                  titre: 'Notes',
                  rendu: (d) =>
                    d.nb_notes_non_publiees > 0 ? <Pastille ton="jaune">{d.nb_notes_non_publiees} à publier</Pastille> : d.nb_notes > 0 ? <Pastille ton="violet">{d.nb_notes} publiée(s)</Pastille> : <span className="muet">—</span>,
                },
                { titre: 'Correction', rendu: (d) => (d.correction_publiee_at ? <Pastille ton="vert">Déposée</Pastille> : <span className="muet">—</span>) },
                {
                  titre: '',
                  classe: 'actions',
                  rendu: (d) => (
                    <>
                      <Link className="btn btn--secondaire btn--petit" to={`/devoirs/${d.id}`}>
                        Ouvrir
                      </Link>
                      {estAnneeCourante && (
                        <>
                          <Bouton petit variante="fantome" icone={Pencil} title="Modifier" aria-label={`Modifier ${d.titre}`} onClick={() => setEdition(d)} />
                          <Bouton
                            petit
                            variante="fantome"
                            icone={Trash2}
                            title="Supprimer"
                            aria-label={`Supprimer ${d.titre}`}
                            onClick={async () => {
                              if (await supprimer(`/devoirs/${d.id}`, { titre: `Supprimer « ${d.titre} » ?`, message: d.nb_rendus ? `${d.nb_rendus} élève(s) ont déjà rendu leur travail.` : 'Aucun travail n’a encore été déposé.' }))
                                recharger();
                            }}
                          />
                        </>
                      )}
                    </>
                  ),
                },
              ]}
              vide={<Vide icone={NotebookPen} titre="Aucun devoir" texte="Publiez un premier devoir pour vos élèves." />}
            />
          )}
        </Etat>
      </Feuille>
      {edition && (
        <ModaleDevoir
          devoir={edition}
          onFermer={() => setEdition(null)}
          onTermine={(r, msg) => {
            setEdition(null);
            succes(msg);
            if (!edition.id) naviguer(`/devoirs/${r.id}`);
            else recharger();
          }}
        />
      )}
    </>
  );
}

function VueFamille() {
  const { role, utilisateur } = useAuth();
  const [enfant, setEnfant] = useState('');
  const { donnees, chargement, erreur, recharger } = useDonnees(`/devoirs${qs({ eleve_id: enfant })}`);
  const [filtre, setFiltre] = useState('tous');
  const lignes = (donnees || []).filter((d) => filtre === 'tous' || (filtre === 'a_faire' ? ['a_faire'].includes(d.soumission.statut) : d.soumission.statut === filtre));
  return (
    <>
      <PageTete titre={role === 'eleve' ? 'Mes devoirs' : 'Devoirs'} texte={role === 'eleve' ? 'Dépose ton travail avant la date de remise. Tu peux le remplacer tant que la date n’est pas passée.' : 'Devoirs donnés à vos enfants, avec leurs dépôts, notes et corrections.'} />
      <Feuille serre>
        <div className="filtres">
          {role === 'parent' && utilisateur.enfants.length > 1 && (
            <Champ label="Enfant">
              {(id) => (
                <select id={id} value={enfant} onChange={(e) => setEnfant(e.target.value)}>
                  <option value="">Tous mes enfants</option>
                  {utilisateur.enfants.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.prenom}
                    </option>
                  ))}
                </select>
              )}
            </Champ>
          )}
          <Champ label="Afficher">
            {(id) => (
              <select id={id} value={filtre} onChange={(e) => setFiltre(e.target.value)}>
                <option value="tous">Tous les devoirs</option>
                <option value="a_faire">À faire</option>
                <option value="rendu">Rendus</option>
                <option value="note">Notés</option>
                <option value="non_rendu">Non rendus</option>
              </select>
            )}
          </Champ>
        </div>
        <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
          {() =>
            lignes.length ? (
              <ul className="liste-reglee">
                {lignes.map((d) => (
                  <li key={`${d.id}-${d.eleve.id}`}>
                    <Link to={`/devoirs/${d.id}${role === 'parent' ? `?eleve_id=${d.eleve.id}` : ''}`} className="liste-reglee__lien">
                      <NotebookPen size={18} color="var(--encre)" aria-hidden="true" />
                      <span className="liste-reglee__principal">
                        <span className="liste-reglee__titre" style={{ display: 'block' }}>
                          {d.titre}
                        </span>
                        <span className="liste-reglee__meta">
                          {role === 'parent' ? `${d.eleve.nom}, ` : ''}
                          {d.matiere}, à rendre le {dateHeure(d.date_remise)}
                        </span>
                      </span>
                      {d.soumission.note !== null && d.soumission.note !== undefined ? (
                        <NoteManuscrite valeur={d.soumission.note} sur={d.bareme} />
                      ) : (
                        <Pastille ton={TONS_SOUMISSION[d.soumission.statut]}>{LIBELLES.soumission[d.soumission.statut]}</Pastille>
                      )}
                      {role === 'parent' && d.vu_at && <Pastille ton="gris">Vu</Pastille>}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Vide icone={NotebookPen} titre="Aucun devoir" texte="Aucun devoir ne correspond à ce filtre." />
            )
          }
        </Etat>
      </Feuille>
    </>
  );
}

export default function Devoirs() {
  const { role } = useAuth();
  if (role === 'admin' || role === 'enseignant') return <VueEnseignant />;
  if (role === 'parent' || role === 'eleve') return <VueFamille />;
  return <Vide titre="Accès réservé" texte="Les devoirs concernent les enseignants, les élèves et les parents." />;
}
