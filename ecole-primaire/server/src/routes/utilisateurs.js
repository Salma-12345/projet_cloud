// Comptes utilisateurs : enseignants, parents, personnel administratif (CRUD + réinitialisation).
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { autoriser } = require('../middleware/auth');
const {
  valider,
  entierParam,
  HttpError,
  introuvable,
  interdit,
  confirmationRequise,
  genererMotDePasse,
  urlPublique,
  LIBELLES_ROLE,
} = require('../utils');
const { anneeCourante, param } = require('../services/parametres');
const { envoyerEmailDirect } = require('../services/notifications');

const router = express.Router();
const ROLES = ['admin', 'enseignant', 'parent', 'comptable'];

function verifierDroitRole(user, role) {
  if (user.role === 'admin') return;
  if (user.role === 'comptable' && role === 'parent') return;
  throw interdit();
}

function texteIdentifiants(u, motDePasse, baseUrl) {
  return (
    `Bonjour ${u.prenom} ${u.nom},\n\nVotre compte ${LIBELLES_ROLE[u.role].toLowerCase()} sur l'application de ${param('nom_ecole')} a été créé.\n\n` +
    `Adresse : ${baseUrl}\nIdentifiant : ${u.email}\nMot de passe provisoire : ${motDePasse}\n\n` +
    `Pour votre sécurité, vous serez invité(e) à changer ce mot de passe après votre première connexion.\n\n${param('nom_ecole')}`
  );
}

async function creerCompte(client, req, d) {
  const motDePasse = d.mot_de_passe || genererMotDePasse();
  const hash = await bcrypt.hash(motDePasse, 10);
  const u = (
    await client.query(
      `INSERT INTO utilisateurs (role, email, mot_de_passe, nom, prenom, telephone, adresse, specialite, actif, doit_changer_mdp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, role, email, nom, prenom, telephone, adresse, specialite, actif`,
      [d.role, d.email, hash, d.nom, d.prenom, d.telephone, d.adresse, d.specialite, d.actif !== false, !d.mot_de_passe]
    )
  ).rows[0];
  const baseUrl = urlPublique(req);
  client.apresCommit.push(() =>
    envoyerEmailDirect({
      destinataire_id: u.id,
      email: u.email,
      sujet: `Vos identifiants — ${param('nom_ecole')}`,
      texte: texteIdentifiants(u, motDePasse, baseUrl),
      contexte: 'identifiants',
      ref_type: 'utilisateur',
      ref_id: u.id,
    })
  );
  return { utilisateur: u, identifiants: { email: u.email, mot_de_passe: motDePasse } };
}

const schemaUtilisateur = {
  nom: { type: 'string', required: true, label: 'Nom', maxLength: 80 },
  prenom: { type: 'string', required: true, label: 'Prénom', maxLength: 80 },
  email: { type: 'email', required: true, label: 'E-mail' },
  telephone: { type: 'string', label: 'Téléphone', maxLength: 30 },
  adresse: { type: 'string', label: 'Adresse', maxLength: 200 },
  specialite: { type: 'string', label: 'Spécialité', maxLength: 120 },
  actif: { type: 'bool', label: 'Actif', defaut: true },
};

