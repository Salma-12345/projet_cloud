import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

/** Charge une ressource de l'API ; garde les données précédentes pendant un rechargement. */
export function useDonnees(chemin) {
  const [etat, setEtat] = useState({ donnees: null, chargement: Boolean(chemin), erreur: null });
  const [cle, setCle] = useState(0);

  useEffect(() => {
    if (!chemin) {
      setEtat({ donnees: null, chargement: false, erreur: null });
      return undefined;
    }
    let actif = true;
    setEtat((e) => ({ ...e, chargement: true, erreur: null }));
    api
      .get(chemin)
      .then((d) => actif && setEtat({ donnees: d, chargement: false, erreur: null }))
      .catch((e) => actif && setEtat({ donnees: null, chargement: false, erreur: e }));
    return () => {
      actif = false;
    };
  }, [chemin, cle]);

  const recharger = useCallback(() => setCle((k) => k + 1), []);
  const modifier = useCallback((f) => setEtat((e) => ({ ...e, donnees: typeof f === 'function' ? f(e.donnees) : f })), []);
  return { ...etat, recharger, modifier };
}

/** Exécute une action (formulaire) avec état d'envoi et message d'erreur. */
export function useAction() {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const executer = useCallback(async (fn) => {
    setEnvoi(true);
    setErreur(null);
    try {
      return await fn();
    } catch (e) {
      setErreur(e);
      throw e;
    } finally {
      setEnvoi(false);
    }
  }, []);
  return { envoi, erreur, setErreur, executer };
}
