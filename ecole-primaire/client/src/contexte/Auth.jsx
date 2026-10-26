import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const AuthContexte = createContext(null);

export function AuthProvider({ children }) {
  // undefined = vérification en cours ; null = non connecté
  const [utilisateur, setUtilisateur] = useState(undefined);
  const [anneeChoisie, setAnneeChoisie] = useState(null);

  const recharger = useCallback(async () => {
    try {
      const u = await api.get('/auth/moi');
      setUtilisateur(u || null);
      return u || null;
    } catch {
      setUtilisateur(null);
      return null;
    }
  }, []);

  useEffect(() => {
    recharger();
    const expiree = () => setUtilisateur(null);
    window.addEventListener('session-expiree', expiree);
    return () => window.removeEventListener('session-expiree', expiree);
  }, [recharger]);

  const connexion = useCallback(async (email, motDePasse) => {
    const u = await api.post('/auth/connexion', { email, mot_de_passe: motDePasse });
    setAnneeChoisie(null);
    setUtilisateur(u);
    return u;
  }, []);

  const deconnexion = useCallback(async () => {
    await api.post('/auth/deconnexion').catch(() => {});
    setUtilisateur(null);
    setAnneeChoisie(null);
  }, []);

  const valeur = useMemo(() => {
    const anneeCourante = utilisateur ? utilisateur.annee_courante : null;
    const annee = anneeChoisie || anneeCourante;
    return {
      utilisateur,
      role: utilisateur ? utilisateur.role : null,
      ecole: utilisateur ? utilisateur.ecole : null,
      annee,
      anneeCourante,
      estAnneeCourante: annee === anneeCourante,
      choisirAnnee: setAnneeChoisie,
      connexion,
      deconnexion,
      recharger,
    };
  }, [utilisateur, anneeChoisie, connexion, deconnexion, recharger]);

  return <AuthContexte.Provider value={valeur}>{children}</AuthContexte.Provider>;
}

export const useAuth = () => useContext(AuthContexte);
