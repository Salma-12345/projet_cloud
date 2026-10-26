const crypto = require('crypto');

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const introuvable = (quoi = 'Élément') => new HttpError(404, `${quoi} introuvable.`);
const interdit = (msg = "Vous n'avez pas les droits nécessaires pour cette action.") => new HttpError(403, msg);

/** Suppression contrôlée : demande une confirmation explicite côté client (409). */
const confirmationRequise = (message, details = {}) =>
  new HttpError(409, message, { confirmationRequise: true, ...details });

/** Suppression impossible : l'élément est référencé (409). */
const suppressionBloquee = (message, details = {}) => new HttpError(409, message, { bloque: true, ...details });

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Validation simple des champs d'un formulaire.
 * schema = { champ: { type, required, label, min, max, enum, maxLength } }
 */
function valider(corps, schema) {
  const source = corps || {};
  const sortie = {};
  const erreurs = {};
  for (const [cle, regle] of Object.entries(schema)) {
    const label = regle.label || cle;
    let v = source[cle];
    if (typeof v === 'string') v = v.trim();
    if (v === '' || v === undefined || v === null) {
      if (regle.required) erreurs[cle] = `Le champ « ${label} » est obligatoire.`;
      else sortie[cle] = regle.defaut !== undefined ? regle.defaut : null;
      continue;
    }
    switch (regle.type) {
      case 'string':
        v = String(v);
        if (v.length > (regle.maxLength || 2000)) erreurs[cle] = `« ${label} » est trop long.`;
        if (regle.enum && !regle.enum.includes(v)) erreurs[cle] = `Valeur invalide pour « ${label} ».`;
        break;
      case 'email':
        v = String(v).toLowerCase();
        if (!RE_EMAIL.test(v)) erreurs[cle] = `« ${label} » n'est pas une adresse e-mail valide.`;
        break;
      case 'int':
        v = Number(v);
        if (!Number.isInteger(v)) erreurs[cle] = `« ${label} » doit être un nombre entier.`;
        else if (regle.min !== undefined && v < regle.min) erreurs[cle] = `« ${label} » doit être au moins ${regle.min}.`;
        else if (regle.max !== undefined && v > regle.max) erreurs[cle] = `« ${label} » doit être au plus ${regle.max}.`;
        break;
      case 'number':
        v = Number(String(v).replace(',', '.'));
        if (!Number.isFinite(v)) erreurs[cle] = `« ${label} » doit être un nombre.`;
        else if (regle.min !== undefined && v < regle.min) erreurs[cle] = `« ${label} » doit être au moins ${regle.min}.`;
        else if (regle.max !== undefined && v > regle.max) erreurs[cle] = `« ${label} » doit être au plus ${regle.max}.`;
        break;
      case 'bool':
        v = v === true || v === 'true' || v === 1 || v === '1' || v === 'on';
        break;
      case 'date':
        v = String(v).slice(0, 10);
        if (!RE_DATE.test(v) || Number.isNaN(Date.parse(v))) erreurs[cle] = `« ${label} » doit être une date valide.`;
        break;
      case 'datetime': {
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) erreurs[cle] = `« ${label} » doit être une date et heure valides.`;
        else v = d.toISOString();
        break;
      }
      case 'time':
        v = String(v).slice(0, 5);
        if (!RE_HEURE.test(v)) erreurs[cle] = `« ${label} » doit être une heure au format HH:MM.`;
        break;
      case 'ids':
        v = (Array.isArray(v) ? v : [v]).map(Number).filter((x) => Number.isInteger(x) && x > 0);
        if (regle.required && !v.length) erreurs[cle] = `Le champ « ${label} » est obligatoire.`;
        break;
      default:
        break;
    }
    sortie[cle] = v;
  }
  if (Object.keys(erreurs).length) {
    throw new HttpError(400, Object.values(erreurs)[0], { erreurs });
  }
  return sortie;
}

function entierParam(v, nom = 'identifiant') {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `Paramètre « ${nom} » invalide.`);
  return n;
}

function genererMotDePasse() {
  // Lisible, sans caractères ambigus (0/O, 1/l)
  const lettres = 'abcdefghjkmnpqrstuvwxyz';
  const chiffres = '23456789';
  const pick = (s, n) => Array.from({ length: n }, () => s[crypto.randomInt(s.length)]).join('');
  return `Ecole-${pick(chiffres, 4)}-${pick(lettres, 4)}`;
}

function formatMontant(v, devise = 'DT') {
  const n = Number(v || 0);
  const [ent, dec] = n.toFixed(3).split('.');
  const entier = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${entier},${dec} ${devise}`;
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function formatDate(v) {
  if (!v) return '';
  const s = typeof v === 'string' ? v : new Date(v).toISOString();
  const [a, m, j] = s.slice(0, 10).split('-').map(Number);
  return `${j} ${MOIS[m - 1]} ${a}`;
}

function formatDateCourte(v) {
  if (!v) return '';
  const s = typeof v === 'string' ? v : new Date(v).toISOString();
  const [a, m, j] = s.slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
}

const LIBELLES_MODE = { especes: 'Espèces', virement: 'Virement', mobile_money: 'Mobile money', cheque: 'Chèque' };
const LIBELLES_ROLE = {
  admin: 'Administration',
  enseignant: 'Enseignant',
  parent: 'Parent',
  eleve: 'Élève',
  comptable: 'Comptabilité / Secrétariat',
};

function nomComplet(u) {
  if (!u) return '';
  return `${u.prenom || ''} ${u.nom || ''}`.trim();
}

function urlPublique(req) {
  const config = require('./config');
  if (config.publicUrl) return config.publicUrl;
  if (!req) return '';
  return `${req.protocol}://${req.get('host')}`;
}

/** Date du jour au format AAAA-MM-JJ selon le fuseau local du serveur (TZ). */
function dateLocaleIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function anneeDepuisDate(d = new Date()) {
  const y = d.getFullYear();
  return d.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function anneeSuivante(annee) {
  const [a, b] = annee.split('-').map(Number);
  return `${a + 1}-${b + 1}`;
}

module.exports = {
  HttpError,
  introuvable,
  interdit,
  confirmationRequise,
  suppressionBloquee,
  valider,
  entierParam,
  genererMotDePasse,
  formatMontant,
  formatDate,
  formatDateCourte,
  LIBELLES_MODE,
  LIBELLES_ROLE,
  nomComplet,
  urlPublique,
  anneeDepuisDate,
  anneeSuivante,
  dateLocaleIso,
  RE_EMAIL,
};
