// Emploi du temps : créneaux par classe / enseignant / salle avec détection des conflits.
const express = require('express');
const db = require('../db');
const { autoriser } = require('../middleware/auth');
const { valider, entierParam, HttpError, introuvable, interdit } = require('../utils');
const { anneeCourante } = require('../services/parametres');
const { enfantsParent, eleveDuCompte, classeDeLEleve, enseigneDans } = require('../services/acces');

const router = express.Router();
const JOURS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

const SELECT = `
  SELECT cr.id, cr.jour, to_char(cr.heure_debut, 'HH24:MI') AS heure_debut, to_char(cr.heure_fin, 'HH24:MI') AS heure_fin,
         cr.classe_id, c.niveau || ' ' || c.section AS classe, cr.matiere_id, m.nom AS matiere,
         cr.enseignant_id, u.prenom || ' ' || u.nom AS enseignant, cr.salle_id, s.nom AS salle, cr.annee_scolaire
    FROM creneaux cr
    JOIN classes c ON c.id = cr.classe_id AND c.deleted_at IS NULL
    JOIN matieres m ON m.id = cr.matiere_id
    JOIN utilisateurs u ON u.id = cr.enseignant_id
    LEFT JOIN salles s ON s.id = cr.salle_id`;

router.get('/', async (req, res) => {
  const annee = req.query.annee || anneeCourante();
  const conditions = ['cr.deleted_at IS NULL', 'cr.annee_scolaire = $1'];
  const params = [annee];
  const ajouter = (sql, v) => {
    params.push(v);
    conditions.push(sql.replace('?', `$${params.length}`));
  };

  if (req.user.role === 'parent') {
    const enfants = await enfantsParent(db, req.user.id);
    const classes = [];
    for (const e of enfants) {
      const c = await classeDeLEleve(db, e, annee);
      if (c) classes.push(c);
    }
    if (req.query.classe_id) {
      const cid = entierParam(req.query.classe_id);
      if (!classes.includes(cid)) throw interdit("Cette classe n'est pas celle de vos enfants.");
      ajouter('cr.classe_id = ?', cid);
    } else ajouter('cr.classe_id = ANY(?)', classes);
  } else if (req.user.role === 'eleve') {
    const eleveId = await eleveDuCompte(db, req.user.id);
    ajouter('cr.classe_id = ?', eleveId ? (await classeDeLEleve(db, eleveId, annee)) || 0 : 0);
  } else {
    if (req.query.classe_id) ajouter('cr.classe_id = ?', entierParam(req.query.classe_id));
    if (req.query.enseignant_id) ajouter('cr.enseignant_id = ?', entierParam(req.query.enseignant_id));
    if (req.query.salle_id) ajouter('cr.salle_id = ?', entierParam(req.query.salle_id));
  }
  const r = await db.query(`${SELECT} WHERE ${conditions.join(' AND ')} ORDER BY cr.jour, cr.heure_debut, classe`, params);
  res.json(r.rows);
});

const schema = {
  classe_id: { type: 'int', required: true, label: 'Classe' },
  matiere_id: { type: 'int', required: true, label: 'Matière' },
  enseignant_id: { type: 'int', required: true, label: 'Enseignant' },
  salle_id: { type: 'int', label: 'Salle' },
  jour: { type: 'int', required: true, min: 1, max: 6, label: 'Jour' },
  heure_debut: { type: 'time', required: true, label: 'Heure de début' },
  heure_fin: { type: 'time', required: true, label: 'Heure de fin' },
};

