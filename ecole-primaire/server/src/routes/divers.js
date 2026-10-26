// Notifications (in-app + abonnement push), fichiers protégés, journaux, paramètres.
const fs = require('fs');
const express = require('express');
const db = require('../db');
const { autoriser } = require('../middleware/auth');
const { valider, entierParam, HttpError, introuvable, interdit, anneeSuivante } = require('../utils');
const { param, chargerParametres, anneeCourante, parametresPublics } = require('../services/parametres');
const { peutVoirEleve, classeDeLEleve, enseigneDans, eleveDuCompte, enfantsParent } = require('../services/acces');
const { cheminAbsolu } = require('../services/fichiers');

// ----- Notifications -----
const notifications = express.Router();

notifications.get('/', async (req, res) => {
  const r = await db.query(
    `SELECT id, type, titre, contenu, lien, lu_at, created_at FROM notifications
      WHERE utilisateur_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [req.user.id, Math.min(Number(req.query.limite) || 50, 200)]
  );
  res.json(r.rows);
});

notifications.get('/compteur', async (req, res) => {
  const r = await db.un(
    `SELECT (SELECT COUNT(*)::int FROM notifications WHERE utilisateur_id = $1 AND lu_at IS NULL) AS notifications,
            (SELECT COUNT(*)::int FROM messages_destinataires md JOIN messages m ON m.id = md.message_id
              WHERE md.destinataire_id = $1 AND md.lu_at IS NULL AND md.masque_at IS NULL AND m.statut = 'envoye') AS messages`,
    [req.user.id]
  );
  res.json(r);
});

notifications.post('/tout-lu', async (req, res) => {
  await db.query('UPDATE notifications SET lu_at = now() WHERE utilisateur_id = $1 AND lu_at IS NULL', [req.user.id]);
  res.json({ ok: true });
});

notifications.post('/:id/lu', async (req, res) => {
  await db.query('UPDATE notifications SET lu_at = now() WHERE id = $1 AND utilisateur_id = $2 AND lu_at IS NULL', [
    entierParam(req.params.id),
    req.user.id,
  ]);
  res.json({ ok: true });
});

// ----- Push (PWA) -----
const push = express.Router();

push.get('/cle', (req, res) => res.json({ cle: param('vapid_public') }));

push.post('/abonnement', async (req, res) => {
  const s = req.body || {};
  if (!s.endpoint || !s.keys || !s.keys.p256dh || !s.keys.auth) throw new HttpError(400, 'Abonnement push invalide.');
  if (!/^https:\/\//.test(s.endpoint)) throw new HttpError(400, 'Adresse de notification invalide.');
  await db.query(
    `INSERT INTO abonnements_push (utilisateur_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4)
     ON CONFLICT (endpoint) DO UPDATE SET utilisateur_id = EXCLUDED.utilisateur_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [req.user.id, s.endpoint, s.keys.p256dh, s.keys.auth]
  );
  res.status(201).json({ ok: true });
});

push.delete('/abonnement', async (req, res) => {
  const endpoint = (req.body && req.body.endpoint) || null;
  if (endpoint) await db.query('DELETE FROM abonnements_push WHERE endpoint = $1 AND utilisateur_id = $2', [endpoint, req.user.id]);
  else await db.query('DELETE FROM abonnements_push WHERE utilisateur_id = $1', [req.user.id]);
  res.json({ ok: true });
});

push.get('/etat', async (req, res) => {
  const r = await db.un('SELECT COUNT(*)::int AS n FROM abonnements_push WHERE utilisateur_id = $1', [req.user.id]);
  res.json({ abonnements: r.n });
});

// ----- Fichiers protégés (contrôle d'accès selon la catégorie) -----
const fichiers = express.Router();

async function accesDevoir(user, devoirId, correction = false) {
  const d = await db.un('SELECT classe_id, matiere_id, enseignant_id, date_remise, annee_scolaire FROM devoirs WHERE id = $1', [devoirId]);
  if (!d) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'enseignant') return d.enseignant_id === user.id || enseigneDans(db, user.id, d.classe_id, d.matiere_id);
  if (correction && new Date(d.date_remise) > new Date()) return false;
  const eleves = user.role === 'eleve' ? [await eleveDuCompte(db, user.id)] : user.role === 'parent' ? await enfantsParent(db, user.id) : [];
  for (const e of eleves) if (e && (await classeDeLEleve(db, e, d.annee_scolaire)) === d.classe_id) return true;
  return false;
}

