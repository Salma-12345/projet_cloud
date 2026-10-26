const jwt = require('jsonwebtoken');
const db = require('../db');
const { secretJwt } = require('../services/parametres');
const { HttpError } = require('../utils');

const COOKIE = 'ecole_session';
const DUREE_SESSION_MS = 7 * 24 * 3600 * 1000;

function ouvrirSession(req, res, utilisateur) {
  const jeton = jwt.sign({ id: utilisateur.id, role: utilisateur.role }, secretJwt(), { expiresIn: '7d' });
  res.cookie(COOKIE, jeton, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: DUREE_SESSION_MS,
    path: '/',
  });
  return jeton;
}

function fermerSession(req, res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' });
}

async function authentifier(req, res, next) {
  const entete = req.headers.authorization || '';
  const jeton = (req.cookies && req.cookies[COOKIE]) || (entete.startsWith('Bearer ') ? entete.slice(7) : null);
  if (!jeton) throw new HttpError(401, 'Veuillez vous connecter.');
  let charge;
  try {
    charge = jwt.verify(jeton, secretJwt());
  } catch {
    throw new HttpError(401, 'Votre session a expiré, veuillez vous reconnecter.');
  }
  const u = await db.un(
    `SELECT id, role, email, nom, prenom, telephone, actif, doit_changer_mdp
       FROM utilisateurs WHERE id = $1 AND deleted_at IS NULL`,
    [charge.id]
  );
  if (!u || !u.actif) throw new HttpError(401, 'Compte désactivé ou introuvable.');
  req.user = u;
  next();
}

/** Contrôle d'accès par rôle (RBAC). */
const autoriser =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new HttpError(403, "Vous n'avez pas les droits nécessaires pour cette action.");
    }
    next();
  };

const ADMINISTRATION = ['admin', 'comptable'];
const PERSONNEL = ['admin', 'comptable', 'enseignant'];

module.exports = { ouvrirSession, fermerSession, authentifier, autoriser, ADMINISTRATION, PERSONNEL, COOKIE };
