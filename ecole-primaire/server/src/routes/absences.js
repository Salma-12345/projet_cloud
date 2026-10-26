// Suivi des absences : appel par classe, justification par les parents, validation.
const express = require('express');
const db = require('../db');
const { autoriser } = require('../middleware/auth');
const { valider, entierParam, HttpError, introuvable, interdit, formatDate, dateLocaleIso } = require('../utils');
const { anneeCourante } = require('../services/parametres');
const { elevesVisibles, enseigneDans, peutVoirEleve } = require('../services/acces');
const { notifier } = require('../services/notifications');
const { televersement, enregistrerFichier } = require('../services/fichiers');

const router = express.Router();
const PERIODES = { matin: 'matin', apres_midi: 'après-midi', journee: 'journée' };

const SELECT = `
  SELECT a.id, a.eleve_id, e.nom, e.prenom, e.matricule, a.date_absence, a.periode, a.motif, a.statut,
         a.justification, a.justificatif_id, a.justifie_at, a.valide_at, a.annee_scolaire,
         i.classe_id, c.niveau || ' ' || c.section AS classe,
         jp.prenom || ' ' || jp.nom AS justifie_par_nom, sp.prenom || ' ' || sp.nom AS saisi_par_nom
    FROM absences a
    JOIN eleves e ON e.id = a.eleve_id
    LEFT JOIN inscriptions i ON i.eleve_id = a.eleve_id AND i.annee_scolaire = a.annee_scolaire
    LEFT JOIN classes c ON c.id = i.classe_id
    LEFT JOIN utilisateurs jp ON jp.id = a.justifie_par
    LEFT JOIN utilisateurs sp ON sp.id = a.saisi_par`;

router.get('/', async (req, res) => {
  const annee = req.query.annee || anneeCourante();
  const conditions = ['a.deleted_at IS NULL', 'a.annee_scolaire = $1'];
  const params = [annee];
  const ajouter = (sql, v) => {
    params.push(v);
    conditions.push(sql.replace('?', `$${params.length}`));
  };
  const visibles = await elevesVisibles(db, req.user, annee);
  if (visibles !== null) ajouter('a.eleve_id = ANY(?)', visibles);
  if (req.query.classe_id) ajouter('i.classe_id = ?', entierParam(req.query.classe_id));
  if (req.query.eleve_id) ajouter('a.eleve_id = ?', entierParam(req.query.eleve_id));
  if (req.query.date) ajouter('a.date_absence = ?', String(req.query.date).slice(0, 10));
  if (req.query.statut) ajouter('a.statut = ?', String(req.query.statut));
  const r = await db.query(`${SELECT} WHERE ${conditions.join(' AND ')} ORDER BY a.date_absence DESC, c.niveau, e.nom LIMIT 500`, params);
  res.json(r.rows);
});

async function verifierClasse(user, classeId) {
  if (user.role === 'admin') return;
  if (user.role !== 'enseignant' || !(await enseigneDans(db, user.id, classeId))) throw interdit("Cette classe ne vous est pas affectée.");
}

// Feuille d'appel : élèves de la classe + absences déjà saisies pour la date / période
router.get('/appel', autoriser('admin', 'enseignant'), async (req, res) => {
  const classeId = entierParam(req.query.classe_id, 'classe');
  await verifierClasse(req.user, classeId);
  const date = String(req.query.date || dateLocaleIso()).slice(0, 10);
  const periode = PERIODES[req.query.periode] ? req.query.periode : 'matin';
  const r = await db.query(
    `SELECT e.id, e.nom, e.prenom, e.matricule, e.photo_id, a.id AS absence_id, a.statut, a.motif
       FROM inscriptions i JOIN eleves e ON e.id = i.eleve_id AND e.deleted_at IS NULL
       LEFT JOIN absences a ON a.eleve_id = e.id AND a.date_absence = $2 AND a.deleted_at IS NULL
                           AND (a.periode = $3 OR a.periode = 'journee')
      WHERE i.classe_id = $1 ORDER BY e.nom, e.prenom`,
    [classeId, date, periode]
  );
  res.json({ date, periode, eleves: r.rows });
});

