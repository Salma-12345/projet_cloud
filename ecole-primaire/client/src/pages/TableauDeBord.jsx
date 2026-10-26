import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarDays, ClipboardList, Megaphone, NotebookPen, Wallet } from 'lucide-react';
import { useAuth } from '../contexte/Auth.jsx';
import { useDonnees } from '../utils/useDonnees.js';
import { Avatar, Encart, Etat, Feuille, Jauge, LienBouton, NoteManuscrite, PageTete, Pastille, Tableau, Vide } from '../composants/ui.jsx';
import { LIBELLES, date, dateCourte, echeance, montant, relatif } from '../utils/format.js';

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function titreCours(jc, prefixe) {
  if (!jc || jc.aujourdhui) return `${prefixe} aujourd’hui`;
  return `${prefixe} de ${JOURS[jc.jour]}`;
}

function salutation(prenom) {
  const h = new Date().getHours();
  return `${h < 18 ? 'Bonjour' : 'Bonsoir'} ${prenom}`;
}

function sousTitreJour(annee) {
  const d = new Date();
  return `Nous sommes ${JOURS[d.getDay()]} ${date(d)}. Année scolaire ${annee}.`;
}

function CoursDuJour({ cours, vide = 'Pas de cours aujourd’hui.' }) {
  if (!cours.length) return <Vide icone={CalendarDays} texte={vide} />;
  return (
    <ul className="liste-reglee">
      {cours.map((c) => (
        <li key={c.id}>
          <span className="heure">{c.heure_debut}</span>
          <div className="liste-reglee__principal">
            <div className="liste-reglee__titre">{c.matiere}</div>
            <div className="liste-reglee__meta">
              {c.classe} jusqu’à {c.heure_fin}
              {c.salle ? `, ${c.salle}` : ''}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Administration({ d, role }) {
  const f = d.finances;
  const c = d.compteurs;
  return (
    <div className="pile">
      <section className="feuille" aria-label="Chiffres clés">
        <div className="chiffres">
          {role === 'admin' ? (
            <>
              <Link to="/eleves" className="chiffre">
                <span className="chiffre__valeur">{c.eleves}</span>
                <span className="chiffre__libelle">élèves inscrits</span>
              </Link>
              <Link to="/classes" className="chiffre">
                <span className="chiffre__valeur">{c.classes}</span>
                <span className="chiffre__libelle">classes</span>
              </Link>
              <Link to="/enseignants" className="chiffre">
                <span className="chiffre__valeur">{c.enseignants}</span>
                <span className="chiffre__libelle">enseignants</span>
              </Link>
            </>
          ) : (
            <>
              <Link to="/paiements" className="chiffre">
                <span className="chiffre__valeur">{montant(f.total_encaisse)}</span>
                <span className="chiffre__libelle">encaissés cette année</span>
              </Link>
              <Link to="/impayes" className="chiffre">
                <span className="chiffre__valeur">{montant(f.reste_a_recouvrer)}</span>
                <span className="chiffre__libelle">reste à recouvrer</span>
              </Link>
            </>
          )}
          <Link to="/preinscriptions" className={`chiffre${c.preinscriptions ? ' chiffre--alerte' : ''}`}>
            <span className="chiffre__valeur">{c.preinscriptions}</span>
            <span className="chiffre__libelle">pré-inscriptions à traiter</span>
          </Link>
          {role === 'admin' ? (
            <Link to="/absences" className="chiffre">
              <span className="chiffre__valeur">{c.absences_jour}</span>
              <span className="chiffre__libelle">absences aujourd’hui</span>
            </Link>
          ) : (
            <Link to="/impayes" className={`chiffre${f.nb_en_retard ? ' chiffre--alerte' : ''}`}>
              <span className="chiffre__valeur">{f.nb_en_retard}</span>
              <span className="chiffre__libelle">familles en retard</span>
            </Link>
          )}
          {role === 'admin' && (
            <Link to="/absences?statut=en_attente" className={`chiffre${c.justificatifs_attente ? ' chiffre--alerte' : ''}`}>
              <span className="chiffre__valeur">{c.justificatifs_attente}</span>
              <span className="chiffre__libelle">justificatifs à valider</span>
            </Link>
          )}
        </div>
      </section>

      {c.eleves_sans_classe > 0 && (
        <Encart ton="attention" icone={AlertTriangle}>
          {c.eleves_sans_classe} élève(s) actif(s) n’ont pas de classe cette année.{' '}
          <Link to="/eleves?sans_classe=1">Les affecter</Link>
        </Encart>
      )}

      <div className="grille-principale">
        <div className="pile">
          {role === 'admin' && (
            <Feuille titre="Effectifs par classe" actions={<LienBouton petit to="/classes">Gérer les classes</LienBouton>} serre>
              <ul className="liste-reglee">
                {d.effectifs.map((e) => (
                  <li key={e.id}>
                    <Link to={`/classes/${e.id}`} className="liste-reglee__lien">
                      <span className="gras" style={{ width: 64 }}>
                        {e.classe}
                      </span>
                      <span className="liste-reglee__principal">
                        <Jauge valeur={e.effectif} max={e.capacite_max} libelle={`Effectif ${e.classe}`} />
                      </span>
                      <span className="petit muet nowrap">
                        {e.effectif} / {e.capacite_max}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Feuille>
          )}
          <Feuille titre="Derniers paiements" actions={<LienBouton petit to="/paiements">Tous les paiements</LienBouton>} serre>
            <Tableau
              lignes={d.derniers_paiements}
              colonnes={[
                { titre: 'Date', rendu: (p) => dateCourte(p.date_paiement) },
                { titre: 'Élève', rendu: (p) => <Link to={`/eleves/${p.eleve_id}?onglet=paiements`}>{p.eleve}</Link> },
                { titre: 'Mode', rendu: (p) => LIBELLES.mode[p.mode] },
                { titre: 'Montant', classe: 'num', rendu: (p) => <strong>{montant(p.montant)}</strong> },
              ]}
              vide={<Vide icone={Wallet} texte="Aucun paiement enregistré cette année." />}
            />
          </Feuille>
        </div>
        <div className="pile">
          <Feuille titre={`Recouvrement ${d.annee}`} serre>
            <div style={{ padding: '18px 20px', display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 'var(--t-3xl)', fontWeight: 700, lineHeight: 1 }}>{String(f.taux_recouvrement).replace('.', ',')} %</span>
                <span className="muet petit">des frais de l’année encaissés</span>
              </div>
              <Jauge valeur={f.total_encaisse} max={f.total_du} libelle="Taux de recouvrement" />
              <dl className="definitions petit" style={{ marginTop: 6 }}>
                <dt>Encaissé</dt>
                <dd>{montant(f.total_encaisse)}</dd>
                <dt>Reste à recouvrer</dt>
                <dd>{montant(f.reste_a_recouvrer)}</dd>
                <dt>Échéances dépassées</dt>
                <dd style={{ color: f.total_en_retard > 0 ? 'var(--marge-fonce)' : undefined }}>{montant(f.total_en_retard)}</dd>
              </dl>
            </div>
            {f.retards.length > 0 && (
              <>
                <div className="feuille__tete" style={{ borderTop: '1px solid var(--ligne)' }}>
                  <h2>Retards de paiement</h2>
                  <LienBouton petit to="/impayes">
                    Relancer
                  </LienBouton>
                </div>
                <ul className="liste-reglee">
                  {f.retards.map((r) => (
                    <li key={r.id}>
                      <Link to={`/eleves/${r.id}?onglet=paiements`} className="liste-reglee__lien">
                        <span className="liste-reglee__principal">
                          <span className="liste-reglee__titre" style={{ display: 'block' }}>
                            {r.prenom} {r.nom}
                          </span>
                          <span className="liste-reglee__meta">{r.classe}</span>
                        </span>
                        <span className="gras nowrap" style={{ color: 'var(--marge-fonce)' }}>
                          {montant(r.retard)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Feuille>
          {role === 'admin' && d.activite.length > 0 && (
            <Feuille titre="Activité récente" actions={<LienBouton petit to="/journal">Journal complet</LienBouton>} serre>
              <ul className="liste-reglee">
                {d.activite.map((a) => (
                  <li key={a.id}>
                    <div className="liste-reglee__principal">
                      <div className="petit">
                        <strong>{a.utilisateur || 'Système'}</strong> : {LIBELLES.action[a.action] || a.action} ({(LIBELLES.entite[a.entite] || a.entite).toLowerCase()})
                      </div>
                      <div className="liste-reglee__meta">{relatif(a.created_at)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Feuille>
          )}
        </div>
      </div>
    </div>
  );
}

function Enseignant({ d }) {
  return (
    <div className="grille-principale">
      <div className="pile">
        <Feuille titre={titreCours(d.jour_cours, 'Mes cours')} actions={<LienBouton petit to="/emploi-du-temps">Semaine</LienBouton>} serre>
          <CoursDuJour cours={d.cours_du_jour} />
        </Feuille>
        <Feuille titre="Devoirs récents" actions={<LienBouton petit to="/devoirs">Tous les devoirs</LienBouton>} serre>
          {d.devoirs.length ? (
            <ul className="liste-reglee">
              {d.devoirs.map((x) => (
                <li key={x.id}>
                  <Link to={`/devoirs/${x.id}`} className="liste-reglee__lien">
                    <span className="liste-reglee__principal">
                      <span className="liste-reglee__titre" style={{ display: 'block' }}>
                        {x.titre}
                      </span>
                      <span className="liste-reglee__meta">
                        {x.matiere}, {x.classe}, remise {echeance(x.date_remise)}
                      </span>
                    </span>
                    <span className="petit nowrap">
                      {x.nb_rendus}/{x.effectif} rendus
                    </span>
                    {x.a_corriger > 0 && <Pastille ton="jaune">{x.a_corriger} à corriger</Pastille>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Vide icone={NotebookPen} texte="Vous n’avez pas encore publié de devoir." action={<LienBouton to="/devoirs" variante="primaire">Publier un devoir</LienBouton>} />
          )}
        </Feuille>
      </div>
      <div className="pile">
        <Feuille titre="Mes classes" serre>
          <ul className="liste-reglee">
            {d.classes.map((c) => (
              <li key={c.id}>
                <Link to={`/classes/${c.id}`} className="liste-reglee__lien">
                  <span className="gras" style={{ width: 60 }}>
                    {c.classe}
                  </span>
                  <span className="liste-reglee__principal">
                    <span className="liste-reglee__meta">{c.titulaire ? 'Titulaire' : c.matieres}</span>
                  </span>
                  <span className="petit muet">{c.effectif} élèves</span>
                </Link>
              </li>
            ))}
          </ul>
        </Feuille>
        {d.evaluations_a_completer.length > 0 && (
          <Feuille titre="Notes à saisir" serre>
            <ul className="liste-reglee">
              {d.evaluations_a_completer.map((e) => (
                <li key={e.id}>
                  <Link to={`/evaluations/${e.id}`} className="liste-reglee__lien">
                    <ClipboardList size={18} color="var(--encre)" aria-hidden="true" />
                    <span className="liste-reglee__principal">
                      <span className="liste-reglee__titre" style={{ display: 'block' }}>
                        {e.titre}
                      </span>
                      <span className="liste-reglee__meta">
                        {e.classe}, {dateCourte(e.date_evaluation)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Feuille>
        )}
        {d.justificatifs_attente > 0 && (
          <Encart ton="attention" icone={AlertTriangle}>
            {d.justificatifs_attente} justificatif(s) d’absence attendent votre validation. <Link to="/absences?statut=en_attente">Les consulter</Link>
          </Encart>
        )}
      </div>
    </div>
  );
}

function Annonces({ annonces }) {
  return (
    <Feuille titre="Dernières annonces" actions={<LienBouton petit to="/annonces">Toutes les annonces</LienBouton>} serre>
      {annonces.length ? (
        <ul className="liste-reglee">
          {annonces.map((a) => (
            <li key={a.id}>
              <Link to={`/annonces#annonce-${a.id}`} className="liste-reglee__lien">
                <Megaphone size={18} color="var(--encre)" aria-hidden="true" />
                <span className="liste-reglee__principal">
                  <span className="liste-reglee__titre" style={{ display: 'block' }}>
                    {a.titre}
                  </span>
                  <span className="liste-reglee__meta">{relatif(a.publiee_at)}</span>
                </span>
                {a.corrige_id && <Pastille ton="jaune">Rectificatif</Pastille>}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Vide icone={Megaphone} texte="Aucune annonce pour le moment." />
      )}
    </Feuille>
  );
}

function Parent({ d }) {
  return (
    <div className="grille-principale">
      <div className="pile">
        {d.enfants.map((e) => (
          <section key={e.id} className="feuille" aria-label={`${e.prenom} ${e.nom}`}>
            <div className="feuille__tete">
              <div className="fiche">
                <Avatar prenom={e.prenom} nom={e.nom} photoId={e.photo_id} />
                <div>
                  <h2>
                    {e.prenom} {e.nom}
                  </h2>
                  <p>{e.classe || 'Sans classe cette année'}</p>
                </div>
              </div>
              <LienBouton petit to={`/enfants/${e.id}`}>
                Voir le suivi complet
              </LienBouton>
            </div>
            <div className="chiffres">
              <Link to={`/enfants/${e.id}?onglet=notes`} className="chiffre">
                <span className="chiffre__valeur">
                  <NoteManuscrite valeur={e.moyenne_generale} anime />
                </span>
                <span className="chiffre__libelle">
                  moyenne du trimestre {e.trimestre}
                  {e.rang ? `, ${e.rang}${e.rang === 1 ? 'er' : 'e'} sur ${e.effectif}` : ''}
                </span>
              </Link>
              <Link to={`/enfants/${e.id}?onglet=absences`} className={`chiffre${e.absences.non_justifiees ? ' chiffre--alerte' : ''}`}>
                <span className="chiffre__valeur">{e.absences.non_justifiees}</span>
                <span className="chiffre__libelle">absence(s) non justifiée(s)</span>
              </Link>
              <Link to={`/enfants/${e.id}?onglet=paiements`} className={`chiffre${e.retard > 0 ? ' chiffre--alerte' : ''}`}>
                <span className="chiffre__valeur" style={{ fontSize: 'var(--t-xl)' }}>
                  {montant(e.solde)}
                </span>
                <span className="chiffre__libelle">{e.retard > 0 ? `dont ${montant(e.retard)} en retard` : 'reste à payer sur l’année'}</span>
              </Link>
            </div>
            {e.devoirs_a_venir.length > 0 && (
              <>
                <div className="feuille__tete" style={{ borderTop: '1px solid var(--ligne)' }}>
                  <h3>Devoirs à venir</h3>
                </div>
                <ul className="liste-reglee">
                  {e.devoirs_a_venir.map((x) => (
                    <li key={x.id}>
                      <Link to={`/devoirs/${x.id}?eleve_id=${e.id}`} className="liste-reglee__lien">
                        <NotebookPen size={18} color="var(--encre)" aria-hidden="true" />
                        <span className="liste-reglee__principal">
                          <span className="liste-reglee__titre" style={{ display: 'block' }}>
                            {x.titre}
                          </span>
                          <span className="liste-reglee__meta">
                            {x.matiere}, à rendre {echeance(x.date_remise)}
                          </span>
                        </span>
                        {x.depose_at ? <Pastille ton="vert">Rendu</Pastille> : <Pastille ton="bleu">À faire</Pastille>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        ))}
      </div>
      <div className="pile">
        <Annonces annonces={d.annonces} />
      </div>
    </div>
  );
}

function Eleve({ d }) {
  return (
    <div className="grille-principale">
      <div className="pile">
        <Feuille titre="Mes devoirs" actions={<LienBouton petit to="/devoirs">Tous mes devoirs</LienBouton>} serre>
          {d.devoirs.length ? (
            <ul className="liste-reglee">
              {d.devoirs.map((x) => (
                <li key={x.id}>
                  <Link to={`/devoirs/${x.id}`} className="liste-reglee__lien">
                    <NotebookPen size={18} color="var(--encre)" aria-hidden="true" />
                    <span className="liste-reglee__principal">
                      <span className="liste-reglee__titre" style={{ display: 'block' }}>
                        {x.titre}
                      </span>
                      <span className="liste-reglee__meta">
                        {x.matiere}, à rendre {echeance(x.date_remise)}
                      </span>
                    </span>
                    {x.note !== null ? (
                      <NoteManuscrite valeur={x.note} sur={x.bareme} taille="moyenne" />
                    ) : x.depose_at ? (
                      <Pastille ton="vert">Rendu</Pastille>
                    ) : new Date(x.date_remise) < new Date() ? (
                      <Pastille ton="rouge">Non rendu</Pastille>
                    ) : (
                      <Pastille ton="bleu">À faire</Pastille>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Vide icone={NotebookPen} texte="Aucun devoir pour le moment." />
          )}
        </Feuille>
      </div>
      <div className="pile">
        <Feuille titre={titreCours(d.jour_cours, 'Mes cours')} actions={<LienBouton petit to="/emploi-du-temps">Semaine</LienBouton>} serre>
          <CoursDuJour cours={d.cours_du_jour} />
        </Feuille>
        <Annonces annonces={d.annonces} />
      </div>
    </div>
  );
}

export default function TableauDeBord() {
  const { utilisateur } = useAuth();
  const { donnees, chargement, erreur, recharger } = useDonnees('/tableau-de-bord');
  return (
    <>
      <PageTete titre={salutation(utilisateur.prenom)} texte={sousTitreJour(utilisateur.annee_courante)} />
      <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
        {(d) =>
          d.role === 'admin' || d.role === 'comptable' ? (
            <Administration d={d} role={d.role} />
          ) : d.role === 'enseignant' ? (
            <Enseignant d={d} />
          ) : d.role === 'parent' ? (
            <Parent d={d} />
          ) : (
            <Eleve d={d} />
          )
        }
      </Etat>
    </>
  );
}
