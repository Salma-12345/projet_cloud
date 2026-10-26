// Gestion financière : grille tarifaire, paiements (reçu PDF + message automatique au parent), impayés, relances.
const fs = require('fs');
const express = require('express');
const db = require('../db');
const { autoriser, ADMINISTRATION } = require('../middleware/auth');
const {
  valider,
  entierParam,
  HttpError,
  introuvable,
  confirmationRequise,
  formatMontant,
  formatDate,
  LIBELLES_MODE,
  urlPublique,
  nomComplet,
} = require('../utils');
const { anneeCourante, NIVEAUX, param } = require('../services/parametres');
const { verifierAccesEleve } = require('../services/acces');
const { situationEleve, situationsAnnee, envoyerRelances } = require('../services/finances');
const { envoyerMessageAuto } = require('../services/messagerie');
const { pdfRecu } = require('../services/pdf');
const { enregistrerContenu, cheminAbsolu } = require('../services/fichiers');
const { ecrireCsv, ecrireXlsx, envoyerFichier, MIME_CSV, MIME_XLSX } = require('../services/tableur');

// ----- Grille tarifaire -----
const tarifs = express.Router();

tarifs.get('/', autoriser('admin', 'comptable', 'parent'), async (req, res) => {
  const annee = req.query.annee || anneeCourante();
  const r = await db.query(
    `SELECT t.*, (SELECT COUNT(*)::int FROM paiements p WHERE p.tarif_id = t.id AND p.deleted_at IS NULL) AS nb_paiements
       FROM tarifs t WHERE t.deleted_at IS NULL AND t.annee_scolaire = $1
      ORDER BY t.date_echeance NULLS FIRST, t.id`,
    [annee]
  );
  res.json(r.rows);
});

const schemaTarif = {
  libelle: { type: 'string', required: true, label: 'Libellé', maxLength: 120 },
  type: { type: 'string', required: true, enum: ['inscription', 'tranche', 'autre'], label: 'Type' },
  montant: { type: 'number', required: true, min: 0, max: 1000000, label: 'Montant' },
  niveau: { type: 'string', enum: NIVEAUX, label: 'Niveau' },
  date_echeance: { type: 'date', label: 'Date d’échéance' },
  annee_scolaire: { type: 'string', label: 'Année scolaire', maxLength: 9 },
};

