import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarDays, FileText, Plus, Trash2, UserMinus, UserPlus, Users } from 'lucide-react';
import { api, qs } from '../api.js';
import { useAuth } from '../contexte/Auth.jsx';
import { useRetours } from '../contexte/Retours.jsx';
import { useDonnees } from '../utils/useDonnees.js';
import { Avatar, Bouton, Champ, Encart, Etat, Feuille, Jauge, LienBouton, Modale, PageTete, Pastille, Tableau, Vide } from '../composants/ui.jsx';
import { age, nombre } from '../utils/format.js';

function ModaleAjoutEleves({ classe, onFermer, onTermine }) {
  const { annee } = useAuth();
  const { donnees } = useDonnees(`/eleves${qs({ annee, sans_classe: 1 })}`);
  const [choix, setChoix] = useState([]);
  const [erreur, setErreur] = useState(null);
  const places = classe.capacite_max - classe.effectif;
  const envoyer = async () => {
    try {
      const r = await api.post(`/classes/${classe.id}/eleves`, { eleve_ids: choix });
      onTermine(`${r.affectes} élève(s) affecté(s) en ${classe.nom}.`);
    } catch (e) {
      setErreur(e.message);
    }
  };
  return (
    <Modale
      titre={`Affecter des élèves en ${classe.nom}`}
      sousTitre={`${places} place(s) disponible(s). Seuls les élèves sans classe cette année sont proposés.`}
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="primaire" onClick={envoyer} disabled={!choix.length}>
            Affecter {choix.length || ''} élève(s)
          </Bouton>
        </>
      }
    >
      {erreur && (
        <div style={{ marginBottom: 12 }}>
          <Encart ton="alerte">{erreur}</Encart>
        </div>
      )}
      {!donnees ? (
        <p className="muet">Chargement…</p>
      ) : donnees.length === 0 ? (
        <Vide icone={Users} texte="Tous les élèves actifs ont déjà une classe cette année." />
      ) : (
        <div className="choix-contacts">
          {donnees.map((e) => (
            <label key={e.id}>
              <input
                type="checkbox"
                checked={choix.includes(e.id)}
                onChange={(ev) => setChoix((c) => (ev.target.checked ? [...c, e.id] : c.filter((x) => x !== e.id)))}
              />
              <span>
                <span className="gras">
                  {e.nom} {e.prenom}
                </span>
                <span className="petit muet" style={{ display: 'block' }}>
                  {age(e.date_naissance)}, matricule {e.matricule}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
      {choix.length > places && (
        <p className="champ__erreur" style={{ marginTop: 10 }}>
          Vous avez sélectionné {choix.length} élèves pour {places} place(s) : le serveur refusera l’affectation.
        </p>
      )}
    </Modale>
  );
}

function ModaleAffectation({ classe, onFermer, onTermine }) {
  const { donnees: matieres } = useDonnees('/matieres');
  const { donnees: enseignants } = useDonnees('/utilisateurs?role=enseignant');
  const [v, setV] = useState({ matiere_id: '', enseignant_id: '' });
  const [erreur, setErreur] = useState(null);
  const dispo = useMemo(
    () => (matieres || []).filter((m) => (!m.niveau || m.niveau === classe.niveau) && !classe.affectations.some((a) => a.matiere_id === m.id)),
    [matieres, classe]
  );
  const envoyer = async (e) => {
    e.preventDefault();
    try {
      await api.post('/affectations', { classe_id: classe.id, matiere_id: Number(v.matiere_id), enseignant_id: Number(v.enseignant_id) });
      onTermine('Matière affectée.');
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale
      titre={`Affecter un enseignant en ${classe.nom}`}
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" form="form-affect" variante="primaire">
            Affecter
          </Bouton>
        </>
      }
    >
      <form id="form-affect" onSubmit={envoyer} className="grille-form">
        {erreur && (
          <div className="plein">
            <Encart ton="alerte">{erreur}</Encart>
          </div>
        )}
        <Champ label="Matière" requis>
          {(id) => (
            <select id={id} value={v.matiere_id} onChange={(e) => setV({ ...v, matiere_id: e.target.value })} required>
              <option value="" disabled>
                Choisir…
              </option>
              {dispo.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nom} (coef. {nombre(m.coefficient)})
                </option>
              ))}
            </select>
          )}
        </Champ>
        <Champ label="Enseignant" requis>
          {(id) => (
            <select id={id} value={v.enseignant_id} onChange={(e) => setV({ ...v, enseignant_id: e.target.value })} required>
              <option value="" disabled>
                Choisir…
              </option>
              {(enseignants || []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.prenom} {x.nom}
                  {x.specialite ? ` (${x.specialite})` : ''}
                </option>
              ))}
            </select>
          )}
        </Champ>
      </form>
    </Modale>
  );
}

