const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { ouvrirSession, fermerSession, authentifier, COOKIE } = require('../middleware/auth');
const { HttpError, valider } = require('../utils');
const { anneeCourante, parametresPublics } = require('../services/parametres');
const { emailActif } = require('../services/notifications');

const router = express.Router();

// Anti force brute : 30 échecs par quart d'heure et par adresse IP. Les connexions
// réussies ne sont pas comptées (une classe entière derrière le même Wi-Fi reste servie).
const limiteConnexion = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { erreur: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.' },
});

async function profilComplet(user) {
  const profil = { ...user, annee_courante: anneeCourante(), ecole: parametresPublics(), email_actif: emailActif() };
  if (user.role === 'parent') {
    profil.enfants = (
      await db.query(
        `SELECT e.id, e.nom, e.prenom, e.matricule, e.photo_id, e.sexe, pe.lien,
                c.id AS classe_id, c.niveau || ' ' || c.section AS classe
           FROM parents_eleves pe
           JOIN eleves e ON e.id = pe.eleve_id AND e.deleted_at IS NULL
           LEFT JOIN inscriptions i ON i.eleve_id = e.id AND i.annee_scolaire = $2
           LEFT JOIN classes c ON c.id = i.classe_id
          WHERE pe.parent_id = $1 ORDER BY e.date_naissance DESC`,
        [user.id, anneeCourante()]
      )
    ).rows;
  }
  if (user.role === 'eleve') {
    profil.eleve = (
      await db.query(
        `SELECT e.id, e.nom, e.prenom, e.matricule, e.photo_id, c.id AS classe_id, c.niveau || ' ' || c.section AS classe
           FROM eleves e
           LEFT JOIN inscriptions i ON i.eleve_id = e.id AND i.annee_scolaire = $2
           LEFT JOIN classes c ON c.id = i.classe_id
          WHERE e.utilisateur_id = $1 AND e.deleted_at IS NULL`,
        [user.id, anneeCourante()]
      )
    ).rows[0] || null;
  }
  return profil;
}

router.post('/connexion', limiteConnexion, async (req, res) => {
  const { email, mot_de_passe } = valider(req.body, {
    email: { type: 'string', required: true, label: 'E-mail' },
    mot_de_passe: { type: 'string', required: true, label: 'Mot de passe' },
  });
  const u = await db.un(
    `SELECT id, role, email, nom, prenom, telephone, actif, doit_changer_mdp, mot_de_passe
       FROM utilisateurs WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
    [email]
  );
  const ok = u && (await bcrypt.compare(mot_de_passe, u.mot_de_passe));
  if (!ok) throw new HttpError(401, 'E-mail ou mot de passe incorrect.');
  if (!u.actif) throw new HttpError(403, 'Ce compte est désactivé. Contactez l’administration.');
  await db.query('UPDATE utilisateurs SET derniere_connexion = now() WHERE id = $1', [u.id]);
  await db.query(
    `INSERT INTO journal_audit (utilisateur_id, action, entite, entite_id, ip) VALUES ($1, 'connexion', 'utilisateurs', $1, $2)`,
    [u.id, req.ip || null]
  );
  delete u.mot_de_passe;
  ouvrirSession(req, res, u);
  res.json(await profilComplet(u));
});

router.post('/deconnexion', (req, res) => {
  fermerSession(req, res);
  res.json({ ok: true });
});

// Session courante : renvoie null (et non une erreur) quand personne n'est connecté
router.get('/moi', async (req, res, next) => {
  const entete = req.headers.authorization || '';
  if (!(req.cookies && req.cookies[COOKIE]) && !entete.startsWith('Bearer ')) return res.json(null);
  try {
    await authentifier(req, res, () => {});
  } catch (e) {
    if (e.status === 401) {
      fermerSession(req, res);
      return res.json(null);
    }
    return next(e);
  }
  res.json(await profilComplet(req.user));
});

router.put('/mot-de-passe', authentifier, async (req, res) => {
  const { ancien, nouveau } = valider(req.body, {
    ancien: { type: 'string', required: true, label: 'Mot de passe actuel' },
    nouveau: { type: 'string', required: true, label: 'Nouveau mot de passe' },
  });
  if (nouveau.length < 8) throw new HttpError(400, 'Le nouveau mot de passe doit contenir au moins 8 caractères.');
  const u = await db.un('SELECT mot_de_passe FROM utilisateurs WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(ancien, u.mot_de_passe))) throw new HttpError(400, 'Le mot de passe actuel est incorrect.');
  const hash = await bcrypt.hash(nouveau, 10);
  await db.tx(req, (c) => c.query('UPDATE utilisateurs SET mot_de_passe = $1, doit_changer_mdp = FALSE WHERE id = $2', [hash, req.user.id]));
  res.json({ ok: true });
});

module.exports = router;