tarifs.post('/', autoriser(...ADMINISTRATION), async (req, res) => {
  const d = valider(req.body, schemaTarif);
  const annee = d.annee_scolaire || anneeCourante();
  const r = await db.tx(req, (c) =>
    c.query(
      `INSERT INTO tarifs (libelle, type, montant, niveau, date_echeance, annee_scolaire) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [d.libelle, d.type, d.montant, d.niveau, d.date_echeance, annee]
    )
  );
  res.status(201).json(r.rows[0]);
});

tarifs.put('/:id', autoriser(...ADMINISTRATION), async (req, res) => {
  const id = entierParam(req.params.id);
  const d = valider(req.body, schemaTarif);
  const t = await db.un('SELECT id FROM tarifs WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!t) throw introuvable('Tarif');
  const r = await db.tx(req, (c) =>
    c.query(`UPDATE tarifs SET libelle=$1, type=$2, montant=$3, niveau=$4, date_echeance=$5 WHERE id=$6 RETURNING *`, [
      d.libelle,
      d.type,
      d.montant,
      d.niveau,
      d.date_echeance,
      id,
    ])
  );
  res.json(r.rows[0]);
});

tarifs.delete('/:id', autoriser(...ADMINISTRATION), async (req, res) => {
  const id = entierParam(req.params.id);
  const force = req.query.force === '1' || req.query.force === 'true';
  const t = await db.un('SELECT id, libelle FROM tarifs WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!t) throw introuvable('Tarif');
  const n = (await db.un('SELECT COUNT(*)::int AS n FROM paiements WHERE tarif_id = $1 AND deleted_at IS NULL', [id])).n;
  if (n && !force) {
    throw confirmationRequise(`« ${t.libelle} » est rattaché à ${n} paiement(s). Les paiements seront conservés mais ne seront plus liés à ce tarif.`, {
      paiements: n,
    });
  }
  await db.tx(req, async (c) => {
    await c.query('UPDATE paiements SET tarif_id = NULL WHERE tarif_id = $1', [id]);
    await c.query('UPDATE tarifs SET deleted_at = now() WHERE id = $1', [id]);
  });
  res.json({ ok: true });
});

// ----- Paiements -----
const paiements = express.Router();

const SELECT_PAIEMENT = `
  SELECT p.*, e.nom, e.prenom, e.matricule, t.libelle AS tarif_libelle,
         c.niveau || ' ' || c.section AS classe, u.prenom || ' ' || u.nom AS enregistre_par_nom
    FROM paiements p
    JOIN eleves e ON e.id = p.eleve_id
    LEFT JOIN tarifs t ON t.id = p.tarif_id
    LEFT JOIN inscriptions i ON i.eleve_id = p.eleve_id AND i.annee_scolaire = p.annee_scolaire
    LEFT JOIN classes c ON c.id = i.classe_id
    LEFT JOIN utilisateurs u ON u.id = p.enregistre_par`;

paiements.get('/', autoriser(...ADMINISTRATION), async (req, res) => {
  const annee = req.query.annee || anneeCourante();
  const conditions = ['p.deleted_at IS NULL', 'p.annee_scolaire = $1'];
  const params = [annee];
  const ajouter = (sql, v) => {
    params.push(v);
    conditions.push(sql.replace('?', `$${params.length}`));
  };
  if (req.query.eleve_id) ajouter('p.eleve_id = ?', entierParam(req.query.eleve_id));
  if (req.query.classe_id) ajouter('i.classe_id = ?', entierParam(req.query.classe_id));
  if (req.query.mode) ajouter('p.mode = ?', String(req.query.mode));
  if (req.query.du) ajouter('p.date_paiement >= ?', String(req.query.du).slice(0, 10));
  if (req.query.au) ajouter('p.date_paiement <= ?', String(req.query.au).slice(0, 10));
  if (req.query.q) ajouter("lower(e.nom || ' ' || e.prenom || ' ' || e.matricule || ' ' || p.numero_recu) LIKE ?", `%${String(req.query.q).toLowerCase()}%`);
  const r = await db.query(`${SELECT_PAIEMENT} WHERE ${conditions.join(' AND ')} ORDER BY p.date_paiement DESC, p.id DESC LIMIT 1000`, params);
  res.json(r.rows);
});

const COLONNES_EXPORT = [
  { cle: 'numero_recu', titre: 'N° reçu', largeur: 14 },
  { cle: 'date_paiement', titre: 'Date', largeur: 12 },
  { cle: 'matricule', titre: 'Matricule', largeur: 13 },
  { cle: 'eleve', titre: 'Élève', largeur: 24 },
  { cle: 'classe', titre: 'Classe', largeur: 9 },
  { cle: 'objet', titre: 'Objet', largeur: 26 },
  { cle: 'mode_libelle', titre: 'Mode', largeur: 14 },
  { cle: 'reference', titre: 'Référence', largeur: 16 },
  { cle: 'montant', titre: 'Montant', largeur: 12 },
];

paiements.get('/export', autoriser(...ADMINISTRATION), async (req, res) => {
  const annee = req.query.annee || anneeCourante();
  const r = await db.query(`${SELECT_PAIEMENT} WHERE p.deleted_at IS NULL AND p.annee_scolaire = $1 ORDER BY p.date_paiement, p.id`, [annee]);
  const lignes = r.rows.map((p) => ({
    ...p,
    eleve: `${p.prenom} ${p.nom}`,
    objet: p.tarif_libelle || 'Frais de scolarité',
    mode_libelle: LIBELLES_MODE[p.mode],
  }));
  if (req.query.format === 'xlsx') {
    return envoyerFichier(res, await ecrireXlsx(`Paiements ${annee}`, COLONNES_EXPORT, lignes), `paiements-${annee}.xlsx`, MIME_XLSX);
  }
  envoyerFichier(
    res,
    ecrireCsv(COLONNES_EXPORT, lignes.map((l) => ({ ...l, montant: l.montant.toFixed(3).replace('.', ',') }))),
    `paiements-${annee}.csv`,
    MIME_CSV
  );
});

const schemaPaiement = {
  eleve_id: { type: 'int', required: true, label: 'Élève' },
  tarif_id: { type: 'int', label: 'Objet' },
  montant: { type: 'number', required: true, min: 0.001, max: 1000000, label: 'Montant' },
  date_paiement: { type: 'date', required: true, label: 'Date du paiement' },
  mode: { type: 'string', required: true, enum: ['especes', 'virement', 'mobile_money', 'cheque'], label: 'Mode de paiement' },
  reference: { type: 'string', label: 'Référence', maxLength: 80 },
  remarque: { type: 'string', label: 'Remarque', maxLength: 300 },
};

/** Génère le reçu PDF d'un paiement et le range dans le dossier de l'élève (table fichiers). */
async function genererRecu(client, paiementId, utilisateurId) {
  const p = (await client.query(`${SELECT_PAIEMENT} WHERE p.id = $1`, [paiementId])).rows[0];
  const situation = await situationEleve(client, p.eleve_id, p.annee_scolaire, { jusquAuPaiement: { date: p.date_paiement, id: p.id } });
  const buffer = await pdfRecu({
    paiement: p,
    eleve: { nom: p.nom, prenom: p.prenom, matricule: p.matricule },
    classe: p.classe,
    situation,
    enregistrePar: p.enregistre_par_nom,
  });
  if (p.recu_id) await client.query('UPDATE fichiers SET deleted_at = now() WHERE id = $1', [p.recu_id]);
  const f = await enregistrerContenu(client, buffer, `recu-${p.numero_recu}.pdf`, 'recu', p.id, utilisateurId);
  await client.query('UPDATE paiements SET recu_id = $1 WHERE id = $2', [f.id, p.id]);
  return { fichier: f, situation, paiement: p };
}

async function verifierPaiement(d) {
  const e = await db.un('SELECT id, statut FROM eleves WHERE id = $1 AND deleted_at IS NULL', [d.eleve_id]);
  if (!e) throw introuvable('Élève');
  if (e.statut === 'anonymise') throw new HttpError(400, 'Ce dossier est anonymisé.');
  if (d.tarif_id) {
    const t = await db.un('SELECT annee_scolaire FROM tarifs WHERE id = $1 AND deleted_at IS NULL', [d.tarif_id]);
    if (!t) throw introuvable('Tarif');
  }
}

paiements.post('/', autoriser(...ADMINISTRATION), async (req, res) => {
  const d = valider(req.body, schemaPaiement);
  await verifierPaiement(d);
  const annee = req.body.annee_scolaire && /^\d{4}-\d{4}$/.test(req.body.annee_scolaire) ? req.body.annee_scolaire : anneeCourante();
  const baseUrl = urlPublique(req);
  const devise = param('devise', 'DT');

  const resultat = await db.tx(req, async (c) => {
    const n = (await c.query("SELECT nextval('seq_recu') AS n")).rows[0].n;
    const numero = `R${annee.slice(0, 4)}-${String(n).padStart(5, '0')}`;
    const p = (
      await c.query(
        `INSERT INTO paiements (numero_recu, eleve_id, tarif_id, montant, date_paiement, mode, reference, remarque, annee_scolaire, enregistre_par)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [numero, d.eleve_id, d.tarif_id, d.montant, d.date_paiement, d.mode, d.reference, d.remarque, annee, req.user.id]
      )
    ).rows[0];

    // 1. Reçu PDF disponible dans le dossier de l'élève
    const { paiement } = await genererRecu(c, p.id, req.user.id);
    const situation = await situationEleve(c, d.eleve_id, annee);

    // 2. Message automatique au(x) parent(s) : montant, date, mode, nouveau solde, lien du reçu
    const parents = (await c.query('SELECT parent_id FROM parents_eleves WHERE eleve_id = $1', [d.eleve_id])).rows.map((x) => x.parent_id);
    const lienRecu = `/api/paiements/${p.id}/recu`;
    const corps =
      `Bonjour,\n\nNous confirmons la réception d'un paiement pour ${paiement.prenom} ${paiement.nom}${paiement.classe ? ` (${paiement.classe})` : ''} :\n\n` +
      `  • Montant payé : ${formatMontant(d.montant, devise)}\n` +
      `  • Date : ${formatDate(d.date_paiement)}\n` +
      `  • Mode de paiement : ${LIBELLES_MODE[d.mode]}${d.reference ? ` (réf. ${d.reference})` : ''}\n` +
      `  • Objet : ${paiement.tarif_libelle || 'Frais de scolarité'}\n` +
      `  • Nouveau solde restant (${annee}) : ${formatMontant(situation.solde, devise)}\n\n` +
      `Reçu N° ${numero} — téléchargement : ${baseUrl}${lienRecu}\n\nMerci.\n${nomComplet(req.user)} — Comptabilité`;
    const message = await envoyerMessageAuto(c, {
      expediteurId: req.user.id,
      destinataires: parents,
      objet: `Paiement reçu — ${paiement.prenom} ${paiement.nom} — Reçu ${numero}`,
      corps,
      eleveId: d.eleve_id,
      contexte: 'paiement',
      refType: 'paiement',
      refId: p.id,
      email: true,
      baseUrl,
    });
    return { paiement: { ...paiement, recu_id: undefined }, situation, message_id: message ? message.id : null, nb_parents_notifies: parents.length, lien_recu: lienRecu };
  });
  res.status(201).json(resultat);
});

