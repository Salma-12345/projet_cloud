// Dossiers élèves : CRUD, affectation aux classes, photo, import/export CSV/Excel, RGPD.
const fs = require('fs');
const express = require('express');
const db = require('../db');
const { autoriser, ADMINISTRATION } = require('../middleware/auth');
const { valider, entierParam, HttpError, introuvable, confirmationRequise, interdit } = require('../utils');
const { anneeCourante, NIVEAUX } = require('../services/parametres');
const { verifierAccesEleve, classesEnseignant, journaliserAcces } = require('../services/acces');
const {
  affecterClasse,
  affecterAutomatiquement,
  genererMatricule,
  creerCompteEleve,
  niveauSelonAge,
} = require('../services/inscriptions');
const { televersement, enregistrerFichier, cheminAbsolu } = require('../services/fichiers');
const { lireTableur, ecrireCsv, ecrireXlsx, normaliserDate, envoyerFichier, MIME_XLSX, MIME_CSV } = require('../services/tableur');
const { creerCompte } = require('./utilisateurs');

const router = express.Router();

const schemaEleve = {
  nom: { type: 'string', required: true, label: 'Nom', maxLength: 80 },
  prenom: { type: 'string', required: true, label: 'Prénom', maxLength: 80 },
  date_naissance: { type: 'date', required: true, label: 'Date de naissance' },
  lieu_naissance: { type: 'string', label: 'Lieu de naissance', maxLength: 80 },
  sexe: { type: 'string', required: true, enum: ['F', 'M'], label: 'Sexe' },
  adresse: { type: 'string', label: 'Adresse', maxLength: 200 },
  antecedents_medicaux: { type: 'string', label: 'Antécédents médicaux', maxLength: 1000 },
  annee_entree: { type: 'string', label: 'Année d’entrée', maxLength: 9 },
};

const SELECT_LISTE = `
  SELECT e.id, e.matricule, e.nom, e.prenom, e.date_naissance, e.sexe, e.photo_id, e.statut, e.utilisateur_id,
         e.annee_entree, i.classe_id, c.niveau || ' ' || c.section AS classe, c.niveau,
         COALESCE((SELECT json_agg(json_build_object('id', u.id, 'nom', u.prenom || ' ' || u.nom, 'lien', pe.lien,
                                                      'telephone', u.telephone, 'email', u.email) ORDER BY pe.lien)
                     FROM parents_eleves pe JOIN utilisateurs u ON u.id = pe.parent_id AND u.deleted_at IS NULL
                    WHERE pe.eleve_id = e.id), '[]') AS parents
    FROM eleves e
    LEFT JOIN inscriptions i ON i.eleve_id = e.id AND i.annee_scolaire = $1
    LEFT JOIN classes c ON c.id = i.classe_id`;

router.get('/', autoriser('admin', 'comptable', 'enseignant'), async (req, res) => {
  const annee = req.query.annee || anneeCourante();
  const conditions = ['e.deleted_at IS NULL'];
  const params = [annee];
  if (req.query.classe_id) {
    params.push(entierParam(req.query.classe_id, 'classe'));
    conditions.push(`i.classe_id = $${params.length}`);
  }
  if (req.query.sans_classe === '1') conditions.push('i.classe_id IS NULL');
  if (req.query.q) {
    params.push(`%${String(req.query.q).toLowerCase()}%`);
    conditions.push(`lower(e.nom || ' ' || e.prenom || ' ' || e.matricule) LIKE $${params.length}`);
  }
  const statut = req.query.statut || 'actif';
  if (statut !== 'tous') {
    params.push(statut);
    conditions.push(`e.statut = $${params.length}`);
  }
  if (req.user.role === 'enseignant') {
    const classes = await classesEnseignant(db, req.user.id, annee);
    params.push(classes);
    conditions.push(`i.classe_id = ANY($${params.length})`);
  }
  const r = await db.query(`${SELECT_LISTE} WHERE ${conditions.join(' AND ')} ORDER BY array_position(ARRAY['CP','CE1','CE2','CM1','CM2'], c.niveau) NULLS LAST, c.section, e.nom, e.prenom`, params);
  res.json(r.rows);
});

