import { useEffect, useState } from 'react';
import { BellRing, KeyRound, Smartphone } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../contexte/Auth.jsx';
import { useRetours } from '../contexte/Retours.jsx';
import { Avatar, Bouton, Champ, Encart, Feuille, PageTete } from '../composants/ui.jsx';
import { LIBELLES } from '../utils/format.js';

function versUint8(base64) {
  const remplissage = '='.repeat((4 - (base64.length % 4)) % 4);
  const brut = atob((base64 + remplissage).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...brut].map((c) => c.charCodeAt(0)));
}

const pushPossible = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export default function Profil() {
  const { utilisateur, recharger } = useAuth();
  const { succes, erreur } = useRetours();
  const [mdp, setMdp] = useState({ ancien: '', nouveau: '', confirmation: '' });
  const [envoi, setEnvoi] = useState(false);
  const [erreurMdp, setErreurMdp] = useState(null);
  const [push, setPush] = useState('inconnu');
  const [installation, setInstallation] = useState(() => window.__installationPwa || null);

  useEffect(() => {
    if (!pushPossible()) {
      setPush('impossible');
      return;
    }
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setPush(sub && Notification.permission === 'granted' ? 'actif' : Notification.permission === 'denied' ? 'refuse' : 'inactif');
    });
    const capter = (e) => {
      e.preventDefault();
      window.__installationPwa = e;
      setInstallation(e);
    };
    window.addEventListener('beforeinstallprompt', capter);
    return () => window.removeEventListener('beforeinstallprompt', capter);
  }, []);

  const changerMdp = async (e) => {
    e.preventDefault();
    setErreurMdp(null);
    if (mdp.nouveau !== mdp.confirmation) {
      setErreurMdp('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }
    setEnvoi(true);
    try {
      await api.put('/auth/mot-de-passe', { ancien: mdp.ancien, nouveau: mdp.nouveau });
      succes('Mot de passe modifié.');
      setMdp({ ancien: '', nouveau: '', confirmation: '' });
      recharger();
    } catch (err) {
      setErreurMdp(err.message);
    } finally {
      setEnvoi(false);
    }
  };

  const activerPush = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPush('refuse');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const { cle } = await api.get('/push/cle');
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: versUint8(cle) });
      await api.post('/push/abonnement', sub.toJSON());
      setPush('actif');
      succes('Notifications activées sur cet appareil.');
    } catch (e) {
      erreur(e.message || 'Impossible d’activer les notifications sur cet appareil.');
    }
  };

  const desactiverPush = async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await api.del('/push/abonnement').catch(() => {});
      await sub.unsubscribe();
    }
    setPush('inactif');
    succes('Notifications désactivées sur cet appareil.');
  };

  return (
    <>
      <PageTete titre="Mon compte" texte="Mot de passe, notifications sur cet appareil et installation de l’application." />
      <div className="grille-principale">
        <div className="pile">
          <Feuille titre="Mes informations">
            <div className="fiche">
              <Avatar prenom={utilisateur.prenom} nom={utilisateur.nom} taille="grand" />
              <dl className="definitions fiche__infos">
                <dt>Nom</dt>
                <dd>
                  {utilisateur.prenom} {utilisateur.nom}
                </dd>
                <dt>Profil</dt>
                <dd>{LIBELLES.role[utilisateur.role]}</dd>
                <dt>Identifiant</dt>
                <dd>{utilisateur.email}</dd>
                {utilisateur.telephone && (
                  <>
                    <dt>Téléphone</dt>
                    <dd>{utilisateur.telephone}</dd>
                  </>
                )}
              </dl>
            </div>
          </Feuille>
          <Feuille titre="Changer de mot de passe">
            <form onSubmit={changerMdp} style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
              {utilisateur.doit_changer_mdp && <Encart ton="attention" icone={KeyRound}>Votre mot de passe actuel est provisoire : choisissez-en un personnel.</Encart>}
              {erreurMdp && <Encart ton="alerte">{erreurMdp}</Encart>}
              <Champ label="Mot de passe actuel" requis>
                {(id) => <input id={id} type="password" autoComplete="current-password" value={mdp.ancien} onChange={(e) => setMdp({ ...mdp, ancien: e.target.value })} required />}
              </Champ>
              <Champ label="Nouveau mot de passe" requis aide="8 caractères minimum.">
                {(id) => <input id={id} type="password" autoComplete="new-password" minLength={8} value={mdp.nouveau} onChange={(e) => setMdp({ ...mdp, nouveau: e.target.value })} required />}
              </Champ>
              <Champ label="Confirmer le nouveau mot de passe" requis>
                {(id) => <input id={id} type="password" autoComplete="new-password" minLength={8} value={mdp.confirmation} onChange={(e) => setMdp({ ...mdp, confirmation: e.target.value })} required />}
              </Champ>
              <div>
                <Bouton type="submit" variante="primaire" chargement={envoi}>
                  Enregistrer le mot de passe
                </Bouton>
              </div>
            </form>
          </Feuille>
        </div>
        <div className="pile">
          <Feuille titre="Notifications sur cet appareil">
            <p className="petit" style={{ marginBottom: 14 }}>
              Recevez une alerte pour chaque nouveau message, devoir, note publiée, paiement ou annonce, même quand l’application est fermée.
            </p>
            {push === 'impossible' && <Encart ton="attention">Ce navigateur ne gère pas les notifications push. Sur iPhone, installez d’abord l’application sur l’écran d’accueil.</Encart>}
            {push === 'refuse' && <Encart ton="attention">Les notifications sont bloquées pour ce site dans les réglages du navigateur.</Encart>}
            {push === 'actif' && (
              <div style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
                <Encart ton="succes" icone={BellRing}>
                  Notifications activées sur cet appareil.
                </Encart>
                <Bouton petit onClick={desactiverPush}>
                  Désactiver
                </Bouton>
              </div>
            )}
            {push === 'inactif' && (
              <Bouton variante="primaire" icone={BellRing} onClick={activerPush}>
                Activer les notifications
              </Bouton>
            )}
          </Feuille>
          <Feuille titre="Installer l’application">
            <p className="petit" style={{ marginBottom: 14 }}>
              L’application s’installe comme une application mobile, sans passer par un magasin d’applications.
            </p>
            {installation ? (
              <Bouton
                icone={Smartphone}
                onClick={async () => {
                  installation.prompt();
                  await installation.userChoice;
                  window.__installationPwa = null;
                  setInstallation(null);
                }}
              >
                Installer sur cet appareil
              </Bouton>
            ) : (
              <p className="petit muet">
                Sur Android : menu ⋮ puis « Installer l’application ». Sur iPhone : bouton Partager puis « Sur l’écran d’accueil ».
              </p>
            )}
          </Feuille>
        </div>
      </div>
    </>
  );
}
