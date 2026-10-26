// Affichage des identifiants créés (à transmettre aux familles).
import { Copy, KeyRound } from 'lucide-react';
import { useRetours } from '../contexte/Retours.jsx';
import { Bouton, Encart } from './ui.jsx';
import { LIBELLES } from '../utils/format.js';

export default function Identifiants({ liste, emailActif }) {
  const { succes } = useRetours();
  if (!liste || !liste.length) return null;
  const copier = (i) => {
    navigator.clipboard
      .writeText(`Identifiant : ${i.email}\nMot de passe provisoire : ${i.mot_de_passe}`)
      .then(() => succes('Identifiants copiés.'))
      .catch(() => {});
  };
  return (
    <div className="identifiants">
      <Encart icone={KeyRound}>
        {emailActif
          ? 'Les identifiants ont été envoyés par e-mail. Vous pouvez aussi les transmettre en main propre.'
          : 'Transmettez ces identifiants à la famille (e-mail simulé, consultable dans le journal des envois). Le mot de passe devra être changé à la première connexion.'}
      </Encart>
      {liste.map((i) => (
        <div key={i.email} className="identifiant">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div>
              <div className="gras">
                {i.nom} <span className="pastille pastille--bleu">{LIBELLES.role[i.role] || i.role}</span>
              </div>
              <div className="petit" style={{ marginTop: 6 }}>
                Identifiant : <code>{i.email}</code>
              </div>
              <div className="petit" style={{ marginTop: 4 }}>
                Mot de passe provisoire : <code>{i.mot_de_passe}</code>
              </div>
            </div>
            <Bouton petit icone={Copy} onClick={() => copier(i)}>
              Copier
            </Bouton>
          </div>
        </div>
      ))}
    </div>
  );
}
