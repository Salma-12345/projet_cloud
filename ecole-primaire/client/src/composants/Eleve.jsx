// Sections partagées du suivi d'un élève : bulletin, absences, paiements.
import { useEffect, useMemo, useState } from 'react';
import { CalendarX2, CircleCheck, FileDown, Pencil, Plus, Receipt, Trash2, Wallet } from 'lucide-react';
import { api, formulaire, qs, urlFichier } from '../api.js';
import { useDonnees } from '../utils/useDonnees.js';
import { useAuth } from '../contexte/Auth.jsx';
import { useRetours, useSuppression } from '../contexte/Retours.jsx';
import { Bouton, Champ, Encart, Etat, Feuille, Modale, NoteManuscrite, Onglets, Pastille, Tableau, Vide } from './ui.jsx';
import { SelecteurFichiers } from './Fichiers.jsx';
import { LIBELLES, TONS_ABSENCE, aujourdhuiIso, dateCourte, montant, nombre, note } from '../utils/format.js';

export function trimestreCourant() {
  const m = new Date().getMonth() + 1;
  if (m >= 9) return 1;
  if (m <= 3) return 2;
  return 3;
}

// ---------------------------------------------------------------------
// Bulletin / notes
// ---------------------------------------------------------------------
export function BulletinEleve({ eleveId, annees = [] }) {
  const { anneeCourante } = useAuth();
  const [annee, setAnnee] = useState(annees[0] || anneeCourante);
  const [trimestre, setTrimestre] = useState(annee === anneeCourante ? trimestreCourant() : 3);
  const chemin = `/bulletins/eleve/${eleveId}${qs({ annee, trimestre })}`;
  const { donnees, chargement, erreur, recharger } = useDonnees(chemin);

  return (
    <Feuille
      serre
      titre="Notes et bulletin"
      sousTitre="Moyenne par matière = moyenne des notes ramenées sur 20. Moyenne générale pondérée par les coefficients."
      actions={
        <>
          {annees.length > 1 && (
            <label>
              <span className="visuellement-cache">Année scolaire</span>
              <select
                className="select-annee"
                value={annee}
                onChange={(e) => {
                  setAnnee(e.target.value);
                  setTrimestre(e.target.value === anneeCourante ? trimestreCourant() : 3);
                }}
              >
                {annees.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          )}
          <a className="btn btn--secondaire btn--petit" href={`/api${chemin.replace(`/bulletins/eleve/${eleveId}`, `/bulletins/eleve/${eleveId}/pdf`)}`} target="_blank" rel="noreferrer">
            <FileDown size={15} aria-hidden="true" /> Bulletin PDF
          </a>
        </>
      }
    >
      <Onglets
        label="Trimestre"
        actif={trimestre}
        onChange={setTrimestre}
        onglets={[1, 2, 3].map((t) => ({ cle: t, libelle: `${t === 1 ? '1er' : `${t}e`} trimestre` }))}
      />
      <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
        {(b) => (
          <>
            <div className="chiffres" style={{ borderBottom: '1px solid var(--ligne)' }}>
              <div className="chiffre">
                <span className="chiffre__valeur">
                  <NoteManuscrite valeur={b.moyenne_generale} taille="grande" anime />
                </span>
                <span className="chiffre__libelle">moyenne générale</span>
              </div>
              <div className="chiffre">
                <span className="chiffre__valeur">{b.rang ? `${b.rang}${b.rang === 1 ? 'er' : 'e'}` : '—'}</span>
                <span className="chiffre__libelle">rang sur {b.effectif} élèves</span>
              </div>
              <div className="chiffre">
                <span className="chiffre__valeur">{nombre(b.stats_generale.moyenne)}</span>
                <span className="chiffre__libelle">moyenne de la classe ({b.classe.nom})</span>
              </div>
              <div className="chiffre">
                <span className="chiffre__valeur" style={{ fontSize: 'var(--t-xl)' }}>
                  {b.appreciation}
                </span>
                <span className="chiffre__libelle">
                  {b.absences.non_justifiees} absence(s) non justifiée(s), {b.absences.justifiees} justifiée(s)
                </span>
              </div>
            </div>
            <Tableau
              lignes={b.matieres}
              colonnes={[
                { titre: 'Matière', rendu: (m) => <strong>{m.nom}</strong> },
                { titre: 'Coef.', classe: 'num', rendu: (m) => nombre(m.coefficient) },
                {
                  titre: 'Notes du trimestre',
                  rendu: (m) =>
                    m.evaluations.length ? (
                      <span className="groupe-btn" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        {m.evaluations.map((ev) => (
                          <span key={ev.id} className="pastille" title={`${ev.titre} (${dateCourte(ev.date_evaluation)})`}>
                            {ev.valeur === null ? 'non noté' : `${note(ev.valeur)}/${note(ev.bareme)}`}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="muet">Pas encore évalué</span>
                    ),
                },
                {
                  titre: 'Moyenne',
                  classe: 'num',
                  rendu: (m) => (
                    <strong style={{ color: m.moyenne === null ? undefined : m.moyenne < 10 ? 'var(--stylo-rouge)' : 'var(--stylo-vert)' }}>
                      {m.moyenne === null ? '—' : nombre(m.moyenne)}
                    </strong>
                  ),
                },
                { titre: 'Classe', classe: 'num', rendu: (m) => nombre(m.moyenne_classe) },
                { titre: 'Appréciation', rendu: (m) => (m.moyenne === null ? '—' : m.appreciation) },
              ]}
            />
          </>
        )}
      </Etat>
    </Feuille>
  );
}

// ---------------------------------------------------------------------
// Absences
// ---------------------------------------------------------------------
function ModaleJustification({ absence, onFermer, onTermine }) {
  const [texte, setTexte] = useState('');
  const [fichier, setFichier] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const envoyer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    try {
      await api.post(`/absences/${absence.id}/justifier`, formulaire({ justification: texte, justificatif: fichier }));
      onTermine();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <Modale
      titre="Justifier l’absence"
      sousTitre={`${absence.prenom}, ${dateCourte(absence.date_absence)} (${LIBELLES.periode[absence.periode].toLowerCase()})`}
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" form="form-justif" variante="primaire" chargement={envoi}>
            Envoyer la justification
          </Bouton>
        </>
      }
    >
      <form id="form-justif" onSubmit={envoyer} style={{ display: 'grid', gap: 16 }}>
        {erreur && <Encart ton="alerte">{erreur}</Encart>}
        <Champ label="Motif de l’absence" requis>
          {(id) => <textarea id={id} value={texte} onChange={(e) => setTexte(e.target.value)} required rows={4} placeholder="Exemple : rendez-vous médical, certificat joint." />}
        </Champ>
        <SelecteurFichiers
          id="justificatif"
          label="Justificatif (facultatif)"
          aide="Certificat médical ou document, en PDF ou en photo."
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          multiple={false}
          fichiers={fichier ? [fichier] : []}
          onChange={(liste) => setFichier(liste[0] || null)}
        />
      </form>
    </Modale>
  );
}

export function AbsencesEleve({ eleveId, prenom }) {
  const { role, annee } = useAuth();
  const { succes, erreur: toastErreur } = useRetours();
  const { donnees, chargement, erreur, recharger } = useDonnees(`/absences${qs({ eleve_id: eleveId, annee })}`);
  const [justif, setJustif] = useState(null);
  const valider = async (a, decision) => {
    try {
      await api.post(`/absences/${a.id}/valider`, { decision });
      succes(decision === 'justifiee' ? 'Absence justifiée.' : 'Justificatif refusé.');
      recharger();
    } catch (e) {
      toastErreur(e);
    }
  };
  return (
    <Feuille serre titre="Absences" sousTitre="Par demi-journée. Les parents peuvent justifier une absence depuis leur espace.">
      <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
        {(liste) => (
          <Tableau
            lignes={liste}
            colonnes={[
              { titre: 'Date', rendu: (a) => <strong>{dateCourte(a.date_absence)}</strong> },
              { titre: 'Période', rendu: (a) => LIBELLES.periode[a.periode] },
              { titre: 'Statut', rendu: (a) => <Pastille ton={TONS_ABSENCE[a.statut]}>{LIBELLES.absence[a.statut]}</Pastille> },
              {
                titre: 'Justification',
                rendu: (a) =>
                  a.justification ? (
                    <span>
                      {a.justification}{' '}
                      {a.justificatif_id && (
                        <a href={urlFichier(a.justificatif_id)} target="_blank" rel="noreferrer">
                          (pièce jointe)
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
                    {role === 'parent' && ['non_justifiee', 'refusee'].includes(a.statut) && (
                      <Bouton petit variante="primaire" onClick={() => setJustif({ ...a, prenom })}>
                        Justifier
                      </Bouton>
                    )}
                    {['admin', 'enseignant'].includes(role) && a.statut === 'en_attente' && (
                      <>
                        <Bouton petit variante="primaire" onClick={() => valider(a, 'justifiee')}>
                          Accepter
                        </Bouton>
                        <Bouton petit variante="danger" onClick={() => valider(a, 'refusee')}>
                          Refuser
                        </Bouton>
                      </>
                    )}
                  </>
                ),
              },
            ]}
            vide={<Vide icone={CalendarX2} titre="Aucune absence" texte="Aucune absence enregistrée pour cette année." />}
          />
        )}
      </Etat>
      {justif && (
        <ModaleJustification
          absence={justif}
          onFermer={() => setJustif(null)}
          onTermine={() => {
            setJustif(null);
            succes('Justification envoyée à l’école.');
            recharger();
          }}
        />
      )}
    </Feuille>
  );
}

// ---------------------------------------------------------------------
// Paiements
// ---------------------------------------------------------------------
export function ModalePaiement({ eleveFixe, paiement, onFermer, onTermine }) {
  const { annee } = useAuth();
  const [eleveId, setEleveId] = useState(eleveFixe ? String(eleveFixe.id) : paiement ? String(paiement.eleve_id) : '');
  const { donnees: eleves } = useDonnees(eleveFixe || paiement ? null : `/eleves${qs({ annee })}`);
  const { donnees: situation } = useDonnees(eleveId ? `/finances/situation/${eleveId}${qs({ annee })}` : null);
  const [v, setV] = useState(() =>
    paiement
      ? {
          tarif_id: paiement.tarif_id ? String(paiement.tarif_id) : '',
          montant: String(paiement.montant),
          date_paiement: paiement.date_paiement,
          mode: paiement.mode,
          reference: paiement.reference || '',
          remarque: paiement.remarque || '',
        }
      : { tarif_id: '', montant: '', date_paiement: aujourdhuiIso(), mode: 'especes', reference: '', remarque: '' }
  );
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState(null);

  const parClasse = useMemo(() => {
    const g = {};
    for (const e of eleves || []) (g[e.classe || 'Sans classe'] = g[e.classe || 'Sans classe'] || []).push(e);
    return g;
  }, [eleves]);

  useEffect(() => {
    // Préremplit l'objet et le montant avec la prochaine échéance non réglée
    if (!situation || paiement || v.tarif_id) return;
    const prochaine = situation.echeances.find((e) => e.reste > 0);
    if (prochaine) setV((x) => ({ ...x, tarif_id: String(prochaine.id), montant: String(prochaine.reste) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [situation]);

  const envoyer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    const corps = { ...v, eleve_id: Number(eleveId), tarif_id: v.tarif_id || null, annee_scolaire: annee };
    try {
      if (paiement) {
        await api.put(`/paiements/${paiement.id}`, corps);
        onTermine('Paiement modifié, reçu régénéré.');
      } else {
        setResultat(await api.post('/paiements', corps));
      }
    } catch (err) {
      setErreur(err);
    } finally {
      setEnvoi(false);
    }
  };

  if (resultat) {
    const p = resultat.paiement;
    return (
      <Modale
        titre="Paiement enregistré"
        onFermer={() => onTermine(null)}
        pied={
          <>
            <a className="btn btn--secondaire" href={`/api/paiements/${p.id}/recu`} target="_blank" rel="noreferrer">
              <Receipt size={17} aria-hidden="true" /> Ouvrir le reçu
            </a>
            <Bouton variante="primaire" onClick={() => onTermine(null)}>
              Terminer
            </Bouton>
          </>
        }
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <Encart ton="succes" icone={CircleCheck}>
            Reçu <strong>{p.numero_recu}</strong> généré et classé dans le dossier de {p.prenom}.
          </Encart>
          <dl className="definitions">
            <dt>Montant payé</dt>
            <dd>{montant(p.montant)}</dd>
            <dt>Mode</dt>
            <dd>{LIBELLES.mode[p.mode]}</dd>
            <dt>Nouveau solde</dt>
            <dd>{montant(resultat.situation.solde)}</dd>
            <dt>Message aux parents</dt>
            <dd>
              {resultat.nb_parents_notifies
                ? `Envoyé automatiquement à ${resultat.nb_parents_notifies} parent(s) : messagerie, notification et e-mail.`
                : 'Aucun parent rattaché à cet élève.'}
            </dd>
          </dl>
        </div>
      </Modale>
    );
  }

  return (
    <Modale
      titre={paiement ? `Modifier le paiement ${paiement.numero_recu}` : 'Enregistrer un paiement'}
      sousTitre={eleveFixe ? `${eleveFixe.prenom} ${eleveFixe.nom}` : paiement ? `${paiement.prenom} ${paiement.nom}` : undefined}
      onFermer={() => onFermer()}
      pied={
        <>
          <Bouton onClick={() => onFermer()}>Annuler</Bouton>
          <Bouton type="submit" form="form-paiement" variante="primaire" chargement={envoi} disabled={!eleveId}>
            {paiement ? 'Enregistrer les modifications' : 'Enregistrer le paiement'}
          </Bouton>
        </>
      }
    >
      <form id="form-paiement" onSubmit={envoyer} style={{ display: 'grid', gap: 16 }}>
        {erreur && <Encart ton="alerte">{erreur.message}</Encart>}
        {!eleveFixe && !paiement && (
          <Champ label="Élève" requis>
            {(id) => (
              <select id={id} value={eleveId} onChange={(e) => {
                setEleveId(e.target.value);
                setV((x) => ({ ...x, tarif_id: '', montant: '' }));
              }} required>
                <option value="" disabled>
                  {eleves ? 'Choisir un élève…' : 'Chargement…'}
                </option>
                {Object.entries(parClasse).map(([classe, liste]) => (
                  <optgroup key={classe} label={classe}>
                    {liste.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nom} {e.prenom} ({e.matricule})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
          </Champ>
        )}
        {situation && (
          <div className="encart">
            <Wallet size={18} aria-hidden="true" />
            <div>
              Total de l’année {montant(situation.total_du)}, déjà payé {montant(situation.total_paye)}, reste <strong>{montant(situation.solde)}</strong>
              {situation.retard > 0 && <> dont {montant(situation.retard)} en retard</>}.
            </div>
          </div>
        )}
        <div className="grille-form">
          <Champ label="Objet du paiement" plein>
            {(id) => (
              <select
                id={id}
                value={v.tarif_id}
                onChange={(e) => {
                  const t = situation && situation.echeances.find((x) => String(x.id) === e.target.value);
                  setV({ ...v, tarif_id: e.target.value, montant: t && t.reste > 0 ? String(t.reste) : v.montant });
                }}
              >
                <option value="">Paiement libre (réparti sur les échéances)</option>
                {(situation ? situation.echeances : []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.libelle} — {t.reste > 0 ? `reste ${montant(t.reste)}` : 'réglé'}
                  </option>
                ))}
              </select>
            )}
          </Champ>
          <Champ label="Montant (DT)" requis>
            {(id) => <input id={id} type="number" min="0.001" step="0.001" value={v.montant} onChange={(e) => setV({ ...v, montant: e.target.value })} required inputMode="decimal" />}
          </Champ>
          <Champ label="Date du paiement" requis>
            {(id) => <input id={id} type="date" value={v.date_paiement} onChange={(e) => setV({ ...v, date_paiement: e.target.value })} required />}
          </Champ>
          <Champ label="Mode de paiement" requis>
            {(id) => (
              <select id={id} value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value })}>
                {Object.entries(LIBELLES.mode).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            )}
          </Champ>
          <Champ label="Référence" aide="N° de virement, de chèque ou de transaction.">
            {(id) => <input id={id} value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} />}
          </Champ>
          <Champ label="Remarque" plein>
            {(id) => <input id={id} value={v.remarque} onChange={(e) => setV({ ...v, remarque: e.target.value })} />}
          </Champ>
        </div>
        {!paiement && (
          <p className="petit muet">
            À l’enregistrement, un reçu PDF est généré et les parents reçoivent automatiquement un message avec le montant, la date, le mode,
            le nouveau solde et le lien du reçu.
          </p>
        )}
      </form>
    </Modale>
  );
}

export function PaiementsEleve({ eleve, gestion = false }) {
  const { annee } = useAuth();
  const { succes } = useRetours();
  const supprimer = useSuppression();
  const { donnees, chargement, erreur, recharger } = useDonnees(`/finances/situation/${eleve.id}${qs({ annee })}`);
  const [modale, setModale] = useState(null);
  return (
    <div className="pile">
      <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
        {(s) => (
          <>
            <section className="feuille" aria-label="Situation financière">
              <div className="chiffres">
                <div className="chiffre">
                  <span className="chiffre__valeur">{montant(s.total_du)}</span>
                  <span className="chiffre__libelle">frais de l’année {s.annee_scolaire}</span>
                </div>
                <div className="chiffre">
                  <span className="chiffre__valeur">{montant(s.total_paye)}</span>
                  <span className="chiffre__libelle">déjà payé</span>
                </div>
                <div className={`chiffre${s.retard > 0 ? ' chiffre--alerte' : ''}`}>
                  <span className="chiffre__valeur">{montant(s.solde)}</span>
                  <span className="chiffre__libelle">{s.retard > 0 ? `reste à payer, dont ${montant(s.retard)} en retard` : 'reste à payer'}</span>
                </div>
              </div>
            </section>
            <Feuille serre titre="Échéancier">
              <Tableau
                lignes={s.echeances}
                colonnes={[
                  { titre: 'Frais', rendu: (e) => <strong>{e.libelle}</strong> },
                  { titre: 'Échéance', rendu: (e) => (e.date_echeance ? dateCourte(e.date_echeance) : '—') },
                  { titre: 'Montant', classe: 'num', rendu: (e) => montant(e.montant) },
                  { titre: 'Payé', classe: 'num', rendu: (e) => montant(e.paye) },
                  {
                    titre: 'Statut',
                    rendu: (e) =>
                      e.statut === 'payee' ? (
                        <Pastille ton="vert">Réglée</Pastille>
                      ) : e.en_retard ? (
                        <Pastille ton="rouge">En retard : {montant(e.reste)}</Pastille>
                      ) : (
                        <Pastille ton={e.statut === 'partielle' ? 'jaune' : 'bleu'}>Reste {montant(e.reste)}</Pastille>
                      ),
                  },
                ]}
                vide={<Vide icone={Receipt} texte="Aucun frais défini pour cette année." />}
              />
            </Feuille>
            <Feuille
              serre
              titre="Paiements et reçus"
              actions={
                gestion && (
                  <Bouton petit variante="primaire" icone={Plus} onClick={() => setModale({})}>
                    Enregistrer un paiement
                  </Bouton>
                )
              }
            >
              <Tableau
                lignes={s.paiements}
                colonnes={[
                  { titre: 'Date', rendu: (p) => dateCourte(p.date_paiement) },
                  { titre: 'Reçu', rendu: (p) => <strong>{p.numero_recu}</strong> },
                  { titre: 'Objet', rendu: (p) => p.tarif_libelle || 'Paiement libre' },
                  { titre: 'Mode', rendu: (p) => LIBELLES.mode[p.mode] },
                  { titre: 'Montant', classe: 'num', rendu: (p) => <strong>{montant(p.montant)}</strong> },
                  {
                    titre: '',
                    classe: 'actions',
                    rendu: (p) => (
                      <>
                        <a className="btn btn--secondaire btn--petit" href={`/api/paiements/${p.id}/recu`} target="_blank" rel="noreferrer">
                          <Receipt size={15} aria-hidden="true" /> Reçu
                        </a>
                        {gestion && (
                          <>
                            <Bouton petit variante="fantome" icone={Pencil} title="Modifier" aria-label={`Modifier le paiement ${p.numero_recu}`} onClick={() => setModale({ ...p, eleve_id: eleve.id, prenom: eleve.prenom, nom: eleve.nom })} />
                            <Bouton
                              petit
                              variante="fantome"
                              icone={Trash2}
                              title="Supprimer"
                              aria-label={`Supprimer le paiement ${p.numero_recu}`}
                              onClick={async () => {
                                if (
                                  await supprimer(`/paiements/${p.id}`, {
                                    titre: `Supprimer le paiement ${p.numero_recu} ?`,
                                    message: `Le paiement de ${montant(p.montant)} sera annulé et le solde recalculé. L’opération reste tracée dans le journal.`,
                                  })
                                )
                                  recharger();
                              }}
                            />
                          </>
                        )}
                      </>
                    ),
                  },
                ]}
                vide={<Vide icone={Wallet} texte="Aucun paiement enregistré pour cette année." />}
              />
            </Feuille>
          </>
        )}
      </Etat>
      {modale && (
        <ModalePaiement
          eleveFixe={modale.id ? null : eleve}
          paiement={modale.id ? modale : null}
          onFermer={() => setModale(null)}
          onTermine={(msg) => {
            setModale(null);
            if (msg) succes(msg);
            recharger();
          }}
        />
      )}
    </div>
  );
}