async function peutAccederFichier(user, f) {
  switch (f.categorie) {
    case 'photo_eleve':
      return peutVoirEleve(db, user, f.ref_id);
    case 'recu': {
      if (!['admin', 'comptable', 'parent'].includes(user.role)) return false;
      const p = await db.un('SELECT eleve_id FROM paiements WHERE id = $1', [f.ref_id]);
      return Boolean(p) && peutVoirEleve(db, user, p.eleve_id);
    }
    case 'devoir_enonce':
      return accesDevoir(user, f.ref_id);
    case 'devoir_correction':
      return accesDevoir(user, f.ref_id, true);
    case 'soumission': {
      const s = await db.un('SELECT devoir_id, eleve_id FROM soumissions WHERE id = $1', [f.ref_id]);
      if (!s) return false;
      if (['admin', 'enseignant'].includes(user.role)) return accesDevoir(user, s.devoir_id);
      return ['eleve', 'parent'].includes(user.role) && peutVoirEleve(db, user, s.eleve_id);
    }
    case 'message_pj': {
      const r = await db.un(
        `SELECT 1 FROM messages m LEFT JOIN messages_destinataires md ON md.message_id = m.id AND md.destinataire_id = $2
          WHERE m.id = $1 AND (m.expediteur_id = $2 OR (md.destinataire_id = $2 AND m.statut = 'envoye'))`,
        [f.ref_id, user.id]
      );
      return Boolean(r);
    }
    case 'justificatif': {
      const a = await db.un('SELECT eleve_id FROM absences WHERE id = $1', [f.ref_id]);
      if (!a || user.role === 'comptable' || user.role === 'eleve') return false;
      return peutVoirEleve(db, user, a.eleve_id);
    }
    default:
      return false;
  }
}