// Enregistrement de l'appel (synchronisation des absences de la classe pour la date / période)
router.put('/appel', autoriser('admin', 'enseignant'), async (req, res) => {
  const d = valider(req.body, {
    classe_id: { type: 'int', required: true, label: 'Classe' },
    date_absence: { type: 'date', required: true, label: 'Date' },
    periode: { type: 'string', required: true, enum: Object.keys(PERIODES), label: 'Période' },
    motif: { type: 'string', maxLength: 300 },
  });
  const absents = (Array.isArray(req.body.absents) ? req.body.absents : []).map(Number);
  await verifierClasse(req.user, d.classe_id);
  const classe = await db.un('SELECT annee_scolaire, niveau, section FROM classes WHERE id = $1 AND deleted_at IS NULL', [d.classe_id]);
  if (!classe) throw introuvable('Classe');
  const inscrits = new Set((await db.query('SELECT eleve_id FROM inscriptions WHERE classe_id = $1', [d.classe_id])).rows.map((x) => x.eleve_id));
  if (absents.some((x) => !inscrits.has(x))) throw new HttpError(400, 'Un des élèves n’appartient pas à cette classe.');

  const bilan = await db.tx(req, async (c) => {
    const existantes = (
      await c.query(
        `SELECT a.id, a.eleve_id, a.statut FROM absences a JOIN inscriptions i ON i.eleve_id = a.eleve_id AND i.classe_id = $1
          WHERE a.date_absence = $2 AND a.periode = $3 AND a.deleted_at IS NULL`,
        [d.classe_id, d.date_absence, d.periode]
      )
    ).rows;
    let ajoutees = 0;
    let retirees = 0;
    for (const ex of existantes) {
      if (!absents.includes(ex.eleve_id) && ex.statut === 'non_justifiee') {
        await c.query('UPDATE absences SET deleted_at = now() WHERE id = $1', [ex.id]);
        retirees += 1;
      }
    }
    const nouveaux = absents.filter((id) => !existantes.some((ex) => ex.eleve_id === id));
    for (const eleveId of nouveaux) {
      const r = await c.query(
        `INSERT INTO absences (eleve_id, date_absence, periode, motif, annee_scolaire, saisi_par)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id`,
        [eleveId, d.date_absence, d.periode, d.motif, classe.annee_scolaire, req.user.id]
      );
      if (!r.rowCount) continue;
      ajoutees += 1;
      const e = (await c.query('SELECT prenom, nom, sexe FROM eleves WHERE id = $1', [eleveId])).rows[0];
      const parents = (await c.query('SELECT parent_id FROM parents_eleves WHERE eleve_id = $1', [eleveId])).rows.map((x) => x.parent_id);
      await notifier(c, parents, {
        type: 'absence',
        titre: `Absence de ${e.prenom}`,
        contenu: `${e.prenom} ${e.nom} a été noté${e.sexe === 'F' ? 'e absente' : ' absent'} le ${formatDate(d.date_absence)} (${PERIODES[d.periode]}). Vous pouvez justifier cette absence depuis l'application.`,
        lien: `/enfants/${eleveId}?onglet=absences`,
        contexte: 'absence',
        ref_type: 'absence',
        ref_id: r.rows[0].id,
      });
    }
    return { ajoutees, retirees };
  });
  res.json({ ok: true, ...bilan });
});

router.put('/:id', autoriser('admin', 'enseignant'), async (req, res) => {
  const id = entierParam(req.params.id);
  const a = await db.un(`${SELECT} WHERE a.id = $1 AND a.deleted_at IS NULL`, [id]);
  if (!a) throw introuvable('Absence');
  await verifierClasse(req.user, a.classe_id);
  const d = valider(req.body, {
    date_absence: { type: 'date', required: true, label: 'Date' },
    periode: { type: 'string', required: true, enum: Object.keys(PERIODES), label: 'Période' },
    motif: { type: 'string', maxLength: 300 },
  });
  await db.tx(req, (c) => c.query('UPDATE absences SET date_absence=$1, periode=$2, motif=$3 WHERE id=$4', [d.date_absence, d.periode, d.motif, id]));
  res.json(await db.un(`${SELECT} WHERE a.id = $1`, [id]));
});

