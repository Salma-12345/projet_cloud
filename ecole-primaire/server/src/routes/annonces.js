// Annonces générales : publication par l'administration, immuables une fois publiées (annonce corrective en cas d'erreur).
const express = require('express');
const db = require('../db');
const { autoriser } = require('../middleware/auth');
const { valider, entierParam, HttpError, introuvable, urlPublique } = require('../utils');
const { notifier } = require('../services/notifications');

const router = express.Router();

const AUDIENCES_PAR_ROLE = {
  admin: null, // voit tout
  comptable: ['tous', 'personnel'],
  enseignant: ['tous', 'enseignants', 'personnel'],
  parent: ['tous', 'parents'],
  eleve: ['tous', 'eleves'],
};
const ROLES_PAR_AUDIENCE = {
  tous: ['admin', 'comptable', 'enseignant', 'parent', 'eleve'],
  parents: ['parent'],
  enseignants: ['enseignant'],
  eleves: ['eleve'],
  personnel: ['admin', 'comptable', 'enseignant'],
};
const LIBELLES = { tous: 'Toute l’école', parents: 'Parents', enseignants: 'Enseignants', eleves: 'Élèves', personnel: 'Personnel' };

const SELECT = `
  SELECT a.id, a.titre, a.contenu, a.audience, a.statut, a.publiee_at, a.created_at, a.updated_at, a.corrige_id, a.auteur_id,
         u.prenom || ' ' || u.nom AS auteur,
         o.titre AS corrige_titre,
         (SELECT json_agg(json_build_object('id', c.id, 'titre', c.titre, 'publiee_at', c.publiee_at) ORDER BY c.publiee_at)
            FROM annonces c WHERE c.corrige_id = a.id AND c.statut = 'publiee' AND c.deleted_at IS NULL) AS corrections
    FROM annonces a
    JOIN utilisateurs u ON u.id = a.auteur_id
    LEFT JOIN annonces o ON o.id = a.corrige_id`;

router.get('/', async (req, res) => {
  const audiences = AUDIENCES_PAR_ROLE[req.user.role];
  const params = [];
  let filtre = "a.deleted_at IS NULL AND a.statut = 'publiee'";
  if (req.user.role === 'admin') filtre = 'a.deleted_at IS NULL';
  if (audiences) {
    params.push(audiences);
    filtre += ` AND a.audience = ANY($${params.length})`;
  }
  const r = await db.query(`${SELECT} WHERE ${filtre} ORDER BY COALESCE(a.publiee_at, a.updated_at) DESC LIMIT 200`, params);
  res.json(r.rows.map((x) => ({ ...x, audience_libelle: LIBELLES[x.audience] })));
});

const schema = {
  titre: { type: 'string', required: true, label: 'Titre', maxLength: 200 },
  contenu: { type: 'string', required: true, label: 'Contenu', maxLength: 10000 },
  audience: { type: 'string', required: true, enum: Object.keys(ROLES_PAR_AUDIENCE), label: 'Destinataires' },
  corrige_id: { type: 'int', label: 'Annonce corrigée' },
  publier: { type: 'bool', defaut: false },
};

async function publier(client, req, annonce) {
  const dest = (
    await client.query('SELECT id FROM utilisateurs WHERE role = ANY($1) AND actif AND deleted_at IS NULL AND id <> $2', [
      ROLES_PAR_AUDIENCE[annonce.audience],
      req.user.id,
    ])
  ).rows.map((x) => x.id);
  await notifier(client, dest, {
    type: 'annonce',
    titre: annonce.corrige_id ? `Rectificatif : ${annonce.titre}` : `Annonce : ${annonce.titre}`,
    contenu: annonce.contenu.slice(0, 300),
    lien: `/annonces#annonce-${annonce.id}`,
    email: true,
    contexte: 'annonce',
    ref_type: 'annonce',
    ref_id: annonce.id,
    baseUrl: urlPublique(req),
  });
  return dest.length;
}

router.post('/', autoriser('admin'), async (req, res) => {
  const d = valider(req.body, schema);
  if (d.corrige_id) {
    const o = await db.un("SELECT id, statut FROM annonces WHERE id = $1 AND deleted_at IS NULL", [d.corrige_id]);
    if (!o || o.statut !== 'publiee') throw new HttpError(400, 'Seule une annonce publiée peut faire l’objet d’une annonce corrective.');
  }
  const r = await db.tx(req, async (c) => {
    const a = (
      await c.query(
        `INSERT INTO annonces (titre, contenu, audience, auteur_id, statut, corrige_id, publiee_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [d.titre, d.contenu, d.audience, req.user.id, d.publier ? 'publiee' : 'brouillon', d.corrige_id, d.publier ? new Date() : null]
      )
    ).rows[0];
    const notifies = d.publier ? await publier(c, req, a) : 0;
    return { ...a, notifies };
  });
  res.status(201).json(r);
});

// Seuls les brouillons sont modifiables ; une annonce publiée est immuable (le trigger en base le garantit aussi)
router.put('/:id', autoriser('admin'), async (req, res) => {
  const id = entierParam(req.params.id);
  const a = await db.un('SELECT * FROM annonces WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!a) throw introuvable('Annonce');
  if (a.statut === 'publiee') throw new HttpError(403, 'Une annonce publiée est immuable : publiez une annonce corrective.', { immuable: true });
  const d = valider(req.body, schema);
  const r = await db.tx(req, async (c) => {
    const maj = (
      await c.query(
        `UPDATE annonces SET titre=$1, contenu=$2, audience=$3, corrige_id=$4, statut=$5, publiee_at=$6 WHERE id=$7 RETURNING *`,
        [d.titre, d.contenu, d.audience, d.corrige_id, d.publier ? 'publiee' : 'brouillon', d.publier ? new Date() : null, id]
      )
    ).rows[0];
    const notifies = d.publier ? await publier(c, req, maj) : 0;
    return { ...maj, notifies };
  });
  res.json(r);
});

router.delete('/:id', autoriser('admin'), async (req, res) => {
  const id = entierParam(req.params.id);
  const a = await db.un('SELECT * FROM annonces WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!a) throw introuvable('Annonce');
  if (a.statut === 'publiee') throw new HttpError(403, 'Une annonce publiée est immuable : elle ne peut pas être supprimée.', { immuable: true });
  await db.tx(req, (c) => c.query('UPDATE annonces SET deleted_at = now() WHERE id = $1', [id]));
  res.json({ ok: true });
});

module.exports = router;
