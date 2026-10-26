// Classes (CRUD contrôlé, effectifs) et affectations matière <-> enseignant <-> classe.
const express = require('express');
const db = require('../db');
const { autoriser, PERSONNEL, ADMINISTRATION } = require('../middleware/auth');
const { valider, entierParam, HttpError, introuvable, confirmationRequise } = require('../utils');
const { anneeCourante, NIVEAUX } = require('../services/parametres');
const { classesEnseignant } = require('../services/acces');
const { affecterClasse } = require('../services/inscriptions');

const router = express.Router();

const SELECT_CLASSE = `
  SELECT c.id, c.niveau, c.section, c.niveau || ' ' || c.section AS nom, c.capacite_max, c.annee_scolaire, c.titulaire_id,
         t.prenom || ' ' || t.nom AS titulaire,
         (SELECT COUNT(*)::int FROM inscriptions i JOIN eleves e ON e.id = i.eleve_id AND e.deleted_at IS NULL WHERE i.classe_id = c.id) AS effectif
    FROM classes c LEFT JOIN utilisateurs t ON t.id = c.titulaire_id`;

const ORDRE_NIVEAU = `array_position(ARRAY['CP','CE1','CE2','CM1','CM2'], c.niveau)`;

router.get('/', autoriser(...PERSONNEL), async (req, res) => {
  const annee = req.query.annee || anneeCourante();
  const params = [annee];
  let filtre = '';
  if (req.user.role === 'enseignant' && req.query.toutes !== '1') {
    params.push(await classesEnseignant(db, req.user.id, annee));
    filtre = ' AND c.id = ANY($2)';
  }
  const r = await db.query(
    `${SELECT_CLASSE} WHERE c.deleted_at IS NULL AND c.annee_scolaire = $1${filtre} ORDER BY ${ORDRE_NIVEAU}, c.section`,
    params
  );
  res.json(r.rows);
});

router.get('/:id', autoriser(...PERSONNEL), async (req, res) => {
  const id = entierParam(req.params.id);
  const c = await db.un(`${SELECT_CLASSE} WHERE c.id = $1 AND c.deleted_at IS NULL`, [id]);
  if (!c) throw introuvable('Classe');
  c.eleves = (
    await db.query(
      `SELECT e.id, e.matricule, e.nom, e.prenom, e.sexe, e.date_naissance, e.photo_id, i.mode_affectation
         FROM inscriptions i JOIN eleves e ON e.id = i.eleve_id AND e.deleted_at IS NULL
        WHERE i.classe_id = $1 ORDER BY e.nom, e.prenom`,
      [id]
    )
  ).rows;
  c.affectations = (
    await db.query(
      `SELECT a.id, a.matiere_id, m.nom AS matiere, m.coefficient, a.enseignant_id, u.prenom || ' ' || u.nom AS enseignant
         FROM affectations a JOIN matieres m ON m.id = a.matiere_id JOIN utilisateurs u ON u.id = a.enseignant_id
        WHERE a.classe_id = $1 AND a.deleted_at IS NULL ORDER BY m.coefficient DESC, m.nom`,
      [id]
    )
  ).rows;
  res.json(c);
});

const schemaClasse = {
  niveau: { type: 'string', required: true, enum: NIVEAUX, label: 'Niveau' },
  section: { type: 'string', required: true, label: 'Section', maxLength: 5 },
  capacite_max: { type: 'int', required: true, min: 1, max: 60, label: 'Capacité maximale' },
  titulaire_id: { type: 'int', label: 'Enseignant titulaire' },
  annee_scolaire: { type: 'string', label: 'Année scolaire', maxLength: 9 },
};

async function verifierTitulaire(id) {
  if (!id) return;
  const t = await db.un("SELECT 1 FROM utilisateurs WHERE id = $1 AND role = 'enseignant' AND deleted_at IS NULL", [id]);
  if (!t) throw new HttpError(400, 'Le titulaire doit être un enseignant.');
}