// ----- Export / import (avant /:id) -----
const COLONNES_EXPORT = [
  { cle: 'matricule', titre: 'matricule', largeur: 14 },
  { cle: 'nom', titre: 'nom', largeur: 16 },
  { cle: 'prenom', titre: 'prenom', largeur: 16 },
  { cle: 'date_naissance', titre: 'date_naissance', largeur: 14 },
  { cle: 'sexe', titre: 'sexe', largeur: 6 },
  { cle: 'lieu_naissance', titre: 'lieu_naissance', largeur: 16 },
  { cle: 'classe', titre: 'classe', largeur: 10 },
  { cle: 'adresse', titre: 'adresse', largeur: 28 },
  { cle: 'antecedents_medicaux', titre: 'antecedents_medicaux', largeur: 28 },
  { cle: 'parent_nom', titre: 'parent_nom', largeur: 16 },
  { cle: 'parent_prenom', titre: 'parent_prenom', largeur: 16 },
  { cle: 'parent_lien', titre: 'parent_lien', largeur: 12 },
  { cle: 'parent_email', titre: 'parent_email', largeur: 28 },
  { cle: 'parent_telephone', titre: 'parent_telephone', largeur: 16 },
];

router.get('/export', autoriser(...ADMINISTRATION), async (req, res) => {
  const annee = req.query.annee || anneeCourante();
  const r = await db.query(
    `SELECT e.matricule, e.nom, e.prenom, e.date_naissance, e.sexe, e.lieu_naissance, e.adresse, e.antecedents_medicaux,
            c.niveau || ' ' || c.section AS classe,
            p.nom AS parent_nom, p.prenom AS parent_prenom, p.lien AS parent_lien, p.email AS parent_email, p.telephone AS parent_telephone
       FROM eleves e
       LEFT JOIN inscriptions i ON i.eleve_id = e.id AND i.annee_scolaire = $1
       LEFT JOIN classes c ON c.id = i.classe_id
       LEFT JOIN LATERAL (
         SELECT u.nom, u.prenom, u.email, u.telephone, pe.lien FROM parents_eleves pe
           JOIN utilisateurs u ON u.id = pe.parent_id AND u.deleted_at IS NULL
          WHERE pe.eleve_id = e.id ORDER BY pe.lien LIMIT 1) p ON TRUE
      WHERE e.deleted_at IS NULL AND e.statut = 'actif'
        AND ($2::int IS NULL OR i.classe_id = $2)
      ORDER BY array_position(ARRAY['CP','CE1','CE2','CM1','CM2'], c.niveau) NULLS LAST, c.section, e.nom`,
    [annee, req.query.classe_id ? entierParam(req.query.classe_id) : null]
  );
  const date = new Date().toISOString().slice(0, 10);
  if (req.query.format === 'xlsx') {
    return envoyerFichier(res, await ecrireXlsx('Élèves', COLONNES_EXPORT, r.rows), `eleves-${date}.xlsx`, MIME_XLSX);
  }
  envoyerFichier(res, ecrireCsv(COLONNES_EXPORT, r.rows), `eleves-${date}.csv`, MIME_CSV);
});

router.get('/modele-import', autoriser(...ADMINISTRATION), async (req, res) => {
  const exemple = [
    {
      matricule: '',
      nom: 'Ben Youssef',
      prenom: 'Lina',
      date_naissance: '2019-03-14',
      sexe: 'F',
      lieu_naissance: 'Sousse',
      classe: 'CE1 A',
      adresse: '12 rue de la Liberté, Sousse',
      antecedents_medicaux: 'Allergie aux arachides',
      parent_nom: 'Ben Youssef',
      parent_prenom: 'Karima',
      parent_lien: 'Mère',
      parent_email: 'karima.benyoussef@exemple.tn',
      parent_telephone: '+216 20 000 000',
    },
  ];
  if (req.query.format === 'csv') return envoyerFichier(res, ecrireCsv(COLONNES_EXPORT, exemple), 'modele-import-eleves.csv', MIME_CSV);
  envoyerFichier(res, await ecrireXlsx('Élèves', COLONNES_EXPORT, exemple), 'modele-import-eleves.xlsx', MIME_XLSX);
});

