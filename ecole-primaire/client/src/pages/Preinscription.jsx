// Formulaire public de pré-inscription (validé ensuite par l'administration).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CircleCheck } from 'lucide-react';
import { api } from '../api.js';
import { Bouton, Encart, Feuille } from '../composants/ui.jsx';
import { ChampsFormulaire } from '../composants/Formulaire.jsx';
import { date } from '../utils/format.js';

const ETAPES = ['L’enfant', 'Le responsable légal', 'Vérification'];

export default function Preinscription() {
  const [infos, setInfos] = useState(null);
  const [etape, setEtape] = useState(0);
  const [v, setV] = useState({ sexe: '', lien: '', consentement: false });
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState(null);

  useEffect(() => {
    api.get('/public/infos').then(setInfos).catch(() => {});
  }, []);

  const niveaux = ((infos && infos.niveaux) || []).map((n) => ({ valeur: n, libelle: n }));
  const champsEnfant = [
    { nom: 'enfant_prenom', label: 'Prénom', requis: true, autoComplete: 'off' },
    { nom: 'enfant_nom', label: 'Nom', requis: true },
    { nom: 'date_naissance', label: 'Date de naissance', type: 'date', requis: true },
    { nom: 'lieu_naissance', label: 'Lieu de naissance' },
    { nom: 'sexe', label: 'Sexe', type: 'select', requis: true, options: [{ valeur: 'F', libelle: 'Fille' }, { valeur: 'M', libelle: 'Garçon' }] },
    { nom: 'niveau_souhaite', label: 'Niveau souhaité', type: 'select', options: niveaux, placeholder: 'Selon l’âge (automatique)', aide: 'Laissez vide : l’école proposera le niveau correspondant à l’âge.' },
    { nom: 'ecole_precedente', label: 'École fréquentée précédemment', plein: true },
    { nom: 'antecedents_medicaux', label: 'Informations médicales utiles', type: 'textarea', lignes: 3, plein: true, aide: 'Allergies, traitement, asthme… Ces informations ne sont visibles que par l’équipe éducative.' },
  ];
  const champsParent = [
    { nom: 'parent_prenom', label: 'Prénom', requis: true, autoComplete: 'given-name' },
    { nom: 'parent_nom', label: 'Nom', requis: true, autoComplete: 'family-name' },
    { nom: 'lien', label: 'Lien avec l’enfant', type: 'select', requis: true, options: ['Mère', 'Père', 'Tuteur', 'Tutrice'].map((x) => ({ valeur: x, libelle: x })) },
    { nom: 'telephone', label: 'Téléphone', type: 'tel', requis: true, autoComplete: 'tel', placeholder: '+216 …' },
    { nom: 'email', label: 'Adresse e-mail', type: 'email', requis: true, autoComplete: 'email', plein: true, aide: 'Vos identifiants de connexion y seront envoyés après validation.' },
    { nom: 'adresse', label: 'Adresse', plein: true, autoComplete: 'street-address' },
  ];

  const manquants = (champs) => champs.filter((c) => c.requis && !String(v[c.nom] || '').trim()).map((c) => c.label);

  const suivant = (e) => {
    e.preventDefault();
    const m = manquants(etape === 0 ? champsEnfant : champsParent);
    if (m.length) {
      setErreur(`Champs à compléter : ${m.join(', ')}.`);
      return;
    }
    setErreur(null);
    setEtape((x) => x + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const envoyer = async (e) => {
    e.preventDefault();
    if (!v.consentement) {
      setErreur('Le consentement est nécessaire pour traiter la demande.');
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      setResultat(await api.post('/public/preinscriptions', v));
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--fond)' }}>
      <div className="preinscription">
        <div className="preinscription__tete">
          <span className="marque__logo" aria-hidden="true">
            é
          </span>
          <div>
            <p className="gras" style={{ fontFamily: 'var(--manuscrite)' }}>
              {infos ? infos.nom_ecole : 'École primaire'}
            </p>
            <p className="petit muet">Année scolaire {infos ? infos.annee_courante : ''}</p>
          </div>
        </div>
        <Link to="/connexion" className="fil-ariane">
          <ArrowLeft size={15} aria-hidden="true" /> Retour à la connexion
        </Link>
        <h1>Pré-inscription en ligne</h1>
        <p className="muet" style={{ marginTop: 8, maxWidth: '62ch' }}>
          Remplissez ce formulaire pour demander l’inscription de votre enfant. Le secrétariat étudie la demande puis vous envoie vos
          identifiants de connexion par e-mail.
        </p>

        {resultat ? (
          <Feuille className="" titre={null}>
            <div className="vide">
              <span className="vide__icone" style={{ background: 'var(--vert-pale)', color: 'var(--vert)' }}>
                <CircleCheck size={28} aria-hidden="true" />
              </span>
              <h2>Demande enregistrée</h2>
              <p>
                Votre numéro de dossier est <strong>{resultat.reference}</strong>. Conservez-le : il vous sera demandé si vous contactez le
                secrétariat. Vous recevrez un e-mail dès que la demande sera validée.
              </p>
              <Link to="/connexion" className="btn btn--secondaire" style={{ marginTop: 8 }}>
                Retour à la connexion
              </Link>
            </div>
          </Feuille>
        ) : (
          <>
            <ol className="etapes">
              {ETAPES.map((t, i) => (
                <li key={t} aria-current={i === etape ? 'step' : undefined} className={i < etape ? 'fait' : ''}>
                  {t}
                </li>
              ))}
            </ol>
            {erreur && (
              <div style={{ marginBottom: 16 }}>
                <Encart ton="alerte">{erreur}</Encart>
              </div>
            )}
            <form onSubmit={etape < 2 ? suivant : envoyer}>
              <section className="feuille">
                <div className="feuille__corps">
                  {etape === 0 && <ChampsFormulaire champs={champsEnfant} valeurs={v} onChange={setV} />}
                  {etape === 1 && <ChampsFormulaire champs={champsParent} valeurs={v} onChange={setV} />}
                  {etape === 2 && (
                    <div style={{ display: 'grid', gap: 20 }}>
                      <dl className="definitions">
                        <dt>Enfant</dt>
                        <dd>
                          {v.enfant_prenom} {v.enfant_nom}, né{v.sexe === 'F' ? 'e' : ''} le {date(v.date_naissance)}
                        </dd>
                        <dt>Niveau demandé</dt>
                        <dd>{v.niveau_souhaite || 'Selon l’âge'}</dd>
                        <dt>Responsable</dt>
                        <dd>
                          {v.parent_prenom} {v.parent_nom} ({v.lien})
                        </dd>
                        <dt>Contact</dt>
                        <dd>
                          {v.email}, {v.telephone}
                        </dd>
                      </dl>
                      <label className="case">
                        <input type="checkbox" checked={v.consentement} onChange={(e) => setV({ ...v, consentement: e.target.checked })} />
                        <span>
                          J’accepte que l’école traite ces données pour la scolarité de mon enfant. Je peux demander à tout moment l’accès à ces
                          données, leur export ou leur effacement auprès de la direction.
                        </span>
                      </label>
                    </div>
                  )}
                </div>
                <div className="feuille__pied groupe-btn groupe-btn--fin">
                  {etape > 0 && (
                    <Bouton onClick={() => setEtape((x) => x - 1)} disabled={envoi}>
                      Étape précédente
                    </Bouton>
                  )}
                  <Bouton type="submit" variante="primaire" chargement={envoi}>
                    {etape < 2 ? 'Continuer' : 'Envoyer la demande'}
                  </Bouton>
                </div>
              </section>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