fichiers.get('/:id', async (req, res) => {
  const id = entierParam(req.params.id);
  const f = await db.un('SELECT * FROM fichiers WHERE id = $1', [id]);
  if (!f || (f.deleted_at && f.categorie !== 'recu')) throw introuvable('Fichier');
  if (!(await peutAccederFichier(req.user, f))) throw interdit("Vous n'avez pas accès à ce fichier.");
  const chemin = cheminAbsolu(f);
  if (!fs.existsSync(chemin)) throw introuvable('Fichier');
  const disposition = req.query.telecharger === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(f.nom_original)}`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.sendFile(chemin);
});

// ----- Journaux (administration) -----
const journal = express.Router();
journal.use(autoriser('admin'));

function pagination(req) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const parPage = Math.min(100, Math.max(10, Number(req.query.par_page) || 30));
  return { page, parPage, offset: (page - 1) * parPage };
}

journal.get('/audit', async (req, res) => {
  const { page, parPage, offset } = pagination(req);
  const conditions = ['TRUE'];
  const params = [];
  const ajouter = (sql, v) => {
    params.push(v);
    conditions.push(sql.replace('?', `$${params.length}`));
  };
  if (req.query.entite) ajouter('j.entite = ?', String(req.query.entite));
  if (req.query.action) ajouter('j.action = ?', String(req.query.action));
  if (req.query.utilisateur_id) ajouter('j.utilisateur_id = ?', entierParam(req.query.utilisateur_id));
  if (req.query.entite_id) ajouter('j.entite_id = ?', entierParam(req.query.entite_id));
  const where = conditions.join(' AND ');
  const total = (await db.un(`SELECT COUNT(*)::int AS n FROM journal_audit j WHERE ${where}`, params)).n;
  const r = await db.query(
    `SELECT j.*, u.prenom || ' ' || u.nom AS utilisateur, u.role AS utilisateur_role
       FROM journal_audit j LEFT JOIN utilisateurs u ON u.id = j.utilisateur_id
      WHERE ${where} ORDER BY j.id DESC LIMIT ${parPage} OFFSET ${offset}`,
    params
  );
  res.json({ items: r.rows, total, page, pages: Math.max(1, Math.ceil(total / parPage)) });
});

journal.get('/envois', async (req, res) => {
  const { page, parPage, offset } = pagination(req);
  const conditions = ['TRUE'];
  const params = [];
  if (req.query.contexte) {
    params.push(String(req.query.contexte));
    conditions.push(`contexte = $${params.length}`);
  }
  if (req.query.canal) {
    params.push(String(req.query.canal));
    conditions.push(`canal = $${params.length}`);
  }
  const where = conditions.join(' AND ');
  const total = (await db.un(`SELECT COUNT(*)::int AS n FROM journal_envois WHERE ${where}`, params)).n;
  const r = await db.query(`SELECT * FROM journal_envois WHERE ${where} ORDER BY id DESC LIMIT ${parPage} OFFSET ${offset}`, params);
  res.json({ items: r.rows, total, page, pages: Math.max(1, Math.ceil(total / parPage)) });
});

journal.get('/acces', async (req, res) => {
  const { page, parPage, offset } = pagination(req);
  const params = [];
  let where = 'TRUE';
  if (req.query.ressource) {
    params.push(String(req.query.ressource));
    where = `j.ressource = $1`;
  }
  const total = (await db.un(`SELECT COUNT(*)::int AS n FROM journal_acces j WHERE ${where}`, params)).n;
  const r = await db.query(
    `SELECT j.*, u.prenom || ' ' || u.nom AS utilisateur, u.role AS utilisateur_role
       FROM journal_acces j LEFT JOIN utilisateurs u ON u.id = j.utilisateur_id
      WHERE ${where} ORDER BY j.id DESC LIMIT ${parPage} OFFSET ${offset}`,
    params
  );
  res.json({ items: r.rows, total, page, pages: Math.max(1, Math.ceil(total / parPage)) });
});

// ----- Paramètres de l'école et années scolaires -----
const parametres = express.Router();

parametres.get('/', autoriser('admin'), (req, res) => res.json(parametresPublics()));

parametres.put('/', autoriser('admin'), async (req, res) => {
  const d = valider(req.body, {
    nom_ecole: { type: 'string', required: true, label: 'Nom de l’école', maxLength: 150 },
    adresse_ecole: { type: 'string', label: 'Adresse', maxLength: 200 },
    telephone_ecole: { type: 'string', label: 'Téléphone', maxLength: 40 },
    email_ecole: { type: 'email', label: 'E-mail' },
    devise: { type: 'string', label: 'Devise', maxLength: 5 },
    annee_courante: { type: 'string', required: true, label: 'Année scolaire courante', maxLength: 9 },
  });
  if (!/^(\d{4})-(\d{4})$/.test(d.annee_courante) || Number(d.annee_courante.slice(5)) !== Number(d.annee_courante.slice(0, 4)) + 1) {
    throw new HttpError(400, 'Année scolaire invalide (format AAAA-AAAA, ex. 2026-2027).');
  }
  await db.tx(req, async (c) => {
    for (const [cle, valeur] of Object.entries(d)) {
      if (valeur === null) continue;
      await c.query(
        `INSERT INTO parametres (cle, valeur) VALUES ($1, $2) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur WHERE parametres.valeur <> EXCLUDED.valeur`,
        [cle, String(valeur)]
      );
    }
  });
  await chargerParametres();
  res.json(parametresPublics());
});

const annees = express.Router();

annees.get('/', async (req, res) => {
  const r = await db.query(
    `SELECT DISTINCT annee_scolaire FROM (
        SELECT annee_scolaire FROM classes WHERE deleted_at IS NULL
        UNION SELECT annee_scolaire FROM inscriptions
        UNION SELECT $1::text) x ORDER BY annee_scolaire DESC`,
    [anneeCourante()]
  );
  res.json({ courante: anneeCourante(), annees: r.rows.map((x) => x.annee_scolaire) });
});

/**
 * Passage à l'année suivante : copie des classes et de la grille tarifaire, passage des élèves
 * au niveau supérieur (même section), les CM2 sont marqués « sortis ». L'historique est conservé.
 */
annees.post('/passage', autoriser('admin'), async (req, res) => {
  const ancienne = anneeCourante();
  const nouvelle = anneeSuivante(ancienne);
  const deja = await db.un('SELECT COUNT(*)::int AS n FROM classes WHERE annee_scolaire = $1 AND deleted_at IS NULL', [nouvelle]);
  if (deja.n > 0 && req.query.force !== '1') {
    throw new HttpError(409, `Des classes existent déjà pour ${nouvelle}.`, { confirmationRequise: true });
  }
  const NIV = ['CP', 'CE1', 'CE2', 'CM1', 'CM2'];
  const bilan = await db.tx(req, async (c) => {
    const classes = (await c.query('SELECT * FROM classes WHERE annee_scolaire = $1 AND deleted_at IS NULL', [ancienne])).rows;
    const correspondance = new Map();
    for (const cl of classes) {
      const nv = (
        await c.query(
          `INSERT INTO classes (niveau, section, capacite_max, annee_scolaire, titulaire_id)
           SELECT $1, $2, $3, $4, $5 WHERE NOT EXISTS (
             SELECT 1 FROM classes WHERE niveau = $1 AND upper(section) = upper($2) AND annee_scolaire = $4 AND deleted_at IS NULL)
           RETURNING id`,
          [cl.niveau, cl.section, cl.capacite_max, nouvelle, cl.titulaire_id]
        )
      ).rows[0];
      const id =
        nv?.id ||
        (await c.query('SELECT id FROM classes WHERE niveau = $1 AND upper(section) = upper($2) AND annee_scolaire = $3 AND deleted_at IS NULL', [cl.niveau, cl.section, nouvelle]))
          .rows[0].id;
      correspondance.set(`${cl.niveau}|${cl.section.toUpperCase()}`, id);
    }
    await c.query(
      `INSERT INTO tarifs (libelle, type, montant, niveau, date_echeance, annee_scolaire)
       SELECT libelle, type, montant, niveau, CASE WHEN date_echeance IS NULL THEN NULL ELSE (date_echeance + INTERVAL '1 year')::date END, $2
         FROM tarifs WHERE annee_scolaire = $1 AND deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM tarifs WHERE annee_scolaire = $2 AND deleted_at IS NULL)`,
      [ancienne, nouvelle]
    );
    let passes = 0;
    let sortis = 0;
    const eleves = (
      await c.query(
        `SELECT i.eleve_id, cl.niveau, cl.section FROM inscriptions i JOIN classes cl ON cl.id = i.classe_id
           JOIN eleves e ON e.id = i.eleve_id AND e.deleted_at IS NULL AND e.statut = 'actif'
          WHERE i.annee_scolaire = $1`,
        [ancienne]
      )
    ).rows;
    for (const e of eleves) {
      const idx = NIV.indexOf(e.niveau);
      if (idx === NIV.length - 1) {
        await c.query("UPDATE eleves SET statut = 'sorti' WHERE id = $1", [e.eleve_id]);
        sortis += 1;
        continue;
      }
      const cible = correspondance.get(`${NIV[idx + 1]}|${e.section.toUpperCase()}`) || correspondance.get(`${NIV[idx + 1]}|A`);
      if (!cible) continue;
      await c.query(
        `INSERT INTO inscriptions (eleve_id, classe_id, annee_scolaire, mode_affectation) VALUES ($1, $2, $3, 'passage')
         ON CONFLICT (eleve_id, annee_scolaire) DO NOTHING`,
        [e.eleve_id, cible, nouvelle]
      );
      passes += 1;
    }
    await c.query("INSERT INTO parametres (cle, valeur) VALUES ('annee_courante', $1) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur", [nouvelle]);
    return { classes: classes.length, eleves_passes: passes, eleves_sortis: sortis };
  });
  await chargerParametres();
  res.json({ ok: true, ancienne, nouvelle, ...bilan });
});

module.exports = { notifications, push, fichiers, journal, parametres, annees };
