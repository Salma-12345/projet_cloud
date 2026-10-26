// Évaluations, saisie des notes, moyennes et bulletins (JSON + PDF).
const express = require('express');
const db = require('../db');
const { autoriser } = require('../middleware/auth');
const { valider, entierParam, HttpError, introuvable, confirmationRequise } = require('../utils');
const { anneeCourante } = require('../services/parametres');
const { classesEnseignant, verifierEnseignement, verifierAccesEleve, enseigneDans } = require('../services/acces');
const { resultatsClasse, bulletinEleve, arrondi } = require('../services/notes');
const { pdfBulletin } = require('../services/pdf');

const evaluations = express.Router();

const SELECT = `
  SELECT ev.id, ev.titre, ev.type, ev.trimestre, ev.date_evaluation, ev.bareme, ev.annee_scolaire,
         ev.classe_id, c.niveau || ' ' || c.section AS classe, ev.matiere_id, m.nom AS matiere, m.coefficient,
         ev.enseignant_id, u.prenom || ' ' || u.nom AS enseignant,
         (SELECT COUNT(*)::int FROM notes n WHERE n.evaluation_id = ev.id AND n.deleted_at IS NULL) AS nb_notes,
         (SELECT AVG(n.valeur / ev.bareme * 20) FROM notes n WHERE n.evaluation_id = ev.id AND n.deleted_at IS NULL) AS moyenne_sur_20,
         (SELECT COUNT(*)::int FROM inscriptions i WHERE i.classe_id = ev.classe_id) AS effectif
    FROM evaluations ev
    JOIN classes c ON c.id = ev.classe_id
    JOIN matieres m ON m.id = ev.matiere_id
    LEFT JOIN utilisateurs u ON u.id = ev.enseignant_id`;

evaluations.get('/', autoriser('admin', 'enseignant'), async (req, res) => {
  const annee = req.query.annee || anneeCourante();
  const conditions = ['ev.deleted_at IS NULL', 'ev.annee_scolaire = $1'];
  const params = [annee];
  const ajouter = (sql, v) => {
    params.push(v);
    conditions.push(sql.replace('?', `$${params.length}`));
  };
  if (req.query.classe_id) ajouter('ev.classe_id = ?', entierParam(req.query.classe_id));
  if (req.query.matiere_id) ajouter('ev.matiere_id = ?', entierParam(req.query.matiere_id));
  if (req.query.trimestre) ajouter('ev.trimestre = ?', entierParam(req.query.trimestre));
  if (req.user.role === 'enseignant') {
    // L'enseignant ne voit que ses matières (ou toutes les matières des classes dont il est titulaire)
    params.push(req.user.id);
    const p = `$${params.length}`;
    conditions.push(`(EXISTS (SELECT 1 FROM affectations a WHERE a.classe_id = ev.classe_id AND a.matiere_id = ev.matiere_id
                                AND a.enseignant_id = ${p} AND a.deleted_at IS NULL)
                     OR c.titulaire_id = ${p})`);
  }
  const r = await db.query(`${SELECT} WHERE ${conditions.join(' AND ')} ORDER BY ev.date_evaluation DESC, ev.id DESC`, params);
  res.json(r.rows.map((x) => ({ ...x, moyenne_sur_20: arrondi(x.moyenne_sur_20) })));
});

const schema = {
  classe_id: { type: 'int', required: true, label: 'Classe' },
  matiere_id: { type: 'int', required: true, label: 'Matière' },
  titre: { type: 'string', required: true, label: 'Titre', maxLength: 120 },
  type: { type: 'string', required: true, enum: ['controle_continu', 'examen'], label: 'Type' },
  trimestre: { type: 'int', required: true, min: 1, max: 3, label: 'Trimestre' },
  date_evaluation: { type: 'date', required: true, label: 'Date' },
  bareme: { type: 'number', min: 1, max: 100, defaut: 20, label: 'Barème' },
};

async function chargerEvaluation(id, user) {
  const ev = await db.un(`${SELECT} WHERE ev.id = $1 AND ev.deleted_at IS NULL`, [id]);
  if (!ev) throw introuvable('Évaluation');
  await verifierEnseignement(db, user, ev.classe_id, ev.matiere_id);
  return ev;
}