router.post('/', autoriser('admin'), async (req, res) => {
  const d = valider(req.body, schemaClasse);
  d.section = d.section.toUpperCase();
  const annee = d.annee_scolaire || anneeCourante();
  if (!/^\d{4}-\d{4}$/.test(annee)) throw new HttpError(400, 'Année scolaire invalide (format AAAA-AAAA).');
  await verifierTitulaire(d.titulaire_id);
  const r = await db.tx(req, (c) =>
    c.query(
      `INSERT INTO classes (niveau, section, capacite_max, annee_scolaire, titulaire_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [d.niveau, d.section, d.capacite_max, annee, d.titulaire_id]
    )
  );
  res.status(201).json(r.rows[0]);
});

router.put('/:id', autoriser('admin'), async (req, res) => {
  const id = entierParam(req.params.id);
  const d = valider(req.body, schemaClasse);
  d.section = d.section.toUpperCase();
  const c = await db.un(`${SELECT_CLASSE} WHERE c.id = $1 AND c.deleted_at IS NULL`, [id]);
  if (!c) throw introuvable('Classe');
  if (d.capacite_max < c.effectif) {
    throw new HttpError(400, `La capacité ne peut pas être inférieure à l'effectif actuel (${c.effectif} élèves).`);
  }
  await verifierTitulaire(d.titulaire_id);
  const r = await db.tx(req, (cl) =>
    cl.query(`UPDATE classes SET niveau=$1, section=$2, capacite_max=$3, titulaire_id=$4 WHERE id=$5 RETURNING *`, [
      d.niveau,
      d.section,
      d.capacite_max,
      d.titulaire_id,
      id,
    ])
  );
  res.json(r.rows[0]);
});

router.delete('/:id', autoriser('admin'), async (req, res) => {
  const id = entierParam(req.params.id);
  const force = req.query.force === '1' || req.query.force === 'true';
  const c = await db.un(`${SELECT_CLASSE} WHERE c.id = $1 AND c.deleted_at IS NULL`, [id]);
  if (!c) throw introuvable('Classe');
  if (c.effectif > 0 && !force) {
    throw confirmationRequise(
      `La classe ${c.nom} contient encore ${c.effectif} élève(s). Réaffectez-les d'abord, ou confirmez : ` +
        `ils seront désaffectés (sans classe) et l'emploi du temps de la classe sera supprimé.`,
      { effectif: c.effectif }
    );
  }
  await db.tx(req, async (cl) => {
    await cl.query('DELETE FROM inscriptions WHERE classe_id = $1', [id]);
    await cl.query('UPDATE affectations SET deleted_at = now() WHERE classe_id = $1 AND deleted_at IS NULL', [id]);
    await cl.query('UPDATE creneaux SET deleted_at = now() WHERE classe_id = $1 AND deleted_at IS NULL', [id]);
    await cl.query('UPDATE classes SET deleted_at = now() WHERE id = $1', [id]);
  });
  res.json({ ok: true });
});

// Affectation d'élèves à la classe (contrôle des effectifs)
router.post('/:id/eleves', autoriser(...ADMINISTRATION), async (req, res) => {
  const id = entierParam(req.params.id);
  const d = valider(req.body, { eleve_ids: { type: 'ids', required: true, label: 'Élèves' } });
  const c = await db.un(`${SELECT_CLASSE} WHERE c.id = $1 AND c.deleted_at IS NULL`, [id]);
  if (!c) throw introuvable('Classe');
  const dejaDedans = (await db.query('SELECT eleve_id FROM inscriptions WHERE classe_id = $1', [id])).rows.map((x) => x.eleve_id);
  const nouveaux = d.eleve_ids.filter((x) => !dejaDedans.includes(x));
  if (c.effectif + nouveaux.length > c.capacite_max) {
    throw new HttpError(
      409,
      `Capacité dépassée : la classe ${c.nom} compte ${c.effectif}/${c.capacite_max} élèves, ` +
        `il reste ${Math.max(0, c.capacite_max - c.effectif)} place(s) pour ${nouveaux.length} élève(s) sélectionné(s).`
    );
  }
  await db.tx(req, async (cl) => {
    for (const eleveId of nouveaux) await affecterClasse(cl, eleveId, id, 'manuelle');
  });
  res.json({ ok: true, affectes: nouveaux.length });
});

router.delete('/:id/eleves/:eleveId', autoriser(...ADMINISTRATION), async (req, res) => {
  const id = entierParam(req.params.id);
  const eleveId = entierParam(req.params.eleveId);
  await db.tx(req, (c) => c.query('DELETE FROM inscriptions WHERE classe_id = $1 AND eleve_id = $2', [id, eleveId]));
  res.json({ ok: true });
});

// ----- Affectations matière <-> enseignant <-> classe -----
const affectations = express.Router();

affectations.get('/', autoriser(...PERSONNEL), async (req, res) => {
  const annee = req.query.annee || anneeCourante();
  const r = await db.query(
    `SELECT a.id, a.enseignant_id, u.prenom || ' ' || u.nom AS enseignant, a.matiere_id, m.nom AS matiere, m.coefficient,
            a.classe_id, c.niveau || ' ' || c.section AS classe, c.niveau
       FROM affectations a
       JOIN utilisateurs u ON u.id = a.enseignant_id
       JOIN matieres m ON m.id = a.matiere_id
       JOIN classes c ON c.id = a.classe_id AND c.deleted_at IS NULL
      WHERE a.deleted_at IS NULL AND c.annee_scolaire = $1
        AND ($2::int IS NULL OR a.enseignant_id = $2) AND ($3::int IS NULL OR a.classe_id = $3)
      ORDER BY ${ORDRE_NIVEAU}, c.section, m.nom`,
    [annee, req.query.enseignant_id ? entierParam(req.query.enseignant_id) : null, req.query.classe_id ? entierParam(req.query.classe_id) : null]
  );
  res.json(r.rows);
});

affectations.post('/', autoriser('admin'), async (req, res) => {
  const d = valider(req.body, {
    enseignant_id: { type: 'int', required: true, label: 'Enseignant' },
    matiere_id: { type: 'int', required: true, label: 'Matière' },
    classe_id: { type: 'int', required: true, label: 'Classe' },
  });
  const ens = await db.un("SELECT 1 FROM utilisateurs WHERE id = $1 AND role = 'enseignant' AND deleted_at IS NULL", [d.enseignant_id]);
  if (!ens) throw new HttpError(400, 'Enseignant introuvable.');
  const classe = await db.un('SELECT * FROM classes WHERE id = $1 AND deleted_at IS NULL', [d.classe_id]);
  if (!classe) throw introuvable('Classe');
  const matiere = await db.un('SELECT * FROM matieres WHERE id = $1 AND deleted_at IS NULL', [d.matiere_id]);
  if (!matiere) throw introuvable('Matière');
  if (matiere.niveau && matiere.niveau !== classe.niveau) {
    throw new HttpError(400, `La matière « ${matiere.nom} » concerne le niveau ${matiere.niveau}, pas ${classe.niveau}.`);
  }
  const existante = await db.un(
    `SELECT a.id, u.prenom || ' ' || u.nom AS enseignant FROM affectations a JOIN utilisateurs u ON u.id = a.enseignant_id
      WHERE a.matiere_id = $1 AND a.classe_id = $2 AND a.deleted_at IS NULL`,
    [d.matiere_id, d.classe_id]
  );
  if (existante) {
    throw new HttpError(409, `${matiere.nom} en ${classe.niveau} ${classe.section} est déjà affectée à ${existante.enseignant}.`);
  }
  const r = await db.tx(req, (c) =>
    c.query('INSERT INTO affectations (enseignant_id, matiere_id, classe_id, annee_scolaire) VALUES ($1,$2,$3,$4) RETURNING *', [
      d.enseignant_id,
      d.matiere_id,
      d.classe_id,
      classe.annee_scolaire,
    ])
  );
  res.status(201).json(r.rows[0]);
});

affectations.delete('/:id', autoriser('admin'), async (req, res) => {
  const id = entierParam(req.params.id);
  await db.tx(req, (c) => c.query('UPDATE affectations SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [id]));
  res.json({ ok: true });
});

module.exports = { classes: router, affectations };