paiements.put('/:id', autoriser(...ADMINISTRATION), async (req, res) => {
  const id = entierParam(req.params.id);
  const existant = await db.un('SELECT * FROM paiements WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!existant) throw introuvable('Paiement');
  const d = valider(req.body, schemaPaiement);
  if (d.eleve_id !== existant.eleve_id) throw new HttpError(400, "Un paiement ne peut pas être transféré à un autre élève : supprimez-le et créez-en un nouveau.");
  await verifierPaiement(d);
  const resultat = await db.tx(req, async (c) => {
    await c.query(
      `UPDATE paiements SET tarif_id=$1, montant=$2, date_paiement=$3, mode=$4, reference=$5, remarque=$6 WHERE id=$7`,
      [d.tarif_id, d.montant, d.date_paiement, d.mode, d.reference, d.remarque, id]
    );
    const { paiement } = await genererRecu(c, id, req.user.id); // reçu régénéré
    return { paiement, situation: await situationEleve(c, d.eleve_id, existant.annee_scolaire) };
  });
  res.json(resultat);
});

paiements.delete('/:id', autoriser(...ADMINISTRATION), async (req, res) => {
  const id = entierParam(req.params.id);
  const p = await db.un('SELECT * FROM paiements WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!p) throw introuvable('Paiement');
  await db.tx(req, (c) => c.query('UPDATE paiements SET deleted_at = now() WHERE id = $1', [id]));
  res.json({ ok: true, situation: await situationEleve(db, p.eleve_id, p.annee_scolaire) });
});

// Téléchargement du reçu (administration ou parent de l'élève)
paiements.get('/:id/recu', autoriser('admin', 'comptable', 'parent'), async (req, res) => {
  const id = entierParam(req.params.id);
  const p = await db.un('SELECT id, eleve_id, numero_recu, recu_id, deleted_at FROM paiements WHERE id = $1', [id]);
  if (!p || p.deleted_at) throw introuvable('Paiement');
  await verifierAccesEleve(db, req.user, p.eleve_id);
  let f = p.recu_id ? await db.un('SELECT * FROM fichiers WHERE id = $1 AND deleted_at IS NULL', [p.recu_id]) : null;
  if (!f || !fs.existsSync(cheminAbsolu(f))) {
    await db.tx(req, (c) => genererRecu(c, id, req.user.id));
    const maj = await db.un('SELECT recu_id FROM paiements WHERE id = $1', [id]);
    f = await db.un('SELECT * FROM fichiers WHERE id = $1', [maj.recu_id]);
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.telecharger === '1' ? 'attachment' : 'inline'}; filename="recu-${p.numero_recu}.pdf"`);
  res.sendFile(cheminAbsolu(f));
});

// ----- Situation, impayés, relances -----
const finances = express.Router();

finances.get('/situation/:eleveId', autoriser('admin', 'comptable', 'parent'), async (req, res) => {
  const eleveId = entierParam(req.params.eleveId);
  await verifierAccesEleve(db, req.user, eleveId);
  res.json(await situationEleve(db, eleveId, req.query.annee || anneeCourante()));
});

finances.get('/impayes', autoriser(...ADMINISTRATION), async (req, res) => {
  const lignes = await situationsAnnee(db, req.query.annee || anneeCourante(), { seulementImpayes: true });
  res.json(req.query.retard === '1' ? lignes.filter((l) => l.retard > 0) : lignes);
});

finances.get('/resume', autoriser(...ADMINISTRATION), async (req, res) => {
  const annee = req.query.annee || anneeCourante();
  const lignes = await situationsAnnee(db, annee);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const parMode = (
    await db.query(
      `SELECT mode, COUNT(*)::int AS nb, SUM(montant) AS total FROM paiements WHERE annee_scolaire = $1 AND deleted_at IS NULL GROUP BY mode`,
      [annee]
    )
  ).rows;
  const parMois = (
    await db.query(
      `SELECT to_char(date_trunc('month', date_paiement), 'YYYY-MM') AS mois, SUM(montant) AS total
         FROM paiements WHERE annee_scolaire = $1 AND deleted_at IS NULL GROUP BY 1 ORDER BY 1`,
      [annee]
    )
  ).rows;
  const totalDu = lignes.reduce((s, l) => s + l.total_du, 0);
  const totalPaye = lignes.reduce((s, l) => s + l.total_paye, 0);
  res.json({
    annee_scolaire: annee,
    nb_eleves: lignes.length,
    total_du: r3(totalDu),
    total_encaisse: r3(totalPaye),
    reste_a_recouvrer: r3(lignes.reduce((s, l) => s + Math.max(l.solde, 0), 0)),
    total_en_retard: r3(lignes.reduce((s, l) => s + l.retard, 0)),
    nb_en_retard: lignes.filter((l) => l.retard > 0).length,
    nb_soldes: lignes.filter((l) => l.solde <= 0).length,
    taux_recouvrement: totalDu > 0 ? Math.round((totalPaye / totalDu) * 1000) / 10 : 0,
    par_mode: parMode,
    par_mois: parMois,
  });
});

finances.post('/relances', autoriser(...ADMINISTRATION), async (req, res) => {
  const annee = anneeCourante();
  const nb = await db.tx(req, (c) =>
    envoyerRelances(c, { annee, expediteurId: req.user.id, automatique: false, intervalleJours: 1, baseUrl: urlPublique(req) })
  );
  res.json({ ok: true, relances_envoyees: nb });
});

finances.get('/relances', autoriser(...ADMINISTRATION), async (req, res) => {
  const r = await db.query(
    `SELECT r.*, e.nom, e.prenom, c.niveau || ' ' || c.section AS classe
       FROM relances r JOIN eleves e ON e.id = r.eleve_id
       LEFT JOIN inscriptions i ON i.eleve_id = r.eleve_id AND i.annee_scolaire = r.annee_scolaire
       LEFT JOIN classes c ON c.id = i.classe_id
      WHERE r.annee_scolaire = $1 ORDER BY r.created_at DESC LIMIT 200`,
    [req.query.annee || anneeCourante()]
  );
  res.json(r.rows);
});

module.exports = { tarifs, paiements, finances, genererRecu };