// Liste des utilisateurs d'un rôle
router.get('/', autoriser('admin', 'comptable'), async (req, res) => {
  const role = req.query.role;
  if (!ROLES.includes(role) && role !== 'eleve') throw new HttpError(400, 'Rôle invalide.');
  if (req.user.role === 'comptable' && !['parent', 'enseignant'].includes(role)) throw interdit();
  const q = req.query.q ? `%${String(req.query.q).toLowerCase()}%` : null;
  const annee = anneeCourante();
  let sql;
  if (role === 'enseignant') {
    sql = `SELECT u.id, u.role, u.email, u.nom, u.prenom, u.telephone, u.adresse, u.specialite, u.actif, u.derniere_connexion,
              COALESCE((SELECT json_agg(json_build_object('id', a.id, 'matiere', m.nom, 'classe', c.niveau || ' ' || c.section,
                                    'matiere_id', m.id, 'classe_id', c.id) ORDER BY c.niveau, c.section, m.nom)
                          FROM affectations a JOIN matieres m ON m.id = a.matiere_id JOIN classes c ON c.id = a.classe_id
                         WHERE a.enseignant_id = u.id AND a.deleted_at IS NULL AND c.deleted_at IS NULL AND c.annee_scolaire = $2), '[]') AS affectations,
              (SELECT string_agg(c.niveau || ' ' || c.section, ', ') FROM classes c
                WHERE c.titulaire_id = u.id AND c.deleted_at IS NULL AND c.annee_scolaire = $2) AS titulaire_de
         FROM utilisateurs u
        WHERE u.role = 'enseignant' AND u.deleted_at IS NULL
          AND ($1::text IS NULL OR lower(u.nom || ' ' || u.prenom || ' ' || u.email) LIKE $1)
        ORDER BY u.nom, u.prenom`;
  } else if (role === 'parent') {
    sql = `SELECT u.id, u.role, u.email, u.nom, u.prenom, u.telephone, u.adresse, u.actif, u.derniere_connexion,
              COALESCE((SELECT json_agg(json_build_object('id', e.id, 'nom', e.prenom || ' ' || e.nom, 'lien', pe.lien,
                                    'classe', c.niveau || ' ' || c.section) ORDER BY e.prenom)
                          FROM parents_eleves pe JOIN eleves e ON e.id = pe.eleve_id AND e.deleted_at IS NULL
                          LEFT JOIN inscriptions i ON i.eleve_id = e.id AND i.annee_scolaire = $2
                          LEFT JOIN classes c ON c.id = i.classe_id
                         WHERE pe.parent_id = u.id), '[]') AS enfants
         FROM utilisateurs u
        WHERE u.role = 'parent' AND u.deleted_at IS NULL
          AND ($1::text IS NULL OR lower(u.nom || ' ' || u.prenom || ' ' || u.email) LIKE $1
               OR EXISTS (SELECT 1 FROM parents_eleves pe JOIN eleves e ON e.id = pe.eleve_id
                           WHERE pe.parent_id = u.id AND lower(e.nom || ' ' || e.prenom) LIKE $1))
        ORDER BY u.nom, u.prenom`;
  } else {
    sql = `SELECT u.id, u.role, u.email, u.nom, u.prenom, u.telephone, u.adresse, u.actif, u.derniere_connexion
         FROM utilisateurs u
        WHERE u.role = $2 AND u.deleted_at IS NULL
          AND ($1::text IS NULL OR lower(u.nom || ' ' || u.prenom || ' ' || u.email) LIKE $1)
        ORDER BY u.nom, u.prenom`;
  }
  const r = await db.query(sql, [q, role === 'enseignant' || role === 'parent' ? annee : role]);
  res.json(r.rows);
});

