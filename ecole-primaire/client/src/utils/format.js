// Mise en forme (français).

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const JOURS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
export const NIVEAUX = ['CP', 'CE1', 'CE2', 'CM1', 'CM2'];

function versDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [a, m, j] = v.split('-').map(Number);
    return new Date(a, m - 1, j);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function date(v) {
  const d = versDate(v);
  return d ? `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}` : '—';
}

export function dateCourte(v) {
  const d = versDate(v);
  return d ? `${d.getDate()} ${MOIS_COURTS[d.getMonth()]} ${d.getFullYear()}` : '—';
}

export function dateHeure(v) {
  const d = versDate(v);
  if (!d) return '—';
  return `${d.getDate()} ${MOIS_COURTS[d.getMonth()]} ${d.getFullYear()} à ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function heure(v) {
  const d = versDate(v);
  return d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
}

/** « il y a 5 min », « hier », « 12 oct. » */
export function relatif(v) {
  const d = versDate(v);
  if (!d) return '';
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  const auj = new Date();
  if (d.toDateString() === auj.toDateString()) return `aujourd’hui à ${heure(d)}`;
  const hier = new Date(auj);
  hier.setDate(auj.getDate() - 1);
  if (d.toDateString() === hier.toDateString()) return `hier à ${heure(d)}`;
  if (s < 0) return dateHeure(d);
  return `${d.getDate()} ${MOIS_COURTS[d.getMonth()]}${d.getFullYear() !== auj.getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}

/** Échéance : « dans 3 jours », « demain », « dépassée depuis 2 jours » */
export function echeance(v) {
  const d = versDate(v);
  if (!d) return '';
  const ms = d.getTime() - Date.now();
  const jours = Math.round(ms / 86400000);
  if (ms < 0) return jours === 0 ? 'dépassée aujourd’hui' : `dépassée depuis ${Math.abs(jours)} jour${Math.abs(jours) > 1 ? 's' : ''}`;
  if (ms < 86400000 && d.getDate() === new Date().getDate()) return `aujourd’hui à ${heure(d)}`;
  if (jours <= 1) return `demain à ${heure(d)}`;
  return `dans ${jours} jours`;
}

export function montant(v, devise = 'DT') {
  const n = Number(v || 0);
  const [ent, dec] = Math.abs(n).toFixed(3).split('.');
  return `${n < 0 ? '−' : ''}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${dec} ${devise}`;
}

export function nombre(v, d = 2) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Math.round(Number(v) * 10 ** d) / 10 ** d;
  return String(n).replace('.', ',');
}

export function note(v) {
  if (v === null || v === undefined) return '—';
  return String(Math.round(Number(v) * 100) / 100).replace('.', ',');
}

export function initiales(prenom, nom) {
  return `${(prenom || '').trim().charAt(0)}${(nom || '').trim().charAt(0)}`.toUpperCase();
}

export function age(dateNaissance) {
  const d = versDate(dateNaissance);
  if (!d) return '';
  const auj = new Date();
  let a = auj.getFullYear() - d.getFullYear();
  if (auj.getMonth() < d.getMonth() || (auj.getMonth() === d.getMonth() && auj.getDate() < d.getDate())) a -= 1;
  return `${a} ans`;
}

export function aujourdhuiIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Valeur pour <input type="datetime-local"> */
export function versDatetimeLocal(v) {
  const d = versDate(v);
  if (!d) return '';
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function taille(octets) {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}

export const LIBELLES = {
  role: { admin: 'Administration', enseignant: 'Enseignant', parent: 'Parent', eleve: 'Élève', comptable: 'Comptabilité' },
  mode: { especes: 'Espèces', virement: 'Virement', mobile_money: 'Mobile money', cheque: 'Chèque' },
  periode: { matin: 'Matin', apres_midi: 'Après-midi', journee: 'Journée' },
  absence: { non_justifiee: 'Non justifiée', en_attente: 'Justificatif à valider', justifiee: 'Justifiée', refusee: 'Justificatif refusé' },
  typeEval: { controle_continu: 'Contrôle continu', examen: 'Examen' },
  audience: { tous: 'Toute l’école', parents: 'Parents', enseignants: 'Enseignants', eleves: 'Élèves', personnel: 'Personnel' },
  tarif: { inscription: 'Inscription', tranche: 'Tranche de scolarité', autre: 'Autres frais' },
  soumission: { a_faire: 'À faire', non_rendu: 'Non rendu', rendu: 'Rendu', en_retard: 'Rendu en retard', note: 'Noté' },
  preinscription: { en_attente: 'En attente', validee: 'Validée', refusee: 'Refusée' },
  action: {
    creation: 'Création',
    modification: 'Modification',
    suppression: 'Suppression',
    suppression_definitive: 'Suppression définitive',
    restauration: 'Restauration',
    connexion: 'Connexion',
    masquage: 'Masquage (destinataire)',
  },
  entite: {
    utilisateurs: 'Utilisateur',
    classes: 'Classe',
    matieres: 'Matière',
    salles: 'Salle',
    affectations: 'Affectation',
    eleves: 'Élève',
    inscriptions: 'Inscription en classe',
    parents_eleves: 'Lien parent / élève',
    preinscriptions: 'Pré-inscription',
    creneaux: 'Créneau',
    evaluations: 'Évaluation',
    notes: 'Note',
    absences: 'Absence',
    tarifs: 'Tarif',
    paiements: 'Paiement',
    devoirs: 'Devoir',
    soumissions: 'Travail rendu',
    messages: 'Message',
    annonces: 'Annonce',
    parametres: 'Paramètre',
  },
};

export const TONS_ABSENCE = { non_justifiee: 'rouge', en_attente: 'jaune', justifiee: 'vert', refusee: 'rouge' };
export const TONS_SOUMISSION = { a_faire: 'bleu', non_rendu: 'rouge', rendu: 'vert', en_retard: 'jaune', note: 'violet' };

/** Couleur stable par matière (classe CSS m-0 … m-8). */
export function teinteMatiere(nom) {
  const fixes = {
    Arabe: 1,
    Français: 0,
    Mathématiques: 2,
    'Éveil scientifique': 3,
    'Éducation civique': 4,
    'Éducation artistique': 5,
    'Éducation physique': 6,
    Anglais: 7,
  };
  if (nom in fixes) return `m-${fixes[nom]}`;
  let h = 0;
  for (const c of String(nom)) h = (h * 31 + c.charCodeAt(0)) % 9;
  return `m-${h}`;
}