evaluations.post('/', autoriser('admin', 'enseignant'), async (req, res) => {
  const d = valider(req.body, schema);
  await verifierEnseignement(db, req.user, d.classe_id, d.matiere_id);
  const classe = await db.un('SELECT annee_scolaire FROM classes WHERE id = $1 AND deleted_at IS NULL', [d.classe_id]);
  if (!classe) throw introuvable('Classe');
  const r = await db.tx(req, (c) =>
    c.query(
      `INSERT INTO evaluations (classe_id, matiere_id, enseignant_id, titre, type, trimestre, date_evaluation, bareme, annee_scolaire)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [d.classe_id, d.matiere_id, req.user.role === 'enseignant' ? req.user.id : null, d.titre, d.type, d.trimestre, d.date_evaluation, d.bareme, classe.annee_scolaire]
    )
  );
  res.status(201).json(await db.un(`${SELECT} WHERE ev.id = $1`, [r.rows[0].id]));
});

evaluations.put('/:id', autoriser('admin', 'enseignant'), async (req, res) => {
  const id = entierParam(req.params.id);
  const ev = await chargerEvaluation(id, req.user);
  const d = valider(req.body, schema);
  if (d.classe_id !== ev.classe_id && ev.nb_notes > 0) throw new HttpError(400, 'Impossible de changer la classe d’une évaluation déjà notée.');
  await verifierEnseignement(db, req.user, d.classe_id, d.matiere_id);
  const max = (await db.un('SELECT MAX(valeur) AS m FROM notes WHERE evaluation_id = $1 AND deleted_at IS NULL', [id])).m;
  if (max !== null && d.bareme < max) throw new HttpError(400, `Le barème ne peut pas être inférieur à la meilleure note déjà saisie (${max}).`);
  await db.tx(req, (c) =>
    c.query(
      `UPDATE evaluations SET classe_id=$1, matiere_id=$2, titre=$3, type=$4, trimestre=$5, date_evaluation=$6, bareme=$7 WHERE id=$8`,
      [d.classe_id, d.matiere_id, d.titre, d.type, d.trimestre, d.date_evaluation, d.bareme, id]
    )
  );
  res.json(await db.un(`${SELECT} WHERE ev.id = $1`, [id]));
});

evaluations.delete('/:id', autoriser('admin', 'enseignant'), async (req, res) => {
  const id = entierParam(req.params.id);
  const ev = await chargerEvaluation(id, req.user);
  const force = req.query.force === '1' || req.query.force === 'true';
  if (ev.nb_notes > 0 && !force) {
    throw confirmationRequise(`L'évaluation « ${ev.titre} » contient ${ev.nb_notes} note(s). Elles seront supprimées et les moyennes recalculées.`, {
      notes: ev.nb_notes,
    });
  }
  await db.tx(req, async (c) => {
    await c.query('UPDATE notes SET deleted_at = now() WHERE evaluation_id = $1 AND deleted_at IS NULL', [id]);
    await c.query('UPDATE evaluations SET deleted_at = now() WHERE id = $1', [id]);
  });
  res.json({ ok: true });
});

// Grille de saisie des notes
evaluations.get('/:id/notes', autoriser('admin', 'enseignant'), async (req, res) => {
  const id = entierParam(req.params.id);
  const ev = await chargerEvaluation(id, req.user);
  const lignes = (
    await db.query(
      `SELECT e.id AS eleve_id, e.matricule, e.nom, e.prenom, n.id AS note_id, n.valeur, n.commentaire, n.updated_at
         FROM inscriptions i JOIN eleves e ON e.id = i.eleve_id AND e.deleted_at IS NULL
         LEFT JOIN notes n ON n.evaluation_id = $1 AND n.eleve_id = e.id AND n.deleted_at IS NULL
        WHERE i.classe_id = $2 ORDER BY e.nom, e.prenom`,
      [id, ev.classe_id]
    )
  ).rows;
  res.json({ evaluation: { ...ev, moyenne_sur_20: arrondi(ev.moyenne_sur_20) }, lignes });
});

