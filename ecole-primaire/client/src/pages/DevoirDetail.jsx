import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Check, Eye, FileCheck2, Megaphone, Pencil, Send, Upload } from 'lucide-react';
import { api, formulaire } from '../api.js';
import { useAuth } from '../contexte/Auth.jsx';
import { useRetours } from '../contexte/Retours.jsx';
import { useDonnees } from '../utils/useDonnees.js';
import { Bouton, Champ, Encart, Etat, Feuille, Modale, NoteManuscrite, PageTete, Pastille, Tableau } from '../composants/ui.jsx';
import { ListeFichiers, SelecteurFichiers } from '../composants/Fichiers.jsx';
import { ModaleDevoir } from './Devoirs.jsx';
import { LIBELLES, TONS_SOUMISSION, dateHeure, echeance, nombre, relatif } from '../utils/format.js';

function LigneNote({ devoir, s, onEnregistre }) {
  const [note, setNote] = useState(s.soumission && s.soumission.note !== null ? String(s.soumission.note).replace('.', ',') : '');
  const [commentaire, setCommentaire] = useState((s.soumission && s.soumission.commentaire_enseignant) || '');
  const [envoi, setEnvoi] = useState(false);
  const { erreur } = useRetours();
  if (!s.soumission) return <span className="muet petit">{s.a_un_compte ? 'Pas encore rendu' : 'Élève sans compte'}</span>;
  const modifie = note !== (s.soumission.note !== null ? String(s.soumission.note).replace('.', ',') : '') || commentaire !== (s.soumission.commentaire_enseignant || '');
  const enregistrer = async () => {
    setEnvoi(true);
    try {
      await api.put(`/devoirs/${devoir.id}/soumissions/${s.soumission.id}`, { note: note.replace(',', '.'), commentaire });
      onEnregistre();
    } catch (e) {
      erreur(e);
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      <input
        className="saisie saisie-note"
        value={note}
        inputMode="decimal"
        placeholder={`/${nombre(devoir.bareme)}`}
        aria-label={`Note de ${s.prenom} sur ${devoir.bareme}`}
        onChange={(e) => setNote(e.target.value)}
      />
      <input className="saisie" style={{ width: 200 }} value={commentaire} placeholder="Commentaire" aria-label={`Commentaire pour ${s.prenom}`} onChange={(e) => setCommentaire(e.target.value)} />
      <Bouton petit variante={modifie ? 'primaire' : 'secondaire'} icone={Check} onClick={enregistrer} chargement={envoi} disabled={!modifie || note.trim() === ''} aria-label={`Enregistrer la note de ${s.prenom}`} />
    </div>
  );
}

function VueEnseignant({ d, recharger }) {
  const { succes, erreur, confirmer } = useRetours();
  const [modale, setModale] = useState(null);
  const [corrections, setCorrections] = useState([]);
  const [envoi, setEnvoi] = useState(false);
  const rendus = d.soumissions.filter((s) => s.soumission).length;
  const aPublier = d.soumissions.filter((s) => s.soumission && s.soumission.note !== null && !s.soumission.note_publiee_at).length;

  const publier = async () => {
    if (!(await confirmer({ titre: `Publier ${aPublier} note(s) ?`, message: 'Les élèves et leurs parents verront la note et votre commentaire, et recevront une notification.', libelle: 'Publier les notes' }))) return;
    try {
      const r = await api.post(`/devoirs/${d.id}/publier-notes`);
      succes(`${r.publiees} note(s) publiée(s).`);
      recharger();
    } catch (e) {
      erreur(e);
    }
  };

  const deposerCorrection = async () => {
    setEnvoi(true);
    try {
      await api.post(`/devoirs/${d.id}/correction`, formulaire({ fichiers: corrections }));
      succes(new Date(d.date_remise) <= new Date() ? 'Correction publiée.' : 'Correction déposée : elle sera visible après la date de remise.');
      setModale(null);
      setCorrections([]);
      recharger();
    } catch (e) {
      erreur(e);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <>
      <div className="pile">
        <div className="grille-2">
          <Feuille titre="Consignes" actions={<Bouton petit icone={Pencil} onClick={() => setModale('modifier')}>Modifier</Bouton>}>
            <p className="pre">{d.description || <span className="muet">Pas de consignes écrites.</span>}</p>
            <div style={{ marginTop: 12 }}>
              <ListeFichiers fichiers={d.fichiers} vide={<p className="muet petit">Aucun fichier joint.</p>} />
            </div>
          </Feuille>
          <Feuille titre="Correction" actions={<Bouton petit icone={Upload} onClick={() => setModale('correction')}>Déposer</Bouton>}>
            {d.corrections.length ? (
              <>
                <p className="petit muet" style={{ marginBottom: 6 }}>
                  {new Date(d.date_remise) <= new Date() ? 'Visible par les élèves et les parents.' : 'Sera visible après la date de remise.'}
                </p>
                <ListeFichiers
                  fichiers={d.corrections}
                  onRetirer={async (f) => {
                    if (await confirmer({ titre: 'Retirer ce fichier ?', message: f.nom_original, libelle: 'Retirer', danger: true })) {
                      await api.del(`/devoirs/${d.id}/fichiers/${f.id}`);
                      recharger();
                    }
                  }}
                />
              </>
            ) : (
              <p className="muet petit">Aucun corrigé déposé. Il sera visible par les élèves et les parents après la date de remise.</p>
            )}
          </Feuille>
        </div>
        <Feuille
          serre
          titre={`Travaux rendus (${rendus}/${d.soumissions.length})`}
          actions={
            aPublier > 0 && (
              <Bouton petit variante="primaire" icone={Megaphone} onClick={publier}>
                Publier {aPublier} note(s)
              </Bouton>
            )
          }
        >
          <Tableau
            lignes={d.soumissions}
            cle="eleve_id"
            colonnes={[
              { titre: 'Élève', rendu: (s) => <strong>{s.nom} {s.prenom}</strong> },
              {
                titre: 'Statut',
                rendu: (s) => (
                  <span>
                    <Pastille ton={TONS_SOUMISSION[s.statut]}>{LIBELLES.soumission[s.statut]}</Pastille>
                    {s.soumission && s.soumission.note !== null && !s.soumission.note_publiee_at && (
                      <span className="petit muet" style={{ display: 'block', marginTop: 4 }}>
                        Note non publiée
                      </span>
                    )}
                  </span>
                ),
              },
              {
                titre: 'Dépôt',
                rendu: (s) =>
                  s.soumission ? (
                    <span>
                      <span className="petit muet">{relatif(s.soumission.depose_at)}</span>
                      {new Date(s.soumission.depose_at) > new Date(d.date_remise) && (
                        <>
                          {' '}
                          <Pastille ton="jaune">en retard</Pastille>
                        </>
                      )}
                      <ListeFichiers fichiers={s.soumission.fichiers} />
                      {s.soumission.commentaire_eleve && <span className="petit" style={{ display: 'block', marginTop: 4 }}>« {s.soumission.commentaire_eleve} »</span>}
                    </span>
                  ) : (
                    <span className="muet">—</span>
                  ),
              },
              { titre: 'Note et commentaire', classe: 'texte-droite', rendu: (s) => <LigneNote key={s.soumission ? s.soumission.id : s.eleve_id} devoir={d} s={s} onEnregistre={() => { succes('Note enregistrée (non publiée).'); recharger(); }} /> },
            ]}
          />
        </Feuille>
      </div>
      {modale === 'modifier' && (
        <ModaleDevoir
          devoir={d}
          onFermer={() => setModale(null)}
          onTermine={(r, msg) => {
            setModale(null);
            succes(msg);
            recharger();
          }}
        />
      )}
      {modale === 'correction' && (
        <Modale
          titre="Déposer la correction"
          onFermer={() => setModale(null)}
          pied={
            <>
              <Bouton onClick={() => setModale(null)}>Annuler</Bouton>
              <Bouton variante="primaire" icone={FileCheck2} onClick={deposerCorrection} chargement={envoi} disabled={!corrections.length}>
                Déposer la correction
              </Bouton>
            </>
          }
        >
          <SelecteurFichiers id="corrige" fichiers={corrections} onChange={setCorrections} label="Corrigé (PDF, image ou document)" />
        </Modale>
      )}
    </>
  );
}

function VueFamille({ d, recharger }) {
  const { role } = useAuth();
  const { succes, erreur } = useRetours();
  const [fichiers, setFichiers] = useState([]);
  const [commentaire, setCommentaire] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const s = d.soumission;
  const echu = new Date(d.date_remise) <= new Date();

  const deposer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    try {
      const r = await api.post(`/devoirs/${d.id}/soumission`, formulaire({ fichiers, commentaire }));
      succes(r.en_retard ? 'Travail déposé (en retard).' : s && s.id ? 'Dépôt remplacé.' : 'Travail déposé. Ton enseignant(e) est prévenu(e).');
      setFichiers([]);
      setCommentaire('');
      recharger();
    } catch (err) {
      erreur(err);
    } finally {
      setEnvoi(false);
    }
  };

  const marquerVu = async () => {
    try {
      await api.post(`/devoirs/${d.id}/vu`, { eleve_id: d.eleve_id });
      succes('Marqué comme vu.');
      recharger();
    } catch (e) {
      erreur(e);
    }
  };

  return (
    <div className="grille-principale">
      <div className="pile">
        <Feuille titre="Consignes">
          <p className="pre">{d.description || <span className="muet">Pas de consignes écrites.</span>}</p>
          <div style={{ marginTop: 12 }}>
            <ListeFichiers fichiers={d.fichiers} vide={<p className="muet petit">Aucun fichier joint.</p>} />
          </div>
        </Feuille>
        {role === 'eleve' && d.peut_deposer && (
          <Feuille titre={s && s.id ? 'Remplacer mon dépôt' : 'Déposer mon travail'}>
            <form onSubmit={deposer} style={{ display: 'grid', gap: 14 }}>
              {echu && !s.id && <Encart ton="attention">La date de remise est passée : ton travail sera marqué « en retard ».</Encart>}
              <SelecteurFichiers id="depot" fichiers={fichiers} onChange={setFichiers} label="Mon travail (photo, PDF ou document)" />
              <Champ label="Un mot pour ton enseignant(e) (facultatif)">{(id) => <input id={id} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />}</Champ>
              <div>
                <Bouton type="submit" variante="primaire" icone={Send} chargement={envoi} disabled={!fichiers.length}>
                  {s && s.id ? 'Remplacer mon dépôt' : 'Déposer mon travail'}
                </Bouton>
              </div>
            </form>
          </Feuille>
        )}
        {d.correction_disponible && (
          <Feuille titre="Correction">
            <ListeFichiers fichiers={d.corrections} />
          </Feuille>
        )}
      </div>
      <div className="pile">
        <Feuille titre={role === 'eleve' ? 'Mon dépôt' : 'Dépôt de l’élève'}>
          <div style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
            <Pastille ton={TONS_SOUMISSION[s.statut]}>{LIBELLES.soumission[s.statut]}</Pastille>
            {s.id ? (
              <>
                <p className="petit">
                  Déposé {relatif(s.depose_at)}
                  {s.en_retard ? ' (en retard)' : ''}
                  {s.modifie_at ? ', remplacé depuis' : ''}.
                </p>
                <ListeFichiers fichiers={s.fichiers} />
              </>
            ) : (
              <p className="petit muet">{echu ? 'Aucun travail déposé.' : `À rendre ${echeance(d.date_remise)}.`}</p>
            )}
            {s.note !== null && s.note !== undefined && (
              <>
                <NoteManuscrite valeur={s.note} sur={d.bareme} taille="grande" anime />
                {s.commentaire_enseignant && <p className="pre">« {s.commentaire_enseignant} »</p>}
              </>
            )}
            {s.id && (s.note === null || s.note === undefined) && <p className="petit muet">La note apparaîtra ici quand l’enseignant(e) l’aura publiée.</p>}
          </div>
        </Feuille>
        {role === 'parent' && (
          <Feuille titre="Suivi parent">
            {d.vu_at ? (
              <p className="petit">
                <Eye size={15} style={{ verticalAlign: '-2px' }} aria-hidden="true" /> Vous avez consulté ce devoir {relatif(d.vu_at)}.
              </p>
            ) : (
              <Bouton icone={Eye} onClick={marquerVu}>
                Marquer comme vu
              </Bouton>
            )}
          </Feuille>
        )}
      </div>
    </div>
  );
}

export default function DevoirDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { role } = useAuth();
  const eleveId = params.get('eleve_id');
  const { donnees, chargement, erreur, recharger } = useDonnees(`/devoirs/${id}${eleveId ? `?eleve_id=${eleveId}` : ''}`);
  const personnel = role === 'admin' || role === 'enseignant';
  return (
    <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
      {(d) => (
        <>
          <PageTete
            titre={d.titre}
            texte={`${d.matiere}, ${d.classe}, ${d.enseignant}. À rendre le ${dateHeure(d.date_remise)} (${echeance(d.date_remise)}), noté sur ${nombre(d.bareme)}.`}
            retour={{ to: '/devoirs', libelle: 'Devoirs' }}
          />
          {personnel ? <VueEnseignant d={d} recharger={recharger} /> : <VueFamille d={d} recharger={recharger} />}
        </>
      )}
    </Etat>
  );
}