router.delete('/:id', autoriser('admin', 'enseignant'), async (req, res) => {
  const id = entierParam(req.params.id);
  const a = await db.un(`${SELECT} WHERE a.id = $1 AND a.deleted_at IS NULL`, [id]);
  if (!a) throw introuvable('Absence');
  await verifierClasse(req.user, a.classe_id);
  await db.tx(req, (c) => c.query('UPDATE absences SET deleted_at = now() WHERE id = $1', [id]));
  res.json({ ok: true });
});

// Justification par le parent (texte + justificatif facultatif)
router.post('/:id/justifier', autoriser('parent'), televersement({ maxFichiers: 1 }).single('justificatif'), async (req, res) => {
  const id = entierParam(req.params.id);
  const a = await db.un(`${SELECT} WHERE a.id = $1 AND a.deleted_at IS NULL`, [id]);
  if (!a) throw introuvable('Absence');
  if (!(await peutVoirEleve(db, req.user, a.eleve_id))) throw interdit();
  if (a.statut === 'justifiee') throw new HttpError(400, 'Cette absence est déjà justifiée.');
  const d = valider(req.body, { justification: { type: 'string', required: true, label: 'Justification', maxLength: 1000 } });
  await db.tx(req, async (c) => {
    let fichierId = a.justificatif_id;
    if (req.file) fichierId = (await enregistrerFichier(c, req.file, 'justificatif', id, req.user.id)).id;
    await c.query(
      `UPDATE absences SET justification = $1, justificatif_id = $2, statut = 'en_attente', justifie_par = $3, justifie_at = now()
        WHERE id = $4`,
      [d.justification, fichierId, req.user.id, id]
    );
    const destinataires = (
      await c.query(
        `SELECT id FROM utilisateurs WHERE role = 'admin' AND actif AND deleted_at IS NULL
         UNION SELECT titulaire_id FROM classes WHERE id = $1 AND titulaire_id IS NOT NULL`,
        [a.classe_id]
      )
    ).rows.map((x) => x.id);
    await notifier(c, destinataires, {
      type: 'absence',
      titre: `Justificatif d'absence reçu — ${a.prenom} ${a.nom}`,
      contenu: `Absence du ${formatDate(a.date_absence)} : « ${d.justification.slice(0, 140)} »`,
      lien: '/absences?statut=en_attente',
      contexte: 'absence',
      ref_type: 'absence',
      ref_id: id,
    });
  });
  res.json(await db.un(`${SELECT} WHERE a.id = $1`, [id]));
});

// Validation (ou refus) du justificatif
router.post('/:id/valider', autoriser('admin', 'enseignant'), async (req, res) => {
  const id = entierParam(req.params.id);
  const a = await db.un(`${SELECT} WHERE a.id = $1 AND a.deleted_at IS NULL`, [id]);
  if (!a) throw introuvable('Absence');
  await verifierClasse(req.user, a.classe_id);
  const d = valider(req.body, { decision: { type: 'string', required: true, enum: ['justifiee', 'refusee'], label: 'Décision' } });
  await db.tx(req, async (c) => {
    await c.query('UPDATE absences SET statut = $1, valide_par = $2, valide_at = now() WHERE id = $3', [d.decision, req.user.id, id]);
    const parents = (await c.query('SELECT parent_id FROM parents_eleves WHERE eleve_id = $1', [a.eleve_id])).rows.map((x) => x.parent_id);
    await notifier(c, parents, {
      type: 'absence',
      titre: d.decision === 'justifiee' ? `Absence justifiée — ${a.prenom}` : `Justificatif refusé — ${a.prenom}`,
      contenu: `L'absence du ${formatDate(a.date_absence)} est ${d.decision === 'justifiee' ? 'désormais justifiée' : 'considérée comme non justifiée'}.`,
      lien: `/enfants/${a.eleve_id}?onglet=absences`,
      contexte: 'absence',
      ref_type: 'absence',
      ref_id: id,
    });
  });
  res.json(await db.un(`${SELECT} WHERE a.id = $1`, [id]));
});

module.exports = router;
