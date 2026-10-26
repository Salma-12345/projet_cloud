import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, EyeOff, FileText, Inbox, Lock, PenLine, Send, Trash2, X } from 'lucide-react';
import { api, formulaire } from '../api.js';
import { useAuth } from '../contexte/Auth.jsx';
import { useRetours } from '../contexte/Retours.jsx';
import { useDonnees } from '../utils/useDonnees.js';
import { Avatar, Bouton, Champ, Encart, Etat, Modale, Onglets, PageTete, Pastille, Recherche, Vide } from '../composants/ui.jsx';
import { ListeFichiers, SelecteurFichiers } from '../composants/Fichiers.jsx';
import { LIBELLES, dateHeure, relatif } from '../utils/format.js';

function Composer({ brouillon, preselection = [], eleveInitial = '', onFermer, onTermine }) {
  const { role, utilisateur } = useAuth();
  const { donnees: contacts } = useDonnees('/messages/contacts');
  const [dest, setDest] = useState(brouillon ? brouillon.destinataires.map((d) => d.id) : preselection);
  const [q, setQ] = useState('');
  const [objet, setObjet] = useState(brouillon ? brouillon.objet : '');
  const [corps, setCorps] = useState(brouillon ? brouillon.corps : '');
  const [eleveId, setEleveId] = useState(brouillon && brouillon.eleve_id ? String(brouillon.eleve_id) : eleveInitial ? String(eleveInitial) : '');
  const [important, setImportant] = useState(false);
  const [fichiers, setFichiers] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (preselection.length) setDest(preselection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselection.join(',')]);

  const filtres = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (contacts || []).filter((c) => !t || `${c.prenom} ${c.nom} ${c.contextes.join(' ')} ${(c.matieres || []).join(' ')}`.toLowerCase().includes(t));
  }, [contacts, q]);
  const choisis = (contacts || []).filter((c) => dest.includes(c.id));
  const elevesPossibles = useMemo(() => {
    if (role === 'parent') return utilisateur.enfants.map((e) => ({ id: e.id, nom: `${e.prenom} ${e.nom}` }));
    const m = new Map();
    for (const c of choisis) for (const e of c.eleves) m.set(e.id, e);
    return [...m.values()];
  }, [choisis, role, utilisateur]);

  const envoyer = async (envoyerMaintenant) => {
    setEnvoi(true);
    setErreur(null);
    const fd = formulaire({
      destinataires: dest.join(','),
      objet,
      corps,
      eleve_id: eleveId || '',
      envoyer: envoyerMaintenant,
      important,
      fichiers,
    });
    try {
      const r = brouillon ? await api.put(`/messages/${brouillon.id}`, fd) : await api.post('/messages', fd);
      onTermine(r, envoyerMaintenant ? 'Message envoyé.' : 'Brouillon enregistré.');
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnvoi(false);
    }
  };

  const supprimerBrouillon = async () => {
    await api.del(`/messages/${brouillon.id}`);
    onTermine(null, 'Brouillon supprimé.');
  };

  const groupes = {};
  for (const c of filtres) (groupes[c.libelle_role] = groupes[c.libelle_role] || []).push(c);

  return (
    <Modale
      large
      titre={brouillon ? 'Brouillon' : 'Nouveau message'}
      sousTitre="Vous ne pouvez écrire qu’aux personnes autorisées par votre rôle. Un message envoyé ne peut plus être modifié ni supprimé."
      onFermer={onFermer}
      pied={
        <>
          {brouillon && (
            <Bouton variante="danger" icone={Trash2} onClick={supprimerBrouillon} style={{ marginRight: 'auto' }}>
              Supprimer le brouillon
            </Bouton>
          )}
          <Bouton onClick={() => envoyer(false)} disabled={envoi || !objet || !corps}>
            Enregistrer le brouillon
          </Bouton>
          <Bouton variante="primaire" icone={Send} onClick={() => envoyer(true)} chargement={envoi} disabled={!dest.length || !objet || !corps}>
            Envoyer
          </Bouton>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 16 }}>
        {erreur && <Encart ton="alerte">{erreur}</Encart>}
        <div className="champ">
          <span className="champ__label">Destinataires</span>
          {choisis.length > 0 && (
            <div className="selection-dest">
              {choisis.map((c) => (
                <span key={c.id} className="jeton">
                  {c.prenom} {c.nom}
                  <button type="button" onClick={() => setDest(dest.filter((x) => x !== c.id))} aria-label={`Retirer ${c.prenom} ${c.nom}`}>
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <Recherche valeur={q} onChange={setQ} placeholder="Rechercher un destinataire" />
          <div className="choix-contacts" role="group" aria-label="Contacts">
            {!contacts ? (
              <p className="muet petit" style={{ padding: 12 }}>
                Chargement des contacts…
              </p>
            ) : (
              Object.entries(groupes).map(([groupe, liste]) => (
                <div key={groupe}>
                  <div className="petit gras muet" style={{ padding: '8px 12px', background: '#f8fafc' }}>
                    {groupe}
                  </div>
                  {liste.map((c) => (
                    <label key={c.id}>
                      <input type="checkbox" checked={dest.includes(c.id)} onChange={(e) => setDest(e.target.checked ? [...dest, c.id] : dest.filter((x) => x !== c.id))} />
                      <span>
                        <span className="gras">
                          {c.prenom} {c.nom}
                        </span>
                        <span className="petit muet" style={{ display: 'block' }}>
                          {[...c.contextes.slice(0, 2), ...(c.matieres ? [c.matieres.join(', ')] : [])].filter(Boolean).join(' ; ')}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
        <div className="grille-form">
          <Champ label="Objet" requis>
            {(id) => <input id={id} value={objet} onChange={(e) => setObjet(e.target.value)} required maxLength={200} />}
          </Champ>
          <Champ label="Élève concerné" aide="Range la conversation dans le fil de cet élève.">
            {(id) => (
              <select id={id} value={eleveId} onChange={(e) => setEleveId(e.target.value)}>
                <option value="">Aucun en particulier</option>
                {elevesPossibles.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nom}
                    {e.classe ? ` (${e.classe})` : ''}
                  </option>
                ))}
              </select>
            )}
          </Champ>
          <Champ label="Message" requis plein>
            {(id) => <textarea id={id} rows={7} value={corps} onChange={(e) => setCorps(e.target.value)} required />}
          </Champ>
        </div>
        {brouillon && brouillon.pieces_jointes.length > 0 && <ListeFichiers fichiers={brouillon.pieces_jointes} />}
        <SelecteurFichiers id="pj-message" fichiers={fichiers} onChange={setFichiers} label="Pièces jointes" />
        <label className="case">
          <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />
          Message important : prévenir aussi les destinataires par e-mail
        </label>
      </div>
    </Modale>
  );
}

function Fil({ id, onRetour, onChange }) {
  const { utilisateur } = useAuth();
  const { succes, erreur: toastErreur, confirmer } = useRetours();
  const { donnees, chargement, erreur, recharger } = useDonnees(`/messages/fil/${id}`);
  const [reponse, setReponse] = useState('');
  const [fichiers, setFichiers] = useState([]);
  const [envoi, setEnvoi] = useState(false);
  const fin = useRef(null);

  useEffect(() => {
    if (donnees) {
      onChange();
      // Défile la conversation (et non la page) jusqu'au dernier message
      const zone = fin.current && fin.current.parentElement;
      if (zone) zone.scrollTop = zone.scrollHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donnees]);

  const repondre = async (e) => {
    e.preventDefault();
    const dernier = donnees.messages[donnees.messages.length - 1];
    const participants = new Set();
    for (const m of donnees.messages) {
      if (m.expediteur_id !== utilisateur.id) participants.add(m.expediteur_id);
      for (const d of m.destinataires || []) if (d.id !== utilisateur.id) participants.add(d.id);
    }
    setEnvoi(true);
    try {
      await api.post(
        '/messages',
        formulaire({
          destinataires: [...participants].join(','),
          objet: donnees.objet.startsWith('RE:') ? donnees.objet : `RE: ${donnees.objet}`,
          corps: reponse,
          reponse_a: dernier.id,
          envoyer: true,
          fichiers,
        })
      );
      setReponse('');
      setFichiers([]);
      succes('Réponse envoyée.');
      recharger();
    } catch (err) {
      toastErreur(err);
    } finally {
      setEnvoi(false);
    }
  };

  const masquer = async (m) => {
    if (!(await confirmer({ titre: 'Retirer ce message de votre boîte ?', message: 'Il disparaît de votre liste, mais reste dans l’historique de la conversation et chez l’expéditeur (suppression côté destinataire uniquement).', libelle: 'Retirer de ma boîte' }))) return;
    await api.del(`/messages/${m.id}`);
    succes('Message retiré de votre boîte.');
    recharger();
  };

  return (
    <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
      {(f) => (
        <>
          <div className="feuille__tete">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <button className="btn btn--fantome btn--icone btn--petit fil-retour" onClick={onRetour} aria-label="Retour à la liste">
                <ArrowLeft size={18} />
              </button>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ overflowWrap: 'anywhere' }}>{f.objet}</h2>
                <p>
                  {f.eleve ? `Fil de ${f.eleve.prenom} ${f.eleve.nom}, ` : ''}
                  {f.messages.length} message(s)
                </p>
              </div>
            </div>
            <span className="petit muet" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <Lock size={14} aria-hidden="true" /> Historique en lecture seule
            </span>
          </div>
          <div className="bulles">
            {f.messages.map((m) => {
              const moi = m.expediteur_id === utilisateur.id;
              return (
                <article key={m.id} className={`bulle${moi ? ' bulle--moi' : ''}${m.automatique ? ' bulle--auto' : ''}`} aria-label={`Message de ${m.expediteur}`}>
                  <div className="bulle__tete">
                    <span>
                      <strong>{moi ? 'Vous' : m.expediteur}</strong> <span className="muet">({LIBELLES.role[m.expediteur_role]})</span>
                      {m.automatique && (
                        <>
                          {' '}
                          <Pastille ton="bleu">Message automatique</Pastille>
                        </>
                      )}
                    </span>
                    <span className="muet" title={dateHeure(m.envoye_at)}>
                      {relatif(m.envoye_at)}
                    </span>
                  </div>
                  <div className="bulle__corps">{m.corps}</div>
                  <ListeFichiers fichiers={m.pieces_jointes} />
                  <div className="bulle__pied">
                    {moi
                      ? `À ${(m.destinataires || []).map((d) => `${d.nom}${d.lu_at ? ' (lu)' : ''}`).join(', ')}`
                      : `À ${(m.destinataires || []).map((d) => (d.id === utilisateur.id ? 'vous' : d.nom)).join(', ')}`}
                    {!moi && m.mon_masque_at && ' — retiré de votre boîte'}
                    {!moi && !m.mon_masque_at && (
                      <button className="btn btn--fantome btn--petit" style={{ marginLeft: 8, height: 24 }} onClick={() => masquer(m)}>
                        <EyeOff size={13} aria-hidden="true" /> Retirer de ma boîte
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
            <div ref={fin} />
          </div>
          <form onSubmit={repondre} className="feuille__pied" style={{ display: 'grid', gap: 10 }}>
            <label htmlFor="reponse" className="visuellement-cache">
              Votre réponse
            </label>
            <textarea id="reponse" className="saisie" rows={3} value={reponse} onChange={(e) => setReponse(e.target.value)} placeholder="Écrire une réponse…" style={{ minHeight: 84 }} />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <SelecteurFichiers compact id={`pj-reponse-${id}`} fichiers={fichiers} onChange={setFichiers} />
              <Bouton type="submit" variante="primaire" icone={Send} chargement={envoi} disabled={!reponse.trim()}>
                Répondre
              </Bouton>
            </div>
          </form>
        </>
      )}
    </Etat>
  );
}

export default function Messagerie() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const naviguer = useNavigate();
  const { succes } = useRetours();
  const [boite, setBoite] = useState('tous');
  const [texte, setTexte] = useState('');
  const [compose, setCompose] = useState(null);
  const { donnees: contacts } = useDonnees(params.get('nouveau') ? '/messages/contacts' : null);
  const cheminListe = boite === 'brouillons' ? '/messages/brouillons' : `/messages?boite=${boite}${texte.length > 2 ? `&q=${encodeURIComponent(texte)}` : ''}`;
  const { donnees, chargement, erreur, recharger } = useDonnees(cheminListe);

  // Ouverture directe : /messagerie?nouveau=1&eleve=12 (écrire aux parents d'un élève)
  useEffect(() => {
    if (!params.get('nouveau') || !contacts) return;
    const eleve = Number(params.get('eleve'));
    const preselection = eleve ? contacts.filter((c) => c.role === 'parent' && c.eleves.some((e) => e.id === eleve)).map((c) => c.id) : [];
    setCompose({ preselection, eleve });
    setParams({}, { replace: true });
  }, [params, contacts, setParams]);

  return (
    <>
      <PageTete
        titre="Messagerie"
        texte="Échanges entre familles, enseignants et administration. Chaque conversation reste archivée en lecture seule."
        actions={
          <Bouton variante="primaire" icone={PenLine} onClick={() => setCompose({})}>
            Nouveau message
          </Bouton>
        }
      />
      <section className="feuille">
        <div className={`messagerie${id ? ' messagerie--fil-ouvert' : ''}`}>
          <div className="messagerie__liste">
            <Onglets
              actif={boite}
              onChange={setBoite}
              label="Dossiers"
              onglets={[
                { cle: 'tous', libelle: 'Toutes' },
                { cle: 'non_lus', libelle: 'Non lues' },
                { cle: 'envoyes', libelle: 'Envoyées' },
                { cle: 'brouillons', libelle: 'Brouillons' },
              ]}
            />
            {boite !== 'brouillons' && (
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--ligne)' }}>
                <Recherche valeur={texte} onChange={setTexte} placeholder="Rechercher dans les messages" />
              </div>
            )}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
                {(liste) =>
                  liste.length === 0 ? (
                    <Vide icone={boite === 'brouillons' ? FileText : Inbox} texte={boite === 'brouillons' ? 'Aucun brouillon.' : 'Aucune conversation.'} />
                  ) : boite === 'brouillons' ? (
                    liste.map((b) => (
                      <button key={b.id} className="conversation" onClick={() => setCompose({ brouillon: b })}>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span className="conversation__objet" style={{ display: 'block' }}>
                            {b.objet}
                          </span>
                          <span className="conversation__extrait" style={{ display: 'block' }}>
                            À {b.destinataires.map((d) => d.nom).join(', ') || 'personne'}, modifié {relatif(b.updated_at)}
                          </span>
                        </span>
                        <Pastille ton="jaune">Brouillon</Pastille>
                      </button>
                    ))
                  ) : (
                    liste.map((c) => (
                      <Link
                        key={c.racine}
                        to={`/messagerie/${c.dernier_id}`}
                        className={`conversation${c.non_lus ? ' conversation--non-lue' : ''}${id && (Number(id) === c.dernier_id || Number(id) === c.racine) ? ' conversation--active' : ''}`}
                      >
                        <Avatar prenom={(c.participants && c.participants[0] && c.participants[0].nom.split(' ')[0]) || '?'} nom={(c.participants && c.participants[0] && c.participants[0].nom.split(' ').slice(-1)[0]) || ''} taille="petit" />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span className="petit gras" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {(c.participants || []).map((p) => p.nom).join(', ')}
                            </span>
                            <span className="tres-petit muet nowrap">{relatif(c.dernier_at)}</span>
                          </span>
                          <span className="conversation__objet" style={{ display: 'block' }}>
                            {c.objet}
                          </span>
                          <span className="conversation__extrait" style={{ display: 'block' }}>
                            {c.extrait}
                          </span>
                          {c.eleve && (
                            <span className="pastille" style={{ marginTop: 6 }}>
                              Élève : {c.eleve}
                            </span>
                          )}
                        </span>
                        {c.non_lus > 0 && <span className="nav__compteur" style={{ marginLeft: 0 }}>{c.non_lus}</span>}
                      </Link>
                    ))
                  )
                }
              </Etat>
            </div>
          </div>
          <div className="messagerie__fil">
            {id ? (
              <Fil key={id} id={id} onRetour={() => naviguer('/messagerie')} onChange={recharger} />
            ) : (
              <Vide icone={Inbox} titre="Choisissez une conversation" texte="Ou écrivez un nouveau message à un enseignant, à un parent ou à l’administration." />
            )}
          </div>
        </div>
      </section>
      {compose && (
        <Composer
          brouillon={compose.brouillon}
          preselection={compose.preselection || []}
          eleveInitial={compose.eleve || ''}
          onFermer={() => setCompose(null)}
          onTermine={(r, msg) => {
            setCompose(null);
            succes(msg);
            recharger();
            if (r && r.statut === 'envoye') naviguer(`/messagerie/${r.id}`);
          }}
        />
      )}
    </>
  );
}