router.get('/:id', autoriser('admin', 'comptable'), async (req, res) => {
  const id = entierParam(req.params.id);
  const u = await db.un(
    `SELECT id, role, email, nom, prenom, telephone, adresse, specialite, actif, derniere_connexion, created_at
       FROM utilisateurs WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  if (!u) throw introuvable('Utilisateur');
  verifierDroitRole(req.user, u.role === 'enseignant' && req.user.role === 'comptable' ? 'parent' : u.role);
  if (u.role === 'parent') {
    u.enfants = (
      await db.query(
        `SELECT e.id, e.nom, e.prenom, e.matricule, pe.lien, c.niveau || ' ' || c.section AS classe
           FROM parents_eleves pe JOIN eleves e ON e.id = pe.eleve_id AND e.deleted_at IS NULL
           LEFT JOIN inscriptions i ON i.eleve_id = e.id AND i.annee_scolaire = $2
           LEFT JOIN classes c ON c.id = i.classe_id
          WHERE pe.parent_id = $1 ORDER BY e.prenom`,
        [id, anneeCourante()]
      )
    ).rows;
  }
  if (u.role === 'enseignant') {
    u.affectations = (
      await db.query(
        `SELECT a.id, m.id AS matiere_id, m.nom AS matiere, c.id AS classe_id, c.niveau || ' ' || c.section AS classe
           FROM affectations a JOIN matieres m ON m.id = a.matiere_id JOIN classes c ON c.id = a.classe_id
          WHERE a.enseignant_id = $1 AND a.deleted_at IS NULL AND c.deleted_at IS NULL AND c.annee_scolaire = $2
          ORDER BY c.niveau, c.section, m.nom`,
        [id, anneeCourante()]
      )
    ).rows;
  }
  res.json(u);
});

router.post('/', autoriser('admin', 'comptable'), async (req, res) => {
  const role = req.body.role;
  if (!ROLES.includes(role)) throw new HttpError(400, 'Rôle invalide.');
  verifierDroitRole(req.user, role);
  const d = valider(req.body, {
    ...schemaUtilisateur,
    mot_de_passe: { type: 'string', label: 'Mot de passe', maxLength: 100 },
  });
  if (d.mot_de_passe && d.mot_de_passe.length < 8) throw new HttpError(400, 'Le mot de passe doit contenir au moins 8 caractères.');
  const existe = await db.un('SELECT 1 FROM utilisateurs WHERE lower(email) = lower($1) AND deleted_at IS NULL', [d.email]);
  if (existe) throw new HttpError(409, 'Un compte utilise déjà cette adresse e-mail.');
  const r = await db.tx(req, (c) => creerCompte(c, req, { ...d, role }));
  res.status(201).json(r);
});

router.put('/:id', autoriser('admin', 'comptable'), async (req, res) => {
  const id = entierParam(req.params.id);
  const u = await db.un('SELECT id, role FROM utilisateurs WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!u) throw introuvable('Utilisateur');
  verifierDroitRole(req.user, u.role);
  const d = valider(req.body, schemaUtilisateur);
  if (u.id === req.user.id && d.actif === false) throw new HttpError(400, 'Vous ne pouvez pas désactiver votre propre compte.');
  const doublon = await db.un('SELECT 1 FROM utilisateurs WHERE lower(email) = lower($1) AND id <> $2 AND deleted_at IS NULL', [d.email, id]);
  if (doublon) throw new HttpError(409, 'Un autre compte utilise déjà cette adresse e-mail.');
  const r = await db.tx(req, (c) =>
    c.query(
      `UPDATE utilisateurs SET nom=$1, prenom=$2, email=$3, telephone=$4, adresse=$5, specialite=$6, actif=$7
        WHERE id = $8 RETURNING id, role, email, nom, prenom, telephone, adresse, specialite, actif`,
      [d.nom, d.prenom, d.email, d.telephone, d.adresse, d.specialite, d.actif, id]
    )
  );
  res.json(r.rows[0]);
});

router.delete('/:id', autoriser('admin', 'comptable'), async (req, res) => {
  const id = entierParam(req.params.id);
  const force = req.query.force === '1' || req.query.force === 'true';
  const u = await db.un('SELECT id, role, nom, prenom FROM utilisateurs WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!u) throw introuvable('Utilisateur');
  verifierDroitRole(req.user, u.role);
  if (u.id === req.user.id) throw new HttpError(400, 'Vous ne pouvez pas supprimer votre propre compte.');
  if (u.role === 'admin') {
    const n = (await db.un("SELECT COUNT(*)::int AS n FROM utilisateurs WHERE role = 'admin' AND deleted_at IS NULL AND actif")).n;
    if (n <= 1) throw new HttpError(400, 'Impossible de supprimer le dernier administrateur.');
  }

  if (u.role === 'enseignant') {
    const ref = await db.un(
      `SELECT (SELECT COUNT(*)::int FROM affectations WHERE enseignant_id = $1 AND deleted_at IS NULL) AS affectations,
              (SELECT COUNT(*)::int FROM creneaux WHERE enseignant_id = $1 AND deleted_at IS NULL) AS creneaux,
              (SELECT COUNT(*)::int FROM classes WHERE titulaire_id = $1 AND deleted_at IS NULL) AS titularisations`,
      [id]
    );
    if ((ref.affectations || ref.creneaux || ref.titularisations) && !force) {
      throw confirmationRequise(
        `${u.prenom} ${u.nom} est encore affecté(e) : ${ref.affectations} affectation(s) matière/classe, ${ref.creneaux} créneau(x) ` +
          `d'emploi du temps, titulaire de ${ref.titularisations} classe(s). Ces affectations seront retirées (l'historique des notes est conservé).`,
        ref
      );
    }
    await db.tx(req, async (c) => {
      await c.query('UPDATE affectations SET deleted_at = now() WHERE enseignant_id = $1 AND deleted_at IS NULL', [id]);
      await c.query('UPDATE creneaux SET deleted_at = now() WHERE enseignant_id = $1 AND deleted_at IS NULL', [id]);
      await c.query('UPDATE classes SET titulaire_id = NULL WHERE titulaire_id = $1', [id]);
      await c.query('UPDATE utilisateurs SET deleted_at = now(), actif = FALSE WHERE id = $1', [id]);
    });
    return res.json({ ok: true });
  }

  if (u.role === 'parent') {
    const n = (await db.un('SELECT COUNT(*)::int AS n FROM parents_eleves WHERE parent_id = $1', [id])).n;
    if (n && !force) {
      throw confirmationRequise(
        `Ce parent est rattaché à ${n} élève(s). Le lien sera supprimé (les dossiers des élèves sont conservés).`,
        { enfants: n }
      );
    }
    await db.tx(req, async (c) => {
      await c.query('DELETE FROM parents_eleves WHERE parent_id = $1', [id]);
      await c.query('DELETE FROM abonnements_push WHERE utilisateur_id = $1', [id]);
      await c.query('UPDATE utilisateurs SET deleted_at = now(), actif = FALSE WHERE id = $1', [id]);
    });
    return res.json({ ok: true });
  }

  await db.tx(req, (c) => c.query('UPDATE utilisateurs SET deleted_at = now(), actif = FALSE WHERE id = $1', [id]));
  res.json({ ok: true });
});

router.post('/:id/reinitialiser-mot-de-passe', autoriser('admin', 'comptable'), async (req, res) => {
  const id = entierParam(req.params.id);
  const u = await db.un('SELECT id, role, email, nom, prenom FROM utilisateurs WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!u) throw introuvable('Utilisateur');
  verifierDroitRole(req.user, u.role === 'eleve' ? 'parent' : u.role);
  const motDePasse = genererMotDePasse();
  const hash = await bcrypt.hash(motDePasse, 10);
  const baseUrl = urlPublique(req);
  await db.tx(req, async (c) => {
    await c.query('UPDATE utilisateurs SET mot_de_passe = $1, doit_changer_mdp = TRUE WHERE id = $2', [hash, id]);
    if (u.role !== 'eleve') {
      c.apresCommit.push(() =>
        envoyerEmailDirect({
          destinataire_id: u.id,
          email: u.email,
          sujet: `Nouveau mot de passe — ${param('nom_ecole')}`,
          texte: texteIdentifiants(u, motDePasse, baseUrl),
          contexte: 'identifiants',
          ref_type: 'utilisateur',
          ref_id: u.id,
        })
      );
    }
  });
  res.json({ identifiants: { email: u.email, mot_de_passe: motDePasse } });
});

// Liens parent <-> élève
router.post('/:id/enfants', autoriser('admin', 'comptable'), async (req, res) => {
  const id = entierParam(req.params.id);
  const d = valider(req.body, {
    eleve_id: { type: 'int', required: true, label: 'Élève' },
    lien: { type: 'string', enum: ['Père', 'Mère', 'Tuteur', 'Tutrice', 'Parent'], defaut: 'Parent', label: 'Lien' },
  });
  const p = await db.un("SELECT id FROM utilisateurs WHERE id = $1 AND role = 'parent' AND deleted_at IS NULL", [id]);
  if (!p) throw introuvable('Parent');
  const e = await db.un('SELECT id FROM eleves WHERE id = $1 AND deleted_at IS NULL', [d.eleve_id]);
  if (!e) throw introuvable('Élève');
  await db.tx(req, (c) =>
    c.query(
      'INSERT INTO parents_eleves (parent_id, eleve_id, lien) VALUES ($1, $2, $3) ON CONFLICT (parent_id, eleve_id) DO UPDATE SET lien = EXCLUDED.lien',
      [id, d.eleve_id, d.lien]
    )
  );
  res.status(201).json({ ok: true });
});

router.delete('/:id/enfants/:eleveId', autoriser('admin', 'comptable'), async (req, res) => {
  const id = entierParam(req.params.id);
  const eleveId = entierParam(req.params.eleveId);
  await db.tx(req, (c) => c.query('DELETE FROM parents_eleves WHERE parent_id = $1 AND eleve_id = $2', [id, eleveId]));
  res.json({ ok: true });
});

module.exports = router;
module.exports.creerCompte = creerCompte;