export default function ClasseDetail() {
  const { id } = useParams();
  const { role, estAnneeCourante } = useAuth();
  const { succes, confirmer, erreur: toastErreur } = useRetours();
  const { donnees, chargement, erreur, recharger } = useDonnees(`/classes/${id}`);
  const [modale, setModale] = useState(null);
  const gestion = ['admin', 'comptable'].includes(role) && estAnneeCourante;

  const terminer = (msg) => {
    setModale(null);
    if (msg) succes(msg);
    recharger();
  };

  return (
    <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
      {(c) => (
        <>
          <PageTete
            titre={`Classe ${c.nom}`}
            texte={`Année ${c.annee_scolaire}, titulaire : ${c.titulaire || 'non désigné'}`}
            retour={{ to: '/classes', libelle: role === 'enseignant' ? 'Mes classes' : 'Classes' }}
            actions={
              <>
                <LienBouton icone={CalendarDays} to={`/emploi-du-temps?classe_id=${c.id}`}>
                  Emploi du temps
                </LienBouton>
                {['admin', 'enseignant'].includes(role) && (
                  <LienBouton icone={FileText} to={`/bulletins?classe_id=${c.id}`}>
                    Résultats
                  </LienBouton>
                )}
              </>
            }
          />
          <div className="grille-principale">
            <Feuille
              serre
              titre={`Élèves (${c.effectif}/${c.capacite_max})`}
              actions={
                gestion && (
                  <Bouton petit variante="primaire" icone={UserPlus} onClick={() => setModale('eleves')} disabled={c.effectif >= c.capacite_max}>
                    Affecter des élèves
                  </Bouton>
                )
              }
            >
              <div style={{ padding: '12px 20px 4px' }}>
                <Jauge valeur={c.effectif} max={c.capacite_max} libelle="Remplissage de la classe" />
              </div>
              <Tableau
                lignes={c.eleves}
                colonnes={[
                  {
                    titre: 'Élève',
                    rendu: (e) => (
                      <Link to={`/eleves/${e.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                        <Avatar prenom={e.prenom} nom={e.nom} photoId={e.photo_id} taille="petit" />
                        <span className="gras">
                          {e.nom} {e.prenom}
                        </span>
                      </Link>
                    ),
                  },
                  { titre: 'Âge', rendu: (e) => age(e.date_naissance) },
                  { titre: 'Matricule', cle: 'matricule' },
                  ...(gestion
                    ? [
                        {
                          titre: '',
                          classe: 'actions',
                          rendu: (e) => (
                            <Bouton
                              petit
                              variante="fantome"
                              icone={UserMinus}
                              title="Retirer de la classe"
                              aria-label={`Retirer ${e.prenom} ${e.nom} de la classe`}
                              onClick={async () => {
                                if (await confirmer({ titre: 'Retirer de la classe ?', message: `${e.prenom} ${e.nom} n’aura plus de classe pour cette année.`, libelle: 'Retirer', danger: true })) {
                                  try {
                                    await api.del(`/classes/${c.id}/eleves/${e.id}`);
                                    terminer('Élève retiré de la classe.');
                                  } catch (err) {
                                    toastErreur(err);
                                  }
                                }
                              }}
                            />
                          ),
                        },
                      ]
                    : []),
                ]}
                vide={<Vide icone={Users} texte="Aucun élève dans cette classe." />}
              />
            </Feuille>
            <Feuille
              serre
              titre="Matières et enseignants"
              actions={
                role === 'admin' &&
                estAnneeCourante && (
                  <Bouton petit icone={Plus} onClick={() => setModale('affectation')}>
                    Affecter
                  </Bouton>
                )
              }
            >
              {c.affectations.length ? (
                <ul className="liste-reglee">
                  {c.affectations.map((a) => (
                    <li key={a.id}>
                      <div className="liste-reglee__principal">
                        <div className="liste-reglee__titre">
                          {a.matiere} <Pastille>coef. {nombre(a.coefficient)}</Pastille>
                        </div>
                        <div className="liste-reglee__meta">{a.enseignant}</div>
                      </div>
                      {role === 'admin' && estAnneeCourante && (
                        <Bouton
                          petit
                          variante="fantome"
                          icone={Trash2}
                          title="Retirer l’affectation"
                          aria-label={`Retirer l’affectation ${a.matiere}`}
                          onClick={async () => {
                            if (await confirmer({ titre: 'Retirer cette affectation ?', message: `${a.enseignant} n’enseignera plus ${a.matiere} en ${c.nom}. Les notes déjà saisies sont conservées.`, libelle: 'Retirer', danger: true })) {
                              await api.del(`/affectations/${a.id}`);
                              terminer('Affectation retirée.');
                            }
                          }}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <Vide texte="Aucune matière affectée." />
              )}
            </Feuille>
          </div>
          {modale === 'eleves' && <ModaleAjoutEleves classe={c} onFermer={() => setModale(null)} onTermine={terminer} />}
          {modale === 'affectation' && <ModaleAffectation classe={c} onFermer={() => setModale(null)} onTermine={terminer} />}
        </>
      )}
    </Etat>
  );
}
