// Matières et salles (CRUD contrôlé).
const express = require('express');
const db = require('../db');
const { autoriser, PERSONNEL } = require('../middleware/auth');
const { valider, entierParam, introuvable, suppressionBloquee, confirmationRequise } = require('../utils');
const { NIVEAUX } = require('../services/parametres');

// ----- Matières -----
const matieres = express.Router();

matieres.get('/', async (req, res) => {
  const r = await db.query(
    `SELECT m.id, m.nom, m.coefficient, m.niveau,
            (SELECT COUNT(*)::int FROM affectations a WHERE a.matiere_id = m.id AND a.deleted_at IS NULL) AS nb_affectations,
            (SELECT COUNT(*)::int FROM notes n JOIN evaluations ev ON ev.id = n.evaluation_id
              WHERE ev.matiere_id = m.id AND n.deleted_at IS NULL) AS nb_notes
       FROM matieres m WHERE m.deleted_at IS NULL
      ORDER BY m.niveau NULLS FIRST, m.coefficient DESC, m.nom`
  );
  res.json(r.rows);
});

const schemaMatiere = {
  nom: { type: 'string', required: true, label: 'Nom', maxLength: 80 },
  coefficient: { type: 'number', required: true, min: 0.5, max: 10, label: 'Coefficient' },
  niveau: { type: 'string', enum: NIVEAUX, label: 'Niveau' },
};

matieres.post('/', autoriser('admin'), async (req, res) => {
  const d = valider(req.body, schemaMatiere);
  const r = await db.tx(req, (c) =>
    c.query('INSERT INTO matieres (nom, coefficient, niveau) VALUES ($1,$2,$3) RETURNING *', [d.nom, d.coefficient, d.niveau])
  );
  res.status(201).json(r.rows[0]);
});

matieres.put('/:id', autoriser('admin'), async (req, res) => {
  const id = entierParam(req.params.id);
  const d = valider(req.body, schemaMatiere);
  const m = await db.un('SELECT id FROM matieres WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!m) throw introuvable('Matière');
  const r = await db.tx(req, (c) =>
    c.query('UPDATE matieres SET nom=$1, coefficient=$2, niveau=$3 WHERE id=$4 RETURNING *', [d.nom, d.coefficient, d.niveau, id])
  );
  res.json(r.rows[0]);
});

matieres.delete('/:id', autoriser('admin'), async (req, res) => {
  const id = entierParam(req.params.id);
  const m = await db.un('SELECT id, nom FROM matieres WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!m) throw introuvable('Matière');
  const ref = await db.un(
    `SELECT (SELECT COUNT(*)::int FROM notes n JOIN evaluations ev ON ev.id = n.evaluation_id WHERE ev.matiere_id = $1 AND n.deleted_at IS NULL) AS notes,
            (SELECT COUNT(*)::int FROM affectations WHERE matiere_id = $1 AND deleted_at IS NULL) AS affectations,
            (SELECT COUNT(*)::int FROM evaluations WHERE matiere_id = $1 AND deleted_at IS NULL) AS evaluations,
            (SELECT COUNT(*)::int FROM creneaux WHERE matiere_id = $1 AND deleted_at IS NULL) AS creneaux`,
    [id]
  );
  if (ref.notes || ref.affectations || ref.evaluations || ref.creneaux) {
    throw suppressionBloquee(
      `Suppression impossible : « ${m.nom} » est rattachée à ${ref.notes} note(s), ${ref.evaluations} évaluation(s), ` +
        `${ref.affectations} affectation(s) enseignant et ${ref.creneaux} créneau(x). Retirez d'abord ces rattachements.`,
      ref
    );
  }
  await db.tx(req, (c) => c.query('UPDATE matieres SET deleted_at = now() WHERE id = $1', [id]));
  res.json({ ok: true });
});

// ----- Salles -----
const salles = express.Router();

salles.get('/', autoriser(...PERSONNEL), async (req, res) => {
  const r = await db.query(
    `SELECT s.*, (SELECT COUNT(*)::int FROM creneaux cr JOIN classes c ON c.id = cr.classe_id AND c.deleted_at IS NULL
                   WHERE cr.salle_id = s.id AND cr.deleted_at IS NULL) AS nb_creneaux
       FROM salles s WHERE s.deleted_at IS NULL ORDER BY s.nom`
  );
  res.json(r.rows);
});

const schemaSalle = {
  nom: { type: 'string', required: true, label: 'Nom', maxLength: 60 },
  capacite: { type: 'int', required: true, min: 1, max: 500, label: 'Capacité' },
  disponible: { type: 'bool', defaut: true, label: 'Disponible' },
  description: { type: 'string', label: 'Description', maxLength: 300 },
};

salles.post('/', autoriser('admin'), async (req, res) => {
  const d = valider(req.body, schemaSalle);
  const r = await db.tx(req, (c) =>
    c.query('INSERT INTO salles (nom, capacite, disponible, description) VALUES ($1,$2,$3,$4) RETURNING *', [
      d.nom,
      d.capacite,
      d.disponible,
      d.description,
    ])
  );
  res.status(201).json(r.rows[0]);
});

salles.put('/:id', autoriser('admin'), async (req, res) => {
  const id = entierParam(req.params.id);
  const d = valider(req.body, schemaSalle);
  const s = await db.un('SELECT id FROM salles WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!s) throw introuvable('Salle');
  const r = await db.tx(req, (c) =>
    c.query('UPDATE salles SET nom=$1, capacite=$2, disponible=$3, description=$4 WHERE id=$5 RETURNING *', [
      d.nom,
      d.capacite,
      d.disponible,
      d.description,
      id,
    ])
  );
  res.json(r.rows[0]);
});

salles.delete('/:id', autoriser('admin'), async (req, res) => {
  const id = entierParam(req.params.id);
  const force = req.query.force === '1' || req.query.force === 'true';
  const s = await db.un('SELECT id, nom FROM salles WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!s) throw introuvable('Salle');
  const n = (await db.un('SELECT COUNT(*)::int AS n FROM creneaux WHERE salle_id = $1 AND deleted_at IS NULL', [id])).n;
  if (n && !force) {
    throw confirmationRequise(`La salle « ${s.nom} » est utilisée dans ${n} créneau(x) de l'emploi du temps. Ces créneaux resteront sans salle.`, {
      creneaux: n,
    });
  }
  await db.tx(req, async (c) => {
    await c.query('UPDATE creneaux SET salle_id = NULL WHERE salle_id = $1 AND deleted_at IS NULL', [id]);
    await c.query('UPDATE salles SET deleted_at = now() WHERE id = $1', [id]);
  });
  res.json({ ok: true });
});

module.exports = { matieres, salles };
