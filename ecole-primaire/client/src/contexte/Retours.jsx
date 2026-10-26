// Messages éphémères (toasts) et boîte de confirmation (promesse).
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { Modale } from '../composants/ui.jsx';
import { api } from '../api.js';

const RetoursContexte = createContext(null);

export function RetoursProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmation, setConfirmation] = useState(null);
  const resolveur = useRef(null);

  const retirer = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const ajouter = useCallback(
    (type, texte) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((t) => [...t.slice(-3), { id, type, texte }]);
      setTimeout(() => retirer(id), type === 'erreur' ? 7000 : 4500);
    },
    [retirer]
  );

  const confirmer = useCallback(
    (options) =>
      new Promise((resolve) => {
        resolveur.current = resolve;
        setConfirmation(options);
      }),
    []
  );
  const repondre = (ok) => {
    setConfirmation(null);
    if (resolveur.current) resolveur.current(ok);
    resolveur.current = null;
  };

  const valeur = useMemo(
    () => ({
      succes: (t) => ajouter('succes', t),
      erreur: (t) => ajouter('erreur', t instanceof Error ? t.message : t),
      info: (t) => ajouter('info', t),
      confirmer,
    }),
    [ajouter, confirmer]
  );

  return (
    <RetoursContexte.Provider value={valeur}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.type}`}>
            {t.type === 'succes' ? <CircleCheck size={20} color="var(--vert)" /> : t.type === 'erreur' ? <CircleAlert size={20} color="var(--marge)" /> : <Info size={20} color="var(--encre)" />}
            <p>{t.texte}</p>
            <button className="btn btn--fantome btn--icone btn--petit" onClick={() => retirer(t.id)} aria-label="Fermer">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
      {confirmation && (
        <Modale
          titre={confirmation.titre || 'Confirmer'}
          etroite
          onFermer={() => repondre(false)}
          pied={
            <>
              <button className="btn btn--secondaire" onClick={() => repondre(false)}>
                {confirmation.annuler || 'Annuler'}
              </button>
              <button className={`btn ${confirmation.danger ? 'btn--danger-plein' : 'btn--primaire'}`} onClick={() => repondre(true)} autoFocus>
                {confirmation.libelle || 'Confirmer'}
              </button>
            </>
          }
        >
          <p className="pre">{confirmation.message}</p>
        </Modale>
      )}
    </RetoursContexte.Provider>
  );
}

export const useRetours = () => useContext(RetoursContexte);

/**
 * Suppression contrôlée : confirmation, puis si le serveur exige une confirmation explicite (409),
 * affichage de son explication et nouvel appel avec ?force=1.
 */
export function useSuppression() {
  const { confirmer, succes, erreur } = useRetours();
  return useCallback(
    async (url, { titre = 'Supprimer', message, messageSucces = 'Suppression effectuée.' } = {}) => {
      const ok = await confirmer({ titre, message, libelle: 'Supprimer', danger: true });
      if (!ok) return false;
      try {
        await api.del(url);
        succes(messageSucces);
        return true;
      } catch (e) {
        if (e.status === 409 && e.donnees.confirmationRequise) {
          const ok2 = await confirmer({ titre: 'Confirmation nécessaire', message: e.message, libelle: 'Confirmer la suppression', danger: true });
          if (!ok2) return false;
          try {
            await api.del(`${url}${url.includes('?') ? '&' : '?'}force=1`);
            succes(messageSucces);
            return true;
          } catch (e2) {
            erreur(e2);
            return false;
          }
        }
        erreur(e);
        return false;
      }
    },
    [confirmer, succes, erreur]
  );
}