/** Vérifie la cohérence du créneau et détecte les conflits (enseignant, salle, classe). */
async function controlerCreneau(d, idExclu = null) {
  if (d.heure_fin <= d.heure_debut) throw new HttpError(400, "L'heure de fin doit être après l'heure de début.");
  if (d.heure_debut < '07:00' || d.heure_fin > '19:00') throw new HttpError(400, 'Les cours doivent avoir lieu entre 07:00 et 19:00.');

  const classe = await db.un(
    `SELECT c.*, (SELECT COUNT(*)::int FROM inscriptions i WHERE i.classe_id = c.id) AS effectif
       FROM classes c WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [d.classe_id]
  );
  if (!classe) throw introuvable('Classe');
  const matiere = await db.un('SELECT * FROM matieres WHERE id = $1 AND deleted_at IS NULL', [d.matiere_id]);
  if (!matiere) throw introuvable('Matière');
  const ens = await db.un("SELECT id, prenom, nom FROM utilisateurs WHERE id = $1 AND role = 'enseignant' AND deleted_at IS NULL", [d.enseignant_id]);
  if (!ens) throw new HttpError(400, 'Enseignant introuvable.');
  if (!(await enseigneDans(db, d.enseignant_id, d.classe_id, d.matiere_id))) {
    throw new HttpError(
      400,
      `${ens.prenom} ${ens.nom} n'est pas affecté(e) à « ${matiere.nom} » en ${classe.niveau} ${classe.section}. ` +
        `Ajoutez d'abord l'affectation (menu Enseignants) ou choisissez l'enseignant affecté.`
    );
  }
  if (d.salle_id) {
    const salle = await db.un('SELECT * FROM salles WHERE id = $1 AND deleted_at IS NULL', [d.salle_id]);
    if (!salle) throw introuvable('Salle');
    if (!salle.disponible) throw new HttpError(409, `La salle « ${salle.nom} » est marquée comme indisponible.`, { conflits: [] });
    if (salle.capacite < classe.effectif) {
      throw new HttpError(409, `La salle « ${salle.nom} » (${salle.capacite} places) est trop petite pour ${classe.niveau} ${classe.section} (${classe.effectif} élèves).`);
    }
  }

  const r = await db.query(
    `${SELECT}
      WHERE cr.deleted_at IS NULL AND cr.annee_scolaire = $1 AND cr.jour = $2
        AND cr.heure_debut < $4::time AND cr.heure_fin > $3::time
        AND (cr.enseignant_id = $5 OR cr.classe_id = $6 OR ($7::int IS NOT NULL AND cr.salle_id = $7))
        AND ($8::int IS NULL OR cr.id <> $8)`,
    [classe.annee_scolaire, d.jour, d.heure_debut, d.heure_fin, d.enseignant_id, d.classe_id, d.salle_id, idExclu]
  );
  if (r.rowCount) {
    const conflits = [];
    for (const c of r.rows) {
      const quand = `le ${JOURS[c.jour]} de ${c.heure_debut} à ${c.heure_fin}`;
      if (c.enseignant_id === d.enseignant_id) conflits.push({ type: 'enseignant', message: `L'enseignant(e) ${c.enseignant} a déjà cours (${c.matiere}, ${c.classe}) ${quand}.` });
      if (d.salle_id && c.salle_id === d.salle_id) conflits.push({ type: 'salle', message: `La salle « ${c.salle} » est déjà occupée par ${c.classe} (${c.matiere}) ${quand}.` });
      if (c.classe_id === d.classe_id) conflits.push({ type: 'classe', message: `La classe ${c.classe} a déjà cours (${c.matiere}) ${quand}.` });
    }
    throw new HttpError(409, `Conflit d'emploi du temps : ${conflits[0].message}`, { conflits });
  }
  return classe;
}

router.post('/', autoriser('admin'), async (req, res) => {
  const d = valider(req.body, schema);
  const classe = await controlerCreneau(d);
  const r = await db.tx(req, (c) =>
    c.query(
      `INSERT INTO creneaux (classe_id, matiere_id, enseignant_id, salle_id, jour, heure_debut, heure_fin, annee_scolaire)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [d.classe_id, d.matiere_id, d.enseignant_id, d.salle_id, d.jour, d.heure_debut, d.heure_fin, classe.annee_scolaire]
    )
  );
  res.status(201).json(await db.un(`${SELECT} WHERE cr.id = $1`, [r.rows[0].id]));
});

router.put('/:id', autoriser('admin'), async (req, res) => {
  const id = entierParam(req.params.id);
  const existe = await db.un('SELECT id FROM creneaux WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!existe) throw introuvable('Créneau');
  const d = valider(req.body, schema);
  const classe = await controlerCreneau(d, id);
  await db.tx(req, (c) =>
    c.query(
      `UPDATE creneaux SET classe_id=$1, matiere_id=$2, enseignant_id=$3, salle_id=$4, jour=$5, heure_debut=$6, heure_fin=$7, annee_scolaire=$8
        WHERE id = $9`,
      [d.classe_id, d.matiere_id, d.enseignant_id, d.salle_id, d.jour, d.heure_debut, d.heure_fin, classe.annee_scolaire, id]
    )
  );
  res.json(await db.un(`${SELECT} WHERE cr.id = $1`, [id]));
});

router.delete('/:id', autoriser('admin'), async (req, res) => {
  const id = entierParam(req.params.id);
  const r = await db.tx(req, (c) => c.query('UPDATE creneaux SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [id]));
  if (!r.rowCount) throw introuvable('Créneau');
  res.json({ ok: true });
});

module.exports = router;
