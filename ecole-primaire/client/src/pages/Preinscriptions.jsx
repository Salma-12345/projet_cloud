import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ExternalLink, UserPlus, X } from 'lucide-react';
import { api, qs } from '../api.js';
import { useAuth } from '../contexte/Auth.jsx';
import { useRetours } from '../contexte/Retours.jsx';
import { useDonnees } from '../utils/useDonnees.js';
import { Bouton, Champ, Encart, Etat, Feuille, Modale, Onglets, PageTete, Pastille, Vide } from '../composants/ui.jsx';
import Identifiants from '../composants/Identifiants.jsx';
import { LIBELLES, age, date, relatif } from '../utils/format.js';

function ModaleValidation({ demande, onFermer, onTermine }) {
  const { annee, utilisateur } = useAuth();
  const { donnees: classes } = useDonnees(`/classes${qs({ annee })}`);
  const [classe, setClasse] = useState('auto');
  const [compteEleve, setCompteEleve] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState(null);
  const niveau = demande.niveau_souhaite || demande.niveau_theorique;

  const valider = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      setResultat(await api.post(`/preinscriptions/${demande.id}/valider`, { classe_id: classe === 'auto' ? null : Number(classe), niveau, creer_compte_eleve: compteEleve }));
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  };

  if (resultat) {
    return (
      <Modale
        titre="Inscription validée"
        onFermer={onTermine}
        pied={
          <>
            <Link className="btn btn--secondaire" to={`/eleves/${resultat.eleve.id}`}>
              <ExternalLink size={17} aria-hidden="true" /> Ouvrir le dossier
            </Link>
            <Bouton variante="primaire" onClick={onTermine}>
              Terminer
            </Bouton>
          </>
        }
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <Encart ton="succes">
            {resultat.eleve.prenom} {resultat.eleve.nom} est inscrit(e) en <strong>{resultat.classe.nom}</strong> (matricule {resultat.eleve.matricule}).
            {resultat.parent_existant && ' Le parent avait déjà un compte : l’enfant a été ajouté à son espace.'}
          </Encart>
          <Identifiants liste={resultat.identifiants} emailActif={utilisateur.email_actif} />
        </div>
      </Modale>
    );
  }

  return (
    <Modale
      titre={`Valider la demande ${demande.reference}`}
      sousTitre={`${demande.enfant_prenom} ${demande.enfant_nom}, ${age(demande.date_naissance)}`}
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" form="form-valider" variante="primaire" chargement={envoi} icone={Check}>
            Valider l’inscription
          </Bouton>
        </>
      }
    >
      <form id="form-valider" onSubmit={valider} style={{ display: 'grid', gap: 16 }}>
        {erreur && <Encart ton="alerte">{erreur}</Encart>}
        <p className="petit">
          Le dossier de l’élève sera créé, le compte du parent ({demande.email}) ouvert si nécessaire, et les identifiants envoyés par e-mail.
        </p>
        <Champ label="Classe" aide={`Niveau ${demande.niveau_souhaite ? 'demandé' : 'selon l’âge'} : ${niveau}`}>
          {(id) => (
            <select id={id} value={classe} onChange={(e) => setClasse(e.target.value)}>
              <option value="auto">Automatique : classe de {niveau} la moins chargée</option>
              {(classes || []).map((c) => (
                <option key={c.id} value={c.id} disabled={c.effectif >= c.capacite_max}>
                  {c.nom} — {c.effectif}/{c.capacite_max}
                  {c.effectif >= c.capacite_max ? ' (complète)' : ''}
                </option>
              ))}
            </select>
          )}
        </Champ>
        <label className="case">
          <input type="checkbox" checked={compteEleve} onChange={(e) => setCompteEleve(e.target.checked)} />
          Créer aussi un compte pour l’élève
        </label>
      </form>
    </Modale>
  );
}

