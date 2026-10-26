// Validation des pré-inscriptions en ligne par l'administration.
const express = require('express');
const db = require('../db');
const { autoriser, ADMINISTRATION } = require('../middleware/auth');
const { valider, entierParam, HttpError, introuvable } = require('../utils');
const { niveauSelonAge, affecterClasse, affecterAutomatiquement, genererMatricule, creerCompteEleve } = require('../services/inscriptions');
const { anneeCourante } = require('../services/parametres');
const { creerCompte } = require('./utilisateurs');

const router = express.Router();
router.use(autoriser(...ADMINISTRATION));

router.get('/', async (req, res) => {
  const statut = req.query.statut || 'en_attente';
  const r = await db.query(
    `SELECT p.*, u.prenom || ' ' || u.nom AS traite_par_nom,
            (SELECT id FROM utilisateurs x WHERE lower(x.email) = lower(p.email) AND x.deleted_at IS NULL AND x.role = 'parent') AS parent_existant_id
       FROM preinscriptions p LEFT JOIN utilisateurs u ON u.id = p.traite_par
      WHERE p.deleted_at IS NULL AND ($1 = 'toutes' OR p.statut = $1)
      ORDER BY p.created_at DESC`,
    [statut]
  );
  res.json(r.rows.map((p) => ({ ...p, niveau_theorique: niveauSelonAge(p.date_naissance, p.annee_scolaire) })));
});

router.post('/:id/valider', async (req, res) => {
  const id = entierParam(req.params.id);
  const d = valider(req.body, {
    classe_id: { type: 'int', label: 'Classe' },
    niveau: { type: 'string', label: 'Niveau' },
    creer_compte_eleve: { type: 'bool', defaut: false },
  });
  const p = await db.un('SELECT * FROM preinscriptions WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!p) throw introuvable('Pré-inscription');
  if (p.statut !== 'en_attente') throw new HttpError(400, 'Cette demande a déjà été traitée.');
  const annee = anneeCourante();

  const resultat = await db.tx(req, async (c) => {
    const matricule = await genererMatricule(c, annee);
    const eleve = (
      await c.query(
        `INSERT INTO eleves (matricule, nom, prenom, date_naissance, lieu_naissance, sexe, adresse, antecedents_medicaux, annee_entree, consentement_rgpd_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [matricule, p.enfant_nom, p.enfant_prenom, p.date_naissance, p.lieu_naissance, p.sexe, p.adresse, p.antecedents_medicaux, annee, p.consentement_at]
      )
    ).rows[0];
    const classe = d.classe_id
      ? await affecterClasse(c, eleve.id, d.classe_id, 'manuelle')
      : await affecterAutomatiquement(c, eleve.id, { niveau: d.niveau || p.niveau_souhaite, dateNaissance: p.date_naissance });

    const identifiants = [];
    const existant = (await c.query('SELECT id, role FROM utilisateurs WHERE lower(email) = lower($1) AND deleted_at IS NULL', [p.email])).rows[0];
    let parentId;
    if (existant) {
      if (existant.role !== 'parent') throw new HttpError(409, `L'adresse ${p.email} est déjà utilisée par un compte non parent.`);
      parentId = existant.id;
    } else {
      const cree = await creerCompte(c, req, {
        role: 'parent',
        nom: p.parent_nom,
        prenom: p.parent_prenom,
        email: p.email,
        telephone: p.telephone,
        adresse: p.adresse,
      });
      parentId = cree.utilisateur.id;
      identifiants.push({ role: 'parent', nom: `${p.parent_prenom} ${p.parent_nom}`, ...cree.identifiants });
    }
    await c.query('INSERT INTO parents_eleves (parent_id, eleve_id, lien) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [parentId, eleve.id, p.lien]);
    if (d.creer_compte_eleve) identifiants.push(await creerCompteEleve(c, eleve));
    await c.query(
      `UPDATE preinscriptions SET statut = 'validee', eleve_id = $1, traite_par = $2, traite_at = now() WHERE id = $3`,
      [eleve.id, req.user.id, id]
    );
    return { eleve, classe: { id: classe.id, nom: `${classe.niveau} ${classe.section}` }, identifiants, parent_existant: Boolean(existant) };
  });
  res.json(resultat);
});

router.post('/:id/refuser', async (req, res) => {
  const id = entierParam(req.params.id);
  const d = valider(req.body, { motif: { type: 'string', label: 'Motif', maxLength: 500 } });
  const p = await db.un('SELECT statut FROM preinscriptions WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!p) throw introuvable('Pré-inscription');
  if (p.statut !== 'en_attente') throw new HttpError(400, 'Cette demande a déjà été traitée.');
  await db.tx(req, (c) =>
    c.query(`UPDATE preinscriptions SET statut = 'refusee', motif_refus = $1, traite_par = $2, traite_at = now() WHERE id = $3`, [
      d.motif,
      req.user.id,
      id,
    ])
  );
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  const id = entierParam(req.params.id);
  await db.tx(req, (c) => c.query('UPDATE preinscriptions SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [id]));
  res.json({ ok: true });
});

module.exports = router;