evaluations.put('/:id/notes', autoriser('admin', 'enseignant'), async (req, res) => {
  const id = entierParam(req.params.id);
  const ev = await chargerEvaluation(id, req.user);
  const notes = Array.isArray(req.body.notes) ? req.body.notes : [];
  const inscrits = new Set((await db.query('SELECT eleve_id FROM inscriptions WHERE classe_id = $1', [ev.classe_id])).rows.map((x) => x.eleve_id));
  const propres = notes.map((n) => {
    const eleveId = Number(n.eleve_id);
    if (!inscrits.has(eleveId)) throw new HttpError(400, 'Un des élèves n’appartient pas à cette classe.');
    const brut = n.valeur === null || n.valeur === undefined ? '' : String(n.valeur).trim().replace(',', '.');
    let valeur = null;
    if (brut !== '') {
      valeur = Number(brut);
      if (!Number.isFinite(valeur) || valeur < 0 || valeur > ev.bareme) {
        throw new HttpError(400, `Note invalide « ${n.valeur} » : elle doit être comprise entre 0 et ${ev.bareme}.`);
      }
    }
    return { eleveId, valeur, commentaire: n.commentaire ? String(n.commentaire).slice(0, 500) : null };
  });
  let modifiees = 0;
  await db.tx(req, async (c) => {
    for (const n of propres) {
      const existante = (await c.query('SELECT id, valeur, commentaire FROM notes WHERE evaluation_id = $1 AND eleve_id = $2 AND deleted_at IS NULL', [id, n.eleveId]))
        .rows[0];
      if (n.valeur === null) {
        if (existante) {
          await c.query('UPDATE notes SET deleted_at = now() WHERE id = $1', [existante.id]);
          modifiees += 1;
        }
      } else if (existante) {
        if (existante.valeur !== n.valeur || (existante.commentaire || null) !== n.commentaire) {
          await c.query('UPDATE notes SET valeur = $1, commentaire = $2 WHERE id = $3', [n.valeur, n.commentaire, existante.id]);
          modifiees += 1;
        }
      } else {
        await c.query('INSERT INTO notes (evaluation_id, eleve_id, valeur, commentaire, annee_scolaire) VALUES ($1,$2,$3,$4,$5)', [
          id,
          n.eleveId,
          n.valeur,
          n.commentaire,
          ev.annee_scolaire,
        ]);
        modifiees += 1;
      }
    }
  });
  const maj = await db.un(`${SELECT} WHERE ev.id = $1`, [id]);
  res.json({ ok: true, modifiees, evaluation: { ...maj, moyenne_sur_20: arrondi(maj.moyenne_sur_20) } });
});

// ----- Bulletins -----
const bulletins = express.Router();

function trimestreParam(v) {
  const t = Number(v || 1);
  if (![1, 2, 3].includes(t)) throw new HttpError(400, 'Trimestre invalide (1, 2 ou 3).');
  return t;
}

bulletins.get('/classe/:classeId', autoriser('admin', 'enseignant'), async (req, res) => {
  const classeId = entierParam(req.params.classeId);
  if (req.user.role === 'enseignant' && !(await enseigneDans(db, req.user.id, classeId))) {
    throw new HttpError(403, "Cette classe ne vous est pas affectée.");
  }
  res.json(await resultatsClasse(db, classeId, trimestreParam(req.query.trimestre)));
});

bulletins.get('/eleve/:eleveId', async (req, res) => {
  const eleveId = entierParam(req.params.eleveId);
  await verifierAccesEleve(db, req.user, eleveId);
  res.json(await bulletinEleve(db, eleveId, req.query.annee || anneeCourante(), trimestreParam(req.query.trimestre)));
});

bulletins.get('/eleve/:eleveId/pdf', async (req, res) => {
  const eleveId = entierParam(req.params.eleveId);
  await verifierAccesEleve(db, req.user, eleveId);
  const b = await bulletinEleve(db, eleveId, req.query.annee || anneeCourante(), trimestreParam(req.query.trimestre));
  const pdf = await pdfBulletin(b);
  const nom = `bulletin-${b.eleve.matricule}-T${b.trimestre}-${b.annee_scolaire}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.telecharger === '1' ? 'attachment' : 'inline'}; filename="${nom}"`);
  res.send(pdf);
});

module.exports = { evaluations, bulletins, classesEnseignant };