export default function Preinscriptions() {
  const [statut, setStatut] = useState('en_attente');
  const { succes, erreur: toastErreur } = useRetours();
  const { donnees, chargement, erreur, recharger } = useDonnees(`/preinscriptions?statut=${statut}`);
  const [valider, setValider] = useState(null);
  const [refus, setRefus] = useState(null);
  const [motif, setMotif] = useState('');

  const refuser = async () => {
    try {
      await api.post(`/preinscriptions/${refus.id}/refuser`, { motif });
      succes('Demande refusée.');
      setRefus(null);
      setMotif('');
      recharger();
    } catch (e) {
      toastErreur(e);
    }
  };

  return (
    <>
      <PageTete titre="Pré-inscriptions" texte="Demandes déposées en ligne par les familles depuis la page publique « Pré-inscrire mon enfant »." />
      <Onglets
        actif={statut}
        onChange={setStatut}
        onglets={[
          { cle: 'en_attente', libelle: 'À traiter' },
          { cle: 'validee', libelle: 'Validées' },
          { cle: 'refusee', libelle: 'Refusées' },
          { cle: 'toutes', libelle: 'Toutes' },
        ]}
      />
      <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
        {(liste) =>
          liste.length === 0 ? (
            <Feuille>
              <Vide icone={UserPlus} titre="Aucune demande" texte={statut === 'en_attente' ? 'Toutes les demandes ont été traitées.' : 'Rien à afficher dans cette catégorie.'} />
            </Feuille>
          ) : (
            <div className="pile">
              {liste.map((d) => (
                <section key={d.id} className="feuille" aria-label={`Demande ${d.reference}`}>
                  <div className="feuille__tete">
                    <div>
                      <h2>
                        {d.enfant_prenom} {d.enfant_nom}
                      </h2>
                      <p>
                        Demande {d.reference}, reçue {relatif(d.created_at)}
                      </p>
                    </div>
                    <div className="groupe-btn">
                      <Pastille ton={d.statut === 'validee' ? 'vert' : d.statut === 'refusee' ? 'rouge' : 'jaune'}>{LIBELLES.preinscription[d.statut]}</Pastille>
                      {d.statut === 'en_attente' && (
                        <>
                          <Bouton petit variante="danger" icone={X} onClick={() => setRefus(d)}>
                            Refuser
                          </Bouton>
                          <Bouton petit variante="primaire" icone={Check} onClick={() => setValider(d)}>
                            Valider
                          </Bouton>
                        </>
                      )}
                      {d.statut === 'validee' && d.eleve_id && (
                        <Link className="btn btn--secondaire btn--petit" to={`/eleves/${d.eleve_id}`}>
                          Dossier de l’élève
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="feuille__corps grille-2">
                    <dl className="definitions">
                      <dt>Naissance</dt>
                      <dd>
                        {date(d.date_naissance)} ({age(d.date_naissance)}){d.lieu_naissance ? `, ${d.lieu_naissance}` : ''}
                      </dd>
                      <dt>Niveau</dt>
                      <dd>{d.niveau_souhaite ? `${d.niveau_souhaite} (demandé)` : `${d.niveau_theorique} (selon l’âge)`}</dd>
                      <dt>École précédente</dt>
                      <dd>{d.ecole_precedente || '—'}</dd>
                      <dt>Médical</dt>
                      <dd>{d.antecedents_medicaux || '—'}</dd>
                    </dl>
                    <dl className="definitions">
                      <dt>Responsable</dt>
                      <dd>
                        {d.parent_prenom} {d.parent_nom} ({d.lien})
                      </dd>
                      <dt>Contact</dt>
                      <dd>
                        {d.email}
                        <br />
                        {d.telephone}
                      </dd>
                      <dt>Consentement</dt>
                      <dd>{d.consentement ? `Oui, le ${date(d.consentement_at)}` : 'Non'}</dd>
                      {d.parent_existant_id && (
                        <>
                          <dt>Compte</dt>
                          <dd>
                            <Pastille ton="bleu">Parent déjà inscrit</Pastille>
                          </dd>
                        </>
                      )}
                      {d.statut !== 'en_attente' && (
                        <>
                          <dt>Traité par</dt>
                          <dd>
                            {d.traite_par_nom}, {relatif(d.traite_at)}
                            {d.motif_refus ? ` — ${d.motif_refus}` : ''}
                          </dd>
                        </>
                      )}
                    </dl>
                  </div>
                </section>
              ))}
            </div>
          )
        }
      </Etat>
      {valider && (
        <ModaleValidation
          demande={valider}
          onFermer={() => setValider(null)}
          onTermine={() => {
            setValider(null);
            recharger();
          }}
        />
      )}
      {refus && (
        <Modale
          titre="Refuser la demande"
          sousTitre={`${refus.enfant_prenom} ${refus.enfant_nom}`}
          onFermer={() => setRefus(null)}
          etroite
          pied={
            <>
              <Bouton onClick={() => setRefus(null)}>Annuler</Bouton>
              <Bouton variante="danger-plein" onClick={refuser}>
                Refuser la demande
              </Bouton>
            </>
          }
        >
          <Champ label="Motif (facultatif)">{(id) => <textarea id={id} value={motif} onChange={(e) => setMotif(e.target.value)} rows={3} />}</Champ>
        </Modale>
      )}
    </>
  );
}
