import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn, UserPlus } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../contexte/Auth.jsx';
import { Champ, Encart, Bouton } from '../composants/ui.jsx';

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** La date écrite en haut de la page, comme dans un cahier d'écolier. */
function dateDuJour() {
  const d = new Date();
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function Connexion() {
  const { utilisateur, connexion } = useAuth();
  const [infos, setInfos] = useState(null);
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [visible, setVisible] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const naviguer = useNavigate();
  const lieu = useLocation();

  useEffect(() => {
    api.get('/public/infos').then(setInfos).catch(() => {});
  }, []);

  if (utilisateur) return <Navigate to={(lieu.state && lieu.state.depuis) || '/'} replace />;

  const seConnecter = async (e, identifiants) => {
    if (e) e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await connexion(identifiants ? identifiants.email : email, identifiants ? identifiants.motDePasse : motDePasse);
      naviguer((lieu.state && lieu.state.depuis) || '/', { replace: true });
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  };

  const nom = (infos && infos.nom_ecole) || 'École primaire';

  return (
    <div className="page-publique">
      <section className="cahier" aria-label="Présentation">
        <div>
          <p className="cahier__date">{dateDuJour()}</p>
          <p className="cahier__ecole">{nom}</p>
          <p className="cahier__titre">La vie de l’école, au même endroit.</p>
          <ul className="cahier__lignes">
            <li>les notes et les bulletins de chaque trimestre</li>
            <li>les devoirs, les dépôts et les corrections</li>
            <li>l’emploi du temps de la semaine</li>
            <li>les paiements, avec un reçu à chaque versement</li>
            <li>les messages entre parents, enseignants et direction</li>
          </ul>
        </div>
        <p className="cahier__ecole petit">{infos ? infos.adresse_ecole : ''}</p>
      </section>

      <section className="connexion">
        <div className="connexion__boite">
          <h1>Connexion</h1>
          <p className="muet" style={{ margin: '8px 0 24px' }}>
            Utilisez l’adresse e-mail et le mot de passe remis par l’école.
          </p>
          {erreur && (
            <div style={{ marginBottom: 16 }}>
              <Encart ton="alerte">{erreur}</Encart>
            </div>
          )}
          <form onSubmit={seConnecter} style={{ display: 'grid', gap: 16 }}>
            <Champ label="Adresse e-mail">
              {(id) => <input id={id} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />}
            </Champ>
            <Champ label="Mot de passe">
              {(id) => (
                <div style={{ position: 'relative' }}>
                  <input
                    id={id}
                    type={visible ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={motDePasse}
                    onChange={(e) => setMotDePasse(e.target.value)}
                    required
                    style={{ paddingRight: 46 }}
                  />
                  <button
                    type="button"
                    className="btn btn--fantome btn--icone btn--petit"
                    style={{ position: 'absolute', right: 5, top: 5 }}
                    onClick={() => setVisible((v) => !v)}
                    aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              )}
            </Champ>
            <Bouton type="submit" variante="primaire" icone={LogIn} chargement={envoi} className="btn--bloc">
              Se connecter
            </Bouton>
            <p className="petit muet">Mot de passe oublié ? Demandez-en un nouveau au secrétariat.</p>
          </form>

          <p className="petit" style={{ marginTop: 20 }}>
            Nouvelle famille ?{' '}
            <Link to="/preinscription" style={{ fontWeight: 700 }}>
              <UserPlus size={15} style={{ verticalAlign: '-2px', marginRight: 4 }} aria-hidden="true" />
              Pré-inscrire mon enfant en ligne
            </Link>
          </p>

          {infos && infos.demo && (
            <div className="comptes-demo">
              <h2 style={{ fontSize: 'var(--t-base)' }}>Comptes de démonstration</h2>
              <p className="petit muet">
                Un clic pour se connecter. Mot de passe commun : <strong>{infos.demo.mot_de_passe}</strong>
              </p>
              <div className="comptes-demo__liste">
                {infos.demo.comptes.map((c) => (
                  <button
                    key={c.email}
                    type="button"
                    className="compte-demo"
                    disabled={envoi}
                    onClick={() => seConnecter(null, { email: c.email, motDePasse: infos.demo.mot_de_passe })}
                  >
                    <span className="gras">{c.libelle}</span>
                    <span className="petit muet">{c.email}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
