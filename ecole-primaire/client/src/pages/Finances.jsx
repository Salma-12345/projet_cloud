import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, Download, FileSpreadsheet, Pencil, Plus, Receipt, Trash2, Wallet } from 'lucide-react';
import { api, qs } from '../api.js';
import { useAuth } from '../contexte/Auth.jsx';
import { useRetours, useSuppression } from '../contexte/Retours.jsx';
import { useDonnees } from '../utils/useDonnees.js';
import CrudPage from '../composants/CrudPage.jsx';
import { ModalePaiement } from '../composants/Eleve.jsx';
import { Bouton, Champ, Etat, Feuille, PageTete, Pastille, Recherche, Tableau, Vide } from '../composants/ui.jsx';
import { LIBELLES, NIVEAUX, dateCourte, montant, relatif } from '../utils/format.js';

function Paiements() {
  const { annee, estAnneeCourante } = useAuth();
  const { succes } = useRetours();
  const supprimer = useSuppression();
  const [f, setF] = useState({ q: '', mode: '', du: '', au: '' });
  const { donnees, chargement, erreur, recharger } = useDonnees(`/paiements${qs({ annee, mode: f.mode, du: f.du, au: f.au })}`);
  const [modale, setModale] = useState(null);
  const lignes = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return (donnees || []).filter((p) => !q || `${p.nom} ${p.prenom} ${p.matricule} ${p.numero_recu}`.toLowerCase().includes(q));
  }, [donnees, f.q]);
  const total = lignes.reduce((s, p) => s + p.montant, 0);

  return (
    <>
      <PageTete
        titre="Paiements"
        texte="Chaque paiement génère un reçu PDF et un message automatique aux parents (montant, date, mode, nouveau solde, lien du reçu)."
        actions={
          <>
            <a className="btn btn--secondaire" href={`/api/paiements/export${qs({ annee, format: 'xlsx' })}`}>
              <FileSpreadsheet size={17} aria-hidden="true" /> Export comptable
            </a>
            <a className="btn btn--secondaire" href={`/api/paiements/export${qs({ annee, format: 'csv' })}`}>
              <Download size={17} aria-hidden="true" /> CSV
            </a>
            {estAnneeCourante && (
              <Bouton variante="primaire" icone={Plus} onClick={() => setModale({})}>
                Enregistrer un paiement
              </Bouton>
            )}
          </>
        }
      />
      <Feuille serre>
        <div className="filtres">
          <Recherche valeur={f.q} onChange={(q) => setF({ ...f, q })} placeholder="Élève, matricule ou n° de reçu" />
          <Champ label="Mode">
            {(id) => (
              <select id={id} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
                <option value="">Tous</option>
                {Object.entries(LIBELLES.mode).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            )}
          </Champ>
          <Champ label="Du">{(id) => <input id={id} type="date" value={f.du} onChange={(e) => setF({ ...f, du: e.target.value })} />}</Champ>
          <Champ label="Au">{(id) => <input id={id} type="date" value={f.au} onChange={(e) => setF({ ...f, au: e.target.value })} />}</Champ>
          <span className="petit" style={{ marginLeft: 'auto', alignSelf: 'center' }}>
            {lignes.length} paiement(s), total <strong>{montant(total)}</strong>
          </span>
        </div>
        <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
          {() => (
            <Tableau
              lignes={lignes}
              colonnes={[
                { titre: 'Date', rendu: (p) => <span className="nowrap">{dateCourte(p.date_paiement)}</span> },
                { titre: 'Reçu', rendu: (p) => <strong className="nowrap">{p.numero_recu}</strong> },
                {
                  titre: 'Élève',
                  rendu: (p) => (
                    <Link to={`/eleves/${p.eleve_id}?onglet=paiements`}>
                      {p.nom} {p.prenom}
                    </Link>
                  ),
                },
                { titre: 'Classe', rendu: (p) => p.classe || '—' },
                { titre: 'Objet', rendu: (p) => p.tarif_libelle || 'Paiement libre' },
                { titre: 'Mode', rendu: (p) => <span>{LIBELLES.mode[p.mode]}{p.reference ? <span className="petit muet" style={{ display: 'block' }}>{p.reference}</span> : null}</span> },
                { titre: 'Montant', classe: 'num', rendu: (p) => <strong>{montant(p.montant)}</strong> },
                {
                  titre: '',
                  classe: 'actions',
                  rendu: (p) => (
                    <>
                      <a className="btn btn--secondaire btn--petit" href={`/api/paiements/${p.id}/recu`} target="_blank" rel="noreferrer">
                        <Receipt size={15} aria-hidden="true" /> Reçu
                      </a>
                      {estAnneeCourante && (
                        <>
                          <Bouton petit variante="fantome" icone={Pencil} title="Modifier" aria-label={`Modifier ${p.numero_recu}`} onClick={() => setModale(p)} />
                          <Bouton
                            petit
                            variante="fantome"
                            icone={Trash2}
                            title="Supprimer"
                            aria-label={`Supprimer ${p.numero_recu}`}
                            onClick={async () => {
                              if (
                                await supprimer(`/paiements/${p.id}`, {
                                  titre: `Supprimer le paiement ${p.numero_recu} ?`,
                                  message: `${montant(p.montant)} pour ${p.prenom} ${p.nom}. Le solde sera recalculé ; l’opération reste tracée dans le journal.`,
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
              vide={<Vide icone={Wallet} titre="Aucun paiement" texte="Aucun paiement ne correspond à ces critères." />}
            />
          )}
        </Etat>
      </Feuille>
      {modale && (
        <ModalePaiement
          paiement={modale.id ? modale : null}
          onFermer={() => setModale(null)}
          onTermine={(msg) => {
            setModale(null);
            if (msg) succes(msg);
            recharger();
          }}
        />
      )}
    </>
  );
}

function Impayes() {
  const { annee, estAnneeCourante } = useAuth();
  const { succes, erreur: toastErreur, confirmer } = useRetours();
  const [seulementRetard, setSeulementRetard] = useState(true);
  const { donnees, chargement, erreur, recharger } = useDonnees(`/finances/impayes${qs({ annee, retard: seulementRetard ? 1 : '' })}`);
  const { donnees: relances, recharger: rechargerRelances } = useDonnees(`/finances/relances${qs({ annee })}`);
  const [envoi, setEnvoi] = useState(false);
  const [texte, setTexte] = useState('');
  const lignes = (donnees || []).filter((l) => !texte || `${l.nom} ${l.prenom} ${l.classe}`.toLowerCase().includes(texte.toLowerCase()));

  const relancer = async () => {
    const ok = await confirmer({
      titre: 'Envoyer les relances maintenant ?',
      message:
        'Un rappel de paiement est envoyé aux parents de chaque élève ayant une échéance dépassée (messagerie, notification et e-mail). Une même famille n’est pas relancée deux fois dans la même journée.\n\nLes relances automatiques sont aussi envoyées chaque jour à 8 h, au plus une fois par semaine et par famille.',
      libelle: 'Envoyer les relances',
    });
    if (!ok) return;
    setEnvoi(true);
    try {
      const r = await api.post('/finances/relances');
      succes(r.relances_envoyees ? `${r.relances_envoyees} relance(s) envoyée(s).` : 'Aucune relance à envoyer : toutes les familles concernées ont été relancées aujourd’hui.');
      recharger();
      rechargerRelances();
    } catch (e) {
      toastErreur(e);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <>
      <PageTete
        titre="Impayés et relances"
        texte="Familles dont le solde n’est pas réglé. Les relances automatiques partent chaque matin pour les échéances dépassées."
        actions={
          estAnneeCourante && (
            <Bouton variante="primaire" icone={BellRing} onClick={relancer} chargement={envoi}>
              Relancer maintenant
            </Bouton>
          )
        }
      />
      <div className="pile">
        <Feuille serre>
          <div className="filtres">
            <Recherche valeur={texte} onChange={setTexte} placeholder="Élève ou classe" />
            <label className="case" style={{ alignSelf: 'center' }}>
              <input type="checkbox" checked={seulementRetard} onChange={(e) => setSeulementRetard(e.target.checked)} />
              Seulement les échéances dépassées
            </label>
          </div>
          <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
            {() => (
              <Tableau
                lignes={lignes}
                colonnes={[
                  {
                    titre: 'Élève',
                    rendu: (l) => (
                      <Link to={`/eleves/${l.id}?onglet=paiements`} className="gras nowrap">
                        {l.nom} {l.prenom}
                      </Link>
                    ),
                  },
                  { titre: 'Classe', rendu: (l) => <span className="nowrap">{l.classe}</span> },
                  { titre: 'Frais de l’année', classe: 'num', rendu: (l) => montant(l.total_du) },
                  { titre: 'Payé', classe: 'num', rendu: (l) => montant(l.total_paye) },
                  { titre: 'En retard', classe: 'num', rendu: (l) => (l.retard > 0 ? <strong style={{ color: 'var(--marge-fonce)' }}>{montant(l.retard)}</strong> : <span className="muet">—</span>) },
                  { titre: 'Solde', classe: 'num', rendu: (l) => montant(l.solde) },
                  {
                    titre: 'Dernière relance',
                    rendu: (l) => (l.derniere_relance ? <span className="petit">{relatif(l.derniere_relance)} ({l.nb_relances})</span> : <Pastille ton="jaune">Jamais</Pastille>),
                  },
                ]}
                vide={<Vide icone={Wallet} titre="Aucun impayé" texte="Toutes les familles sont à jour de leurs paiements." />}
              />
            )}
          </Etat>
        </Feuille>
        <Feuille serre titre="Relances envoyées">
          {relances && relances.length ? (
            <ul className="liste-reglee">
              {relances.slice(0, 15).map((r) => (
                <li key={r.id}>
                  <BellRing size={17} color={r.automatique ? 'var(--encre)' : 'var(--ocre)'} aria-hidden="true" />
                  <div className="liste-reglee__principal">
                    <div className="liste-reglee__titre">
                      {r.prenom} {r.nom} <span className="muet petit">({r.classe})</span>
                    </div>
                    <div className="liste-reglee__meta">
                      {montant(r.montant_du)} dû, {r.automatique ? 'relance automatique' : 'relance manuelle'}, {relatif(r.created_at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Vide texte="Aucune relance envoyée cette année." />
          )}
        </Feuille>
      </div>
    </>
  );
}

function Tarifs() {
  const { annee, estAnneeCourante } = useAuth();
  const { donnees } = useDonnees(`/tarifs${qs({ annee })}`);
  const totalParNiveau = NIVEAUX.map((n) => ({ n, total: (donnees || []).filter((t) => !t.niveau || t.niveau === n).reduce((s, t) => s + t.montant, 0) }));
  return (
    <>
      <CrudPage
        titre="Grille tarifaire"
        description={`Frais de l’année ${annee} : inscription, tranches de scolarité et autres frais, avec leurs dates d’échéance (utilisées pour les relances).`}
        endpoint="/tarifs"
        requete={qs({ annee })}
        singulier="un tarif"
        icone={Receipt}
        peutCreer={estAnneeCourante}
        initial={{ type: 'tranche', niveau: '' }}
        rechercheSur={['libelle']}
        libelleSuppression={(t) => `« ${t.libelle} »`}
        messageSuppression={(t) => (t.nb_paiements ? `${t.nb_paiements} paiement(s) sont rattachés à ce tarif.` : 'Aucun paiement n’est rattaché à ce tarif.')}
        versFormulaire={(t) => ({ ...t, niveau: t.niveau || '', date_echeance: t.date_echeance || '' })}
        versApi={(v) => ({ ...v, niveau: v.niveau || null, date_echeance: v.date_echeance || null, annee_scolaire: annee })}
        champs={[
          { nom: 'libelle', label: 'Libellé', requis: true, plein: true, placeholder: 'Ex. Scolarité — 2e tranche' },
          { nom: 'type', label: 'Type', type: 'select', requis: true, options: Object.entries(LIBELLES.tarif).map(([k, l]) => ({ valeur: k, libelle: l })) },
          { nom: 'montant', label: 'Montant (DT)', type: 'number', requis: true, min: 0, step: 0.001 },
          { nom: 'niveau', label: 'Niveau', type: 'select', options: NIVEAUX.map((n) => ({ valeur: n, libelle: n })), placeholder: 'Tous les niveaux' },
          { nom: 'date_echeance', label: 'Date d’échéance', type: 'date' },
        ]}
        colonnes={[
          { titre: 'Libellé', rendu: (t) => <strong>{t.libelle}</strong> },
          { titre: 'Type', rendu: (t) => LIBELLES.tarif[t.type] },
          { titre: 'Niveau', rendu: (t) => (t.niveau ? <Pastille ton="bleu">{t.niveau}</Pastille> : <span className="muet">Tous</span>) },
          { titre: 'Échéance', rendu: (t) => (t.date_echeance ? dateCourte(t.date_echeance) : '—') },
          { titre: 'Montant', classe: 'num', rendu: (t) => <strong>{montant(t.montant)}</strong> },
          { titre: 'Paiements', classe: 'num', rendu: (t) => t.nb_paiements },
        ]}
      />
      {donnees && donnees.length > 0 && (
        <Feuille titre="Total annuel par niveau" serre>
          <div className="chiffres">
            {totalParNiveau.map((x) => (
              <div key={x.n} className="chiffre">
                <span className="chiffre__valeur" style={{ fontSize: 'var(--t-lg)' }}>
                  {montant(x.total)}
                </span>
                <span className="chiffre__libelle">{x.n}</span>
              </div>
            ))}
          </div>
        </Feuille>
      )}
    </>
  );
}

export default function Finances({ vue }) {
  if (vue === 'impayes') return <Impayes />;
  if (vue === 'tarifs') return <Tarifs />;
  return <Paiements />;
}
