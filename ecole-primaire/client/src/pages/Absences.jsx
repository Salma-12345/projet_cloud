import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarX2, Check, Save, Trash2, X } from 'lucide-react';
import { api, qs, urlFichier } from '../api.js';
import { useAuth } from '../contexte/Auth.jsx';
import { useRetours } from '../contexte/Retours.jsx';
import { useDonnees } from '../utils/useDonnees.js';
import { Avatar, Bouton, Champ, Etat, Feuille, Onglets, PageTete, Pastille, Tableau, Vide } from '../composants/ui.jsx';
import { LIBELLES, TONS_ABSENCE, aujourdhuiIso, dateCourte, relatif } from '../utils/format.js';

function Appel({ classes }) {
  const { succes, erreur: toastErreur } = useRetours();
  const { estAnneeCourante } = useAuth();
  const [classeId, setClasseId] = useState(classes[0] ? String(classes[0].id) : '');
  const [jour, setJour] = useState(aujourdhuiIso());
  const [periode, setPeriode] = useState(new Date().getHours() < 12 ? 'matin' : 'apres_midi');
  const { donnees, chargement, erreur, recharger } = useDonnees(classeId ? `/absences/appel${qs({ classe_id: classeId, date: jour, periode })}` : null);
  const [absents, setAbsents] = useState([]);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (donnees) setAbsents(donnees.eleves.filter((e) => e.absence_id).map((e) => e.id));
  }, [donnees]);

  const enregistrer = async () => {
    setEnvoi(true);
    try {
      const r = await api.put('/absences/appel', { classe_id: Number(classeId), date_absence: jour, periode, absents });
      succes(`Appel enregistré : ${r.ajoutees} absence(s) ajoutée(s), ${r.retirees} retirée(s). Les parents concernés sont notifiés.`);
      recharger();
    } catch (e) {
      toastErreur(e);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Feuille
      serre
      titre="Feuille d’appel"
      actions={
        estAnneeCourante && (
          <Bouton variante="primaire" icone={Save} onClick={enregistrer} chargement={envoi} disabled={!donnees}>
            Enregistrer l’appel
          </Bouton>
        )
      }
    >
      <div className="filtres">
        <Champ label="Classe">
          {(id) => (
            <select id={id} value={classeId} onChange={(e) => setClasseId(e.target.value)}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          )}
        </Champ>
        <Champ label="Date">{(id) => <input id={id} type="date" value={jour} max={aujourdhuiIso()} onChange={(e) => setJour(e.target.value)} />}</Champ>
        <Champ label="Demi-journée">
          {(id) => (
            <select id={id} value={periode} onChange={(e) => setPeriode(e.target.value)}>
              <option value="matin">Matin</option>
              <option value="apres_midi">Après-midi</option>
              <option value="journee">Journée entière</option>
            </select>
          )}
        </Champ>
        {donnees && (
          <span className="petit" style={{ alignSelf: 'center', marginLeft: 'auto' }}>
            <strong>{donnees.eleves.length - absents.length}</strong> présent(s), <strong style={{ color: 'var(--marge-fonce)' }}>{absents.length}</strong> absent(s)
          </span>
        )}
      </div>
      <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
        {(d) =>
          d.eleves.length ? (
            <ul className="liste-reglee">
              {d.eleves.map((e) => {
                const absent = absents.includes(e.id);
                const verrouille = e.absence_id && e.statut !== 'non_justifiee';
                return (
                  <li key={e.id} style={absent ? { background: 'var(--marge-pale)' } : undefined}>
                    <Avatar prenom={e.prenom} nom={e.nom} photoId={e.photo_id} taille="petit" />
                    <div className="liste-reglee__principal">
                      <div className="liste-reglee__titre">
                        {e.nom} {e.prenom}
                      </div>
                      {e.absence_id && e.statut !== 'non_justifiee' && <div className="liste-reglee__meta">{LIBELLES.absence[e.statut]}</div>}
                    </div>
                    <div className="groupe-btn" role="group" aria-label={`Présence de ${e.prenom}`}>
                      <Bouton
                        petit
                        variante={!absent ? 'primaire' : 'secondaire'}
                        aria-pressed={!absent}
                        disabled={verrouille || !estAnneeCourante}
                        onClick={() => setAbsents((a) => a.filter((x) => x !== e.id))}
                      >
                        Présent
                      </Bouton>
                      <Bouton
                        petit
                        variante={absent ? 'danger-plein' : 'secondaire'}
                        aria-pressed={absent}
                        disabled={verrouille || !estAnneeCourante}
                        onClick={() => setAbsents((a) => (a.includes(e.id) ? a : [...a, e.id]))}
                      >
                        Absent
                      </Bouton>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Vide texte="Aucun élève dans cette classe." />
          )
        }
      </Etat>
    </Feuille>
  );
}

function Suivi({ classes }) {
  const [params, setParams] = useSearchParams();
  const { annee } = useAuth();
  const { succes, erreur: toastErreur, confirmer } = useRetours();
  const statut = params.get('statut') || '';
  const [classeId, setClasseId] = useState('');
  const { donnees, chargement, erreur, recharger } = useDonnees(`/absences${qs({ annee, statut, classe_id: classeId })}`);
  const decider = async (a, decision) => {
    try {
      await api.post(`/absences/${a.id}/valider`, { decision });
      succes(decision === 'justifiee' ? 'Absence justifiée. Les parents sont notifiés.' : 'Justificatif refusé. Les parents sont notifiés.');
      recharger();
    } catch (e) {
      toastErreur(e);
    }
  };
  return (
    <Feuille serre titre="Suivi des absences">
      <div className="filtres">
        <Champ label="Statut">
          {(id) => (
            <select id={id} value={statut} onChange={(e) => setParams(e.target.value ? { onglet: 'suivi', statut: e.target.value } : { onglet: 'suivi' }, { replace: true })}>
              <option value="">Tous</option>
              {Object.entries(LIBELLES.absence).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          )}
        </Champ>
        <Champ label="Classe">
          {(id) => (
            <select id={id} value={classeId} onChange={(e) => setClasseId(e.target.value)}>
              <option value="">Toutes</option>
              {classes.map((c) => (
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
              { titre: 'Date', rendu: (a) => <span className="nowrap gras">{dateCourte(a.date_absence)}</span> },
              { titre: 'Élève', rendu: (a) => <Link to={`/eleves/${a.eleve_id}?onglet=absences`}>{a.nom} {a.prenom}</Link> },
              { titre: 'Classe', cle: 'classe' },
              { titre: 'Période', rendu: (a) => LIBELLES.periode[a.periode] },
              { titre: 'Statut', rendu: (a) => <Pastille ton={TONS_ABSENCE[a.statut]}>{LIBELLES.absence[a.statut]}</Pastille> },
              {
                titre: 'Justification',
                rendu: (a) =>
                  a.justification ? (
                    <span className="petit">
                      « {a.justification} »{a.justifie_par_nom ? ` (${a.justifie_par_nom}, ${relatif(a.justifie_at)})` : ''}{' '}
                      {a.justificatif_id && (
                        <a href={urlFichier(a.justificatif_id)} target="_blank" rel="noreferrer">
                          Pièce jointe
                        </a>
                      )}
                    </span>
                  ) : (
                    <span className="muet">—</span>
                  ),
              },
              {
                titre: '',
                classe: 'actions',
                rendu: (a) => (
                  <>
                    {a.statut === 'en_attente' && (
                      <>
                        <Bouton petit variante="primaire" icone={Check} onClick={() => decider(a, 'justifiee')}>
                          Accepter
                        </Bouton>
                        <Bouton petit variante="danger" icone={X} onClick={() => decider(a, 'refusee')}>
                          Refuser
                        </Bouton>
                      </>
                    )}
                    <Bouton
                      petit
                      variante="fantome"
                      icone={Trash2}
                      title="Supprimer"
                      aria-label="Supprimer l’absence"
                      onClick={async () => {
                        if (await confirmer({ titre: 'Supprimer cette absence ?', message: `${a.prenom} ${a.nom}, ${dateCourte(a.date_absence)}. À utiliser en cas d’erreur de saisie.`, libelle: 'Supprimer', danger: true })) {
                          await api.del(`/absences/${a.id}`);
                          succes('Absence supprimée.');
                          recharger();
                        }
                      }}
                    />
                  </>
                ),
              },
            ]}
            vide={<Vide icone={CalendarX2} titre="Aucune absence" texte="Aucune absence ne correspond à ces critères." />}
          />
        )}
      </Etat>
    </Feuille>
  );
}

export default function Absences() {
  const { annee } = useAuth();
  const [params, setParams] = useSearchParams();
  const onglet = params.get('onglet') || (params.get('statut') ? 'suivi' : 'appel');
  const { donnees: classes, chargement } = useDonnees(`/classes${qs({ annee })}`);
  return (
    <>
      <PageTete titre="Absences" texte="Faites l’appel par demi-journée. Les parents sont prévenus et peuvent envoyer un justificatif, que vous acceptez ou refusez." />
      <Onglets
        actif={onglet}
        onChange={(o) => setParams({ onglet: o }, { replace: true })}
        onglets={[
          { cle: 'appel', libelle: 'Faire l’appel' },
          { cle: 'suivi', libelle: 'Suivi et justificatifs' },
        ]}
      />
      {chargement && !classes ? null : onglet === 'appel' ? <Appel classes={classes || []} /> : <Suivi classes={classes || []} />}
    </>
  );
}