router.post('/import', autoriser(...ADMINISTRATION), televersement({ maxFichiers: 1 }).single('fichier'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Aucun fichier reçu.');
  const lignes = await lireTableur(req.file.buffer, req.file.originalname);
  const annee = anneeCourante();
  const classes = (await db.query('SELECT id, niveau, section FROM classes WHERE deleted_at IS NULL AND annee_scolaire = $1', [annee])).rows;
  const parNom = new Map(classes.map((c) => [`${c.niveau} ${c.section}`.toUpperCase().replace(/\s+/g, ' '), c.id]));
  const rapport = { crees: 0, erreurs: [], identifiants: [] };

  for (const l of lignes) {
    try {
      const nom = (l.nom || '').trim();
      const prenom = (l.prenom || '').trim();
      const dateNaissance = normaliserDate(l.date_naissance);
      if (!nom || !prenom) throw new Error('nom et prénom obligatoires');
      if (!dateNaissance) throw new Error('date de naissance invalide (format AAAA-MM-JJ ou JJ/MM/AAAA)');
      const sexe = String(l.sexe || '').trim().toUpperCase().startsWith('F') ? 'F' : String(l.sexe || '').trim() ? 'M' : null;
      let classeId = null;
      if (l.classe) {
        classeId = parNom.get(String(l.classe).toUpperCase().trim().replace(/\s+/g, ' '));
        if (!classeId) throw new Error(`classe « ${l.classe} » inconnue pour ${annee}`);
      }
      const resultat = await db.tx(req, async (c) => {
        let matricule = (l.matricule || '').trim();
        if (matricule) {
          const existe = await c.query('SELECT 1 FROM eleves WHERE matricule = $1 AND deleted_at IS NULL', [matricule]);
          if (existe.rowCount) throw new Error(`le matricule ${matricule} existe déjà`);
        } else matricule = await genererMatricule(c, annee);
        const e = (
          await c.query(
            `INSERT INTO eleves (matricule, nom, prenom, date_naissance, sexe, lieu_naissance, adresse, antecedents_medicaux, annee_entree, consentement_rgpd_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now()) RETURNING id`,
            [matricule, nom, prenom, dateNaissance, sexe, l.lieu_naissance || null, l.adresse || null, l.antecedents_medicaux || null, annee]
          )
        ).rows[0];
        if (classeId) await affecterClasse(c, e.id, classeId, 'import');
        const ids = [];
        const email = String(l.parent_email || '').trim().toLowerCase();
        if (email) {
          const p = (await c.query('SELECT id, role FROM utilisateurs WHERE lower(email) = $1 AND deleted_at IS NULL', [email])).rows[0];
          let parentId;
          if (p) {
            if (p.role !== 'parent') throw new Error(`l'e-mail ${email} appartient à un compte non parent`);
            parentId = p.id;
          } else {
            if (!l.parent_nom) throw new Error('nom du parent obligatoire pour créer son compte');
            const cree = await creerCompte(c, req, {
              role: 'parent',
              email,
              nom: l.parent_nom,
              prenom: l.parent_prenom || '',
              telephone: l.parent_telephone || null,
              adresse: l.adresse || null,
            });
            parentId = cree.utilisateur.id;
            ids.push({ role: 'parent', nom: `${l.parent_prenom || ''} ${l.parent_nom}`.trim(), ...cree.identifiants });
          }
          const lien = ['Père', 'Mère', 'Tuteur', 'Tutrice'].includes(l.parent_lien) ? l.parent_lien : 'Parent';
          await c.query('INSERT INTO parents_eleves (parent_id, eleve_id, lien) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [parentId, e.id, lien]);
        }
        return ids;
      });
      rapport.crees += 1;
      rapport.identifiants.push(...resultat);
    } catch (e) {
      rapport.erreurs.push({ ligne: l._ligne, message: e instanceof HttpError ? e.message : e.message });
    }
  }
  res.json(rapport);
});

// ----- Dossier élève -----
router.get('/:id', async (req, res) => {
  const id = entierParam(req.params.id);
  await verifierAccesEleve(db, req.user, id);
  const e = await db.un(
    `SELECT e.*, u.email AS compte_email, u.actif AS compte_actif
       FROM eleves e LEFT JOIN utilisateurs u ON u.id = e.utilisateur_id AND u.deleted_at IS NULL
      WHERE e.id = $1 AND e.deleted_at IS NULL`,
    [id]
  );
  if (!e) throw introuvable('Élève');
  e.parents = (
    await db.query(
      `SELECT u.id, u.nom, u.prenom, u.email, u.telephone, u.adresse, pe.lien
         FROM parents_eleves pe JOIN utilisateurs u ON u.id = pe.parent_id AND u.deleted_at IS NULL
        WHERE pe.eleve_id = $1 ORDER BY pe.lien`,
      [id]
    )
  ).rows;
  e.inscriptions = (
    await db.query(
      `SELECT i.id, i.annee_scolaire, i.mode_affectation, i.date_affectation, c.id AS classe_id, c.niveau, c.section,
              c.niveau || ' ' || c.section AS classe, t.prenom || ' ' || t.nom AS titulaire
         FROM inscriptions i JOIN classes c ON c.id = i.classe_id LEFT JOIN utilisateurs t ON t.id = c.titulaire_id
        WHERE i.eleve_id = $1 ORDER BY i.annee_scolaire DESC`,
      [id]
    )
  ).rows;
  const courante = e.inscriptions.find((i) => i.annee_scolaire === anneeCourante());
  e.classe = courante || null;
  e.niveau_theorique = niveauSelonAge(e.date_naissance);
  if (!['admin', 'comptable'].includes(req.user.role)) delete e.compte_email;
  await journaliserAcces(db, req, 'dossier_eleve', id, `${e.prenom} ${e.nom}`);
  res.json(e);
});

router.post('/', autoriser(...ADMINISTRATION), async (req, res) => {
  const d = valider(req.body, {
    ...schemaEleve,
    classe_id: { type: 'int', label: 'Classe' },
    affectation_auto: { type: 'bool' },
    niveau: { type: 'string', enum: NIVEAUX, label: 'Niveau' },
    creer_compte_eleve: { type: 'bool' },
    consentement: { type: 'bool' },
  });
  const parents = Array.isArray(req.body.parents) ? req.body.parents : [];
  const annee = anneeCourante();
  const resultat = await db.tx(req, async (c) => {
    const matricule = await genererMatricule(c, annee);
    const eleve = (
      await c.query(
        `INSERT INTO eleves (matricule, nom, prenom, date_naissance, lieu_naissance, sexe, adresse, antecedents_medicaux, annee_entree, consentement_rgpd_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          matricule,
          d.nom,
          d.prenom,
          d.date_naissance,
          d.lieu_naissance,
          d.sexe,
          d.adresse,
          d.antecedents_medicaux,
          d.annee_entree || annee,
          d.consentement ? new Date() : null,
        ]
      )
    ).rows[0];
    let classe = null;
    if (d.classe_id) classe = await affecterClasse(c, eleve.id, d.classe_id, 'manuelle');
    else if (d.affectation_auto) classe = await affecterAutomatiquement(c, eleve.id, { niveau: d.niveau, dateNaissance: d.date_naissance });

    const identifiants = [];
    for (const p of parents) {
      const lien = ['Père', 'Mère', 'Tuteur', 'Tutrice'].includes(p.lien) ? p.lien : 'Parent';
      let parentId = p.parent_id ? Number(p.parent_id) : null;
      if (!parentId) {
        const pd = valider(p, {
          nom: { type: 'string', required: true, label: 'Nom du parent' },
          prenom: { type: 'string', required: true, label: 'Prénom du parent' },
          email: { type: 'email', required: true, label: 'E-mail du parent' },
          telephone: { type: 'string', label: 'Téléphone du parent' },
        });
        const existant = (await c.query('SELECT id, role FROM utilisateurs WHERE lower(email) = $1 AND deleted_at IS NULL', [pd.email])).rows[0];
        if (existant && existant.role !== 'parent') throw new HttpError(409, `L'adresse ${pd.email} est déjà utilisée par un compte non parent.`);
        if (existant) parentId = existant.id;
        else {
          const cree = await creerCompte(c, req, { ...pd, role: 'parent', adresse: d.adresse });
          parentId = cree.utilisateur.id;
          identifiants.push({ role: 'parent', nom: `${pd.prenom} ${pd.nom}`, ...cree.identifiants });
        }
      } else {
        const ok = await c.query("SELECT 1 FROM utilisateurs WHERE id = $1 AND role = 'parent' AND deleted_at IS NULL", [parentId]);
        if (!ok.rowCount) throw new HttpError(404, 'Parent introuvable.');
      }
      await c.query('INSERT INTO parents_eleves (parent_id, eleve_id, lien) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [parentId, eleve.id, lien]);
    }
    if (d.creer_compte_eleve) identifiants.push(await creerCompteEleve(c, eleve));
    return { eleve, classe, identifiants };
  });
  res.status(201).json(resultat);
});

router.put('/:id', autoriser(...ADMINISTRATION), async (req, res) => {
  const id = entierParam(req.params.id);
  const d = valider(req.body, { ...schemaEleve, statut: { type: 'string', enum: ['actif', 'sorti'], defaut: 'actif', label: 'Statut' } });
  const e = await db.un("SELECT id, statut FROM eleves WHERE id = $1 AND deleted_at IS NULL", [id]);
  if (!e) throw introuvable('Élève');
  if (e.statut === 'anonymise') throw new HttpError(400, 'Ce dossier a été anonymisé (RGPD) et ne peut plus être modifié.');
  const r = await db.tx(req, (c) =>
    c.query(
      `UPDATE eleves SET nom=$1, prenom=$2, date_naissance=$3, lieu_naissance=$4, sexe=$5, adresse=$6,
              antecedents_medicaux=$7, annee_entree=COALESCE($8, annee_entree), statut=$9
        WHERE id = $10 RETURNING *`,
      [d.nom, d.prenom, d.date_naissance, d.lieu_naissance, d.sexe, d.adresse, d.antecedents_medicaux, d.annee_entree, d.statut, id]
    )
  );
  res.json(r.rows[0]);
});

router.delete('/:id', autoriser(...ADMINISTRATION), async (req, res) => {
  const id = entierParam(req.params.id);
  const force = req.query.force === '1' || req.query.force === 'true';
  const e = await db.un('SELECT id, nom, prenom, utilisateur_id FROM eleves WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!e) throw introuvable('Élève');
  const ref = await db.un(
    `SELECT (SELECT COUNT(*)::int FROM notes WHERE eleve_id = $1 AND deleted_at IS NULL) AS notes,
            (SELECT COUNT(*)::int FROM paiements WHERE eleve_id = $1 AND deleted_at IS NULL) AS paiements,
            (SELECT c.niveau || ' ' || c.section FROM inscriptions i JOIN classes c ON c.id = i.classe_id
              WHERE i.eleve_id = $1 AND i.annee_scolaire = $2) AS classe`,
    [id, anneeCourante()]
  );
  if ((ref.notes || ref.paiements || ref.classe) && !force) {
    throw confirmationRequise(
      `Le dossier de ${e.prenom} ${e.nom} contient des données liées` +
        `${ref.classe ? ` (inscrit(e) en ${ref.classe})` : ''} : ${ref.notes} note(s) et ${ref.paiements} paiement(s). ` +
        `Le dossier sera archivé (suppression logique) et l'historique conservé.`,
      ref
    );
  }
  await db.tx(req, async (c) => {
    await c.query('DELETE FROM inscriptions WHERE eleve_id = $1 AND annee_scolaire = $2', [id, anneeCourante()]);
    await c.query('UPDATE eleves SET deleted_at = now() WHERE id = $1', [id]);
    if (e.utilisateur_id) await c.query('UPDATE utilisateurs SET actif = FALSE, deleted_at = now() WHERE id = $1', [e.utilisateur_id]);
  });
  res.json({ ok: true });
});

// Affectation à une classe (année courante) : manuelle ou automatique
router.put('/:id/classe', autoriser(...ADMINISTRATION), async (req, res) => {
  const id = entierParam(req.params.id);
  const d = valider(req.body, { classe_id: { type: 'int', label: 'Classe' }, auto: { type: 'bool' }, niveau: { type: 'string', enum: NIVEAUX } });
  const e = await db.un('SELECT id, date_naissance FROM eleves WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!e) throw introuvable('Élève');
  const annee = anneeCourante();
  const classe = await db.tx(req, async (c) => {
    if (d.auto) return affecterAutomatiquement(c, id, { niveau: d.niveau, dateNaissance: e.date_naissance });
    if (d.classe_id) {
      const cl = (await c.query('SELECT annee_scolaire FROM classes WHERE id = $1 AND deleted_at IS NULL', [d.classe_id])).rows[0];
      if (!cl) throw introuvable('Classe');
      if (cl.annee_scolaire !== annee) throw new HttpError(400, `Choisissez une classe de l'année ${annee}.`);
      return affecterClasse(c, id, d.classe_id, 'manuelle');
    }
    await c.query('DELETE FROM inscriptions WHERE eleve_id = $1 AND annee_scolaire = $2', [id, annee]);
    return null;
  });
  res.json({ ok: true, classe });
});

// Photo
router.post('/:id/photo', autoriser(...ADMINISTRATION), televersement({ maxFichiers: 1, imagesSeulement: true }).single('photo'), async (req, res) => {
  const id = entierParam(req.params.id);
  if (!req.file) throw new HttpError(400, 'Aucune image reçue.');
  const e = await db.un('SELECT id, photo_id FROM eleves WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!e) throw introuvable('Élève');
  const f = await db.tx(req, async (c) => {
    const fichier = await enregistrerFichier(c, req.file, 'photo_eleve', id, req.user.id);
    if (e.photo_id) await c.query('UPDATE fichiers SET deleted_at = now() WHERE id = $1', [e.photo_id]);
    await c.query('UPDATE eleves SET photo_id = $1 WHERE id = $2', [fichier.id, id]);
    return fichier;
  });
  res.json({ photo_id: f.id });
});

router.delete('/:id/photo', autoriser(...ADMINISTRATION), async (req, res) => {
  const id = entierParam(req.params.id);
  await db.tx(req, async (c) => {
    const e = (await c.query('SELECT photo_id FROM eleves WHERE id = $1', [id])).rows[0];
    if (e && e.photo_id) {
      await c.query('UPDATE fichiers SET deleted_at = now() WHERE id = $1', [e.photo_id]);
      await c.query('UPDATE eleves SET photo_id = NULL WHERE id = $1', [id]);
    }
  });
  res.json({ ok: true });
});

// Compte de connexion de l'élève
router.post('/:id/compte', autoriser(...ADMINISTRATION), async (req, res) => {
  const id = entierParam(req.params.id);
  const e = await db.un('SELECT id, nom, prenom, utilisateur_id FROM eleves WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!e) throw introuvable('Élève');
  if (e.utilisateur_id) {
    const u = await db.un('SELECT id FROM utilisateurs WHERE id = $1 AND deleted_at IS NULL', [e.utilisateur_id]);
    if (u) throw new HttpError(409, 'Cet élève possède déjà un compte. Utilisez « Réinitialiser le mot de passe ».');
  }
  const identifiants = await db.tx(req, (c) => creerCompteEleve(c, e));
  res.status(201).json({ identifiants });
});

// RGPD : portabilité (export JSON)
router.get('/:id/rgpd', autoriser('admin', 'parent'), async (req, res) => {
  const id = entierParam(req.params.id);
  await verifierAccesEleve(db, req.user, id);
  const eleve = await db.un(
    `SELECT matricule, nom, prenom, date_naissance, lieu_naissance, sexe, adresse, antecedents_medicaux, annee_entree, statut,
            consentement_rgpd_at, created_at FROM eleves WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  if (!eleve) throw introuvable('Élève');
  const q = async (sql) => (await db.query(sql, [id])).rows;
  const donnees = {
    export_genere_le: new Date().toISOString(),
    eleve,
    responsables_legaux: await q(
      `SELECT u.nom, u.prenom, u.email, u.telephone, pe.lien FROM parents_eleves pe JOIN utilisateurs u ON u.id = pe.parent_id WHERE pe.eleve_id = $1`
    ),
    inscriptions: await q(
      `SELECT i.annee_scolaire, c.niveau || ' ' || c.section AS classe, i.date_affectation FROM inscriptions i JOIN classes c ON c.id = i.classe_id WHERE i.eleve_id = $1 ORDER BY i.annee_scolaire`
    ),
    notes: await q(
      `SELECT ev.annee_scolaire, ev.trimestre, m.nom AS matiere, ev.titre, ev.date_evaluation, n.valeur, ev.bareme, n.commentaire
         FROM notes n JOIN evaluations ev ON ev.id = n.evaluation_id JOIN matieres m ON m.id = ev.matiere_id
        WHERE n.eleve_id = $1 AND n.deleted_at IS NULL ORDER BY ev.date_evaluation`
    ),
    absences: await q(
      `SELECT date_absence, periode, statut, motif, justification FROM absences WHERE eleve_id = $1 AND deleted_at IS NULL ORDER BY date_absence`
    ),
    paiements: await q(
      `SELECT numero_recu, annee_scolaire, montant, date_paiement, mode, reference FROM paiements WHERE eleve_id = $1 AND deleted_at IS NULL ORDER BY date_paiement`
    ),
    devoirs_rendus: await q(
      `SELECT d.titre, s.depose_at, s.note, d.bareme, s.commentaire_enseignant FROM soumissions s JOIN devoirs d ON d.id = s.devoir_id WHERE s.eleve_id = $1 ORDER BY s.depose_at`
    ),
  };
  await journaliserAcces(db, req, 'export_rgpd', id, `${eleve.prenom} ${eleve.nom}`);
  res.setHeader('Content-Disposition', `attachment; filename="donnees-${eleve.matricule}.json"`);
  res.json(donnees);
});

// RGPD : droit à l'effacement (anonymisation, l'historique comptable et scolaire est conservé sans données personnelles)
router.post('/:id/anonymiser', autoriser('admin'), async (req, res) => {
  const id = entierParam(req.params.id);
  const e = await db.un('SELECT id, photo_id, utilisateur_id, statut, date_naissance FROM eleves WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!e) throw introuvable('Élève');
  if (e.statut === 'anonymise') throw new HttpError(400, 'Ce dossier est déjà anonymisé.');
  await db.tx(req, async (c) => {
    if (e.photo_id) {
      const f = (await c.query('SELECT chemin FROM fichiers WHERE id = $1', [e.photo_id])).rows[0];
      await c.query('UPDATE fichiers SET deleted_at = now() WHERE id = $1', [e.photo_id]);
      c.apresCommit.push(() => fs.promises.unlink(cheminAbsolu(f)).catch(() => {}));
    }
    await c.query(
      `UPDATE eleves SET nom = 'Anonyme', prenom = 'Élève ' || matricule, lieu_naissance = NULL, adresse = NULL,
              antecedents_medicaux = NULL, photo_id = NULL, sexe = NULL, statut = 'anonymise',
              date_naissance = make_date(EXTRACT(YEAR FROM date_naissance)::int, 1, 1)
        WHERE id = $1`,
      [id]
    );
    await c.query('DELETE FROM parents_eleves WHERE eleve_id = $1', [id]);
    await c.query('DELETE FROM inscriptions WHERE eleve_id = $1 AND annee_scolaire = $2', [id, anneeCourante()]);
    if (e.utilisateur_id) {
      await c.query(
        `UPDATE utilisateurs SET nom = 'Anonyme', prenom = 'Élève', email = 'anonyme-' || id || '@invalid', telephone = NULL,
                adresse = NULL, actif = FALSE, deleted_at = now() WHERE id = $1`,
        [e.utilisateur_id]
      );
    }
  });
  res.json({ ok: true });
});

module.exports = router;
