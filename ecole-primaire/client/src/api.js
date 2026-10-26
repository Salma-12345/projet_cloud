// Accès à l'API REST (même origine : /api). La session est portée par un cookie httpOnly.

export class ErreurApi extends Error {
  constructor(status, donnees) {
    super((donnees && donnees.erreur) || `Erreur ${status}`);
    this.status = status;
    this.donnees = donnees || {};
  }
}

async function requete(methode, chemin, corps) {
  const options = { method: methode, credentials: 'same-origin', headers: {} };
  if (corps instanceof FormData) options.body = corps;
  else if (corps !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(corps);
  }
  let reponse;
  try {
    reponse = await fetch(`/api${chemin}`, options);
  } catch {
    throw new ErreurApi(0, { erreur: 'Connexion au serveur impossible. Vérifiez votre connexion internet.' });
  }
  const type = reponse.headers.get('content-type') || '';
  const donnees = type.includes('application/json') ? await reponse.json().catch(() => null) : null;
  if (!reponse.ok) {
    if (reponse.status === 401 && !chemin.startsWith('/auth/')) {
      window.dispatchEvent(new CustomEvent('session-expiree'));
    }
    throw new ErreurApi(reponse.status, donnees);
  }
  return donnees;
}

export const api = {
  get: (chemin) => requete('GET', chemin),
  post: (chemin, corps = {}) => requete('POST', chemin, corps),
  put: (chemin, corps = {}) => requete('PUT', chemin, corps),
  del: (chemin) => requete('DELETE', chemin),
};

/** Construit une chaîne de requête en ignorant les valeurs vides. */
export function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') p.append(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** URL d'un fichier protégé (ouvert dans un nouvel onglet). */
export const urlFichier = (id, telecharger = false) => `/api/fichiers/${id}${telecharger ? '?telecharger=1' : ''}`;

/** Construit un FormData à partir d'un objet (les tableaux de File deviennent plusieurs entrées). */
export function formulaire(donnees) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(donnees)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach((x) => fd.append(k, x));
    else fd.append(k, v instanceof File ? v : String(v));
  }
  return fd;
}
