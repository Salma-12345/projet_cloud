// Messagerie interne : conversations, brouillons, immuabilité des messages envoyés, masquage côté destinataire.
const express = require('express');
const db = require('../db');
const { valider, entierParam, HttpError, introuvable, interdit, urlPublique } = require('../utils');
const { contactsAutorises } = require('../services/messagerie');
const { notifier } = require('../services/notifications');
const { journaliserAcces, peutVoirEleve } = require('../services/acces');
const { televersement, enregistrerFichier, fichiersDePlusieurs } = require('../services/fichiers');

const router = express.Router();
const upload = televersement({ maxFichiers: 5 });

router.get('/contacts', async (req, res) => {
  res.json(await contactsAutorises(db, req.user));
});

router.get('/non-lus', async (req, res) => {
  const r = await db.un(
    `SELECT COUNT(*)::int AS n FROM messages_destinataires md JOIN messages m ON m.id = md.message_id
      WHERE md.destinataire_id = $1 AND md.lu_at IS NULL AND md.masque_at IS NULL AND m.statut = 'envoye'`,
    [req.user.id]
  );
  res.json({ non_lus: r.n });
});

// Liste des conversations (une ligne par fil)
router.get('/', async (req, res) => {
  const boite = req.query.boite || 'tous';
  const params = [req.user.id];
  let filtreEleve = '';
  if (req.query.eleve_id) {
    params.push(entierParam(req.query.eleve_id));
    filtreEleve = ` AND r.eleve_id = $${params.length}`;
  }
  let filtreTexte = '';
  if (req.query.q) {
    params.push(`%${String(req.query.q).toLowerCase()}%`);
    filtreTexte = ` AND EXISTS (SELECT 1 FROM mes x WHERE x.racine = f.racine AND lower(x.objet || ' ' || x.corps) LIKE $${params.length})`;
  }
  const r = await db.query(
    `WITH mes AS (
        SELECT m.id, m.objet, m.corps, m.expediteur_id, m.envoye_at, m.automatique, COALESCE(m.fil_id, m.id) AS racine,
               (m.expediteur_id = $1) AS par_moi, md.lu_at, md.masque_at, (md.destinataire_id IS NOT NULL) AS recu
          FROM messages m
          LEFT JOIN messages_destinataires md ON md.message_id = m.id AND md.destinataire_id = $1
         WHERE m.statut = 'envoye' AND (m.expediteur_id = $1 OR md.destinataire_id = $1)
     ), fils AS (
        SELECT racine, MAX(envoye_at) AS dernier_at, COUNT(*)::int AS nb_messages,
               COUNT(*) FILTER (WHERE recu AND lu_at IS NULL AND masque_at IS NULL)::int AS non_lus,
               COUNT(*) FILTER (WHERE par_moi OR (recu AND masque_at IS NULL))::int AS visibles,
               bool_or(par_moi) AS j_ai_ecrit,
               bool_or(recu AND masque_at IS NULL) AS j_ai_recu,
               bool_or(automatique) AS automatique
          FROM mes GROUP BY racine
     )
     SELECT f.*, r.objet, r.eleve_id, el.prenom || ' ' || el.nom AS eleve,
            d.id AS dernier_id, left(d.corps, 160) AS extrait, d.expediteur_id AS dernier_expediteur_id,
            ue.prenom || ' ' || ue.nom AS dernier_expediteur,
            (SELECT json_agg(DISTINCT jsonb_build_object('id', u.id, 'nom', u.prenom || ' ' || u.nom, 'role', u.role))
               FROM (SELECT m2.expediteur_id AS uid FROM messages m2 WHERE COALESCE(m2.fil_id, m2.id) = f.racine AND m2.statut = 'envoye'
                     UNION SELECT md2.destinataire_id FROM messages_destinataires md2 JOIN messages m3 ON m3.id = md2.message_id
                      WHERE COALESCE(m3.fil_id, m3.id) = f.racine AND m3.statut = 'envoye') p
               JOIN utilisateurs u ON u.id = p.uid WHERE u.id <> $1) AS participants
       FROM fils f
       JOIN messages r ON r.id = f.racine
       LEFT JOIN eleves el ON el.id = r.eleve_id
       JOIN LATERAL (SELECT * FROM mes WHERE mes.racine = f.racine ORDER BY envoye_at DESC, id DESC LIMIT 1) d ON TRUE
       JOIN utilisateurs ue ON ue.id = d.expediteur_id
      WHERE f.visibles > 0
        ${boite === 'non_lus' ? 'AND f.non_lus > 0' : ''}
        ${boite === 'envoyes' ? 'AND f.j_ai_ecrit' : ''}
        ${boite === 'recus' ? 'AND f.j_ai_recu' : ''}
        ${filtreEleve}${filtreTexte}
      ORDER BY f.dernier_at DESC
      LIMIT 300`,
    params
  );
  res.json(r.rows);
});

router.get('/brouillons', async (req, res) => {
  const r = await db.query(
    `SELECT m.id, m.objet, m.corps, m.eleve_id, m.fil_id, m.updated_at,
            COALESCE((SELECT json_agg(json_build_object('id', u.id, 'nom', u.prenom || ' ' || u.nom, 'role', u.role))
                        FROM messages_destinataires md JOIN utilisateurs u ON u.id = md.destinataire_id
                       WHERE md.message_id = m.id), '[]') AS destinataires
       FROM messages m
      WHERE m.expediteur_id = $1 AND m.statut = 'brouillon' AND m.deleted_at IS NULL
      ORDER BY m.updated_at DESC`,
    [req.user.id]
  );
  const pj = await fichiersDePlusieurs(db, 'message_pj', r.rows.map((m) => m.id));
  res.json(r.rows.map((m) => ({ ...m, pieces_jointes: pj[m.id] || [] })));
});

// Historique d'une conversation (lecture seule) — l'accès est journalisé
router.get('/fil/:id', async (req, res) => {
  const id = entierParam(req.params.id);
  const m = await db.un('SELECT id, fil_id, statut, expediteur_id FROM messages WHERE id = $1', [id]);
  if (!m) throw introuvable('Message');
  if (m.statut === 'brouillon') {
    if (m.expediteur_id !== req.user.id) throw introuvable('Message');
    throw new HttpError(400, 'Ce message est un brouillon.', { brouillon: true });
  }
  const racine = m.fil_id || m.id;
  const r = await db.query(
    `SELECT m.id, m.objet, m.corps, m.envoye_at, m.automatique, m.expediteur_id, m.eleve_id,
            u.prenom || ' ' || u.nom AS expediteur, u.role AS expediteur_role,
            md.lu_at AS mon_lu_at, md.masque_at AS mon_masque_at,
            (SELECT json_agg(json_build_object('id', ud.id, 'nom', ud.prenom || ' ' || ud.nom, 'role', ud.role, 'lu_at', d2.lu_at) ORDER BY ud.nom)
               FROM messages_destinataires d2 JOIN utilisateurs ud ON ud.id = d2.destinataire_id WHERE d2.message_id = m.id) AS destinataires
       FROM messages m
       JOIN utilisateurs u ON u.id = m.expediteur_id
       LEFT JOIN messages_destinataires md ON md.message_id = m.id AND md.destinataire_id = $2
      WHERE COALESCE(m.fil_id, m.id) = $1 AND m.statut = 'envoye' AND (m.expediteur_id = $2 OR md.destinataire_id = $2)
      ORDER BY m.envoye_at, m.id`,
    [racine, req.user.id]
  );
  if (!r.rowCount) throw interdit("Vous n'êtes pas participant(e) à cette conversation.");
  const pj = await fichiersDePlusieurs(db, 'message_pj', r.rows.map((x) => x.id));
  await db.query(
    `UPDATE messages_destinataires md SET lu_at = now() FROM messages m
      WHERE m.id = md.message_id AND COALESCE(m.fil_id, m.id) = $1 AND md.destinataire_id = $2 AND md.lu_at IS NULL AND m.statut = 'envoye'`,
    [racine, req.user.id]
  );
  await journaliserAcces(db, req, 'conversation', racine, r.rows[0].objet);
  const racineMsg = r.rows.find((x) => x.id === racine) || r.rows[0];
  const eleve = racineMsg.eleve_id ? await db.un('SELECT id, prenom, nom FROM eleves WHERE id = $1', [racineMsg.eleve_id]) : null;
  res.json({
    racine,
    objet: racineMsg.objet,
    eleve,
    messages: r.rows.map((x) => ({
      ...x,
      // les accusés de lecture ne sont visibles que par l'expéditeur
      destinataires: x.expediteur_id === req.user.id ? x.destinataires : (x.destinataires || []).map(({ lu_at, ...rest }) => rest),
      pieces_jointes: pj[x.id] || [],
    })),
  });
});

function lireDestinataires(v) {
  if (Array.isArray(v)) return v.map(Number).filter((x) => Number.isInteger(x) && x > 0);
  return String(v || '')
    .split(',')
    .map(Number)
    .filter((x) => Number.isInteger(x) && x > 0);
}

async function preparerEnvoi(req, { destinataires, eleveId, reponseA }) {
  const contacts = await contactsAutorises(db, req.user);
  const autorises = new Set(contacts.map((c) => c.id));
  const refuses = destinataires.filter((id) => !autorises.has(id));
  if (refuses.length) {
    throw new HttpError(403, 'Votre rôle ne vous permet pas d’écrire à certains destinataires sélectionnés.', { destinataires_refuses: refuses });
  }
  let filId = null;
  let eleve = eleveId;
  if (reponseA) {
    const origine = await db.un(
      `SELECT m.id, m.fil_id, m.eleve_id FROM messages m
         LEFT JOIN messages_destinataires md ON md.message_id = m.id AND md.destinataire_id = $2
        WHERE m.id = $1 AND m.statut = 'envoye' AND (m.expediteur_id = $2 OR md.destinataire_id = $2)`,
      [reponseA, req.user.id]
    );
    if (!origine) throw introuvable('Message d’origine');
    filId = origine.fil_id || origine.id;
    eleve = eleve || origine.eleve_id;
  }
  if (eleve && !(['admin', 'comptable', 'enseignant'].includes(req.user.role) || (await peutVoirEleve(db, req.user, eleve)))) {
    throw interdit();
  }
  return { filId, eleve };
}

async function diffuser(client, req, message, destinataires, important) {
  const expediteur = `${req.user.prenom} ${req.user.nom}`;
  await notifier(client, destinataires, {
    type: 'message',
    titre: `Nouveau message de ${expediteur}`,
    contenu: message.objet,
    lien: `/messagerie/${message.id}`,
    email: Boolean(important),
    contexte: 'message',
    ref_type: 'message',
    ref_id: message.id,
    baseUrl: urlPublique(req),
  });
}

// Création : envoi immédiat ou brouillon
router.post('/', upload.array('fichiers', 5), async (req, res) => {
  const d = valider(req.body, {
    objet: { type: 'string', required: true, label: 'Objet', maxLength: 200 },
    corps: { type: 'string', required: true, label: 'Message', maxLength: 10000 },
    eleve_id: { type: 'int', label: 'Élève concerné' },
    reponse_a: { type: 'int', label: 'Réponse à' },
    envoyer: { type: 'bool', defaut: true },
    important: { type: 'bool', defaut: false },
  });
  const destinataires = [...new Set(lireDestinataires(req.body.destinataires))];
  if (d.envoyer && !destinataires.length) throw new HttpError(400, 'Choisissez au moins un destinataire.');
  const { filId, eleve } = await preparerEnvoi(req, { destinataires, eleveId: d.eleve_id, reponseA: d.reponse_a });
  const message = await db.tx(req, async (c) => {
    const m = (
      await c.query(
        `INSERT INTO messages (expediteur_id, objet, corps, eleve_id, fil_id, statut, envoye_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [req.user.id, d.objet, d.corps, eleve, filId, d.envoyer ? 'envoye' : 'brouillon', d.envoyer ? new Date() : null]
      )
    ).rows[0];
    if (destinataires.length) {
      await c.query('INSERT INTO messages_destinataires (message_id, destinataire_id) SELECT $1, unnest($2::int[])', [m.id, destinataires]);
    }
    for (const f of req.files || []) await enregistrerFichier(c, f, 'message_pj', m.id, req.user.id);
    if (d.envoyer) await diffuser(c, req, m, destinataires, d.important);
    return m;
  });
  res.status(201).json(message);
});

// Modification d'un brouillon (un message envoyé est immuable)
router.put('/:id', upload.array('fichiers', 5), async (req, res) => {
  const id = entierParam(req.params.id);
  const m = await db.un('SELECT * FROM messages WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!m || m.expediteur_id !== req.user.id) throw introuvable('Brouillon');
  if (m.statut !== 'brouillon') throw new HttpError(403, 'Un message envoyé est immuable : il ne peut être ni modifié ni supprimé.', { immuable: true });
  const d = valider(req.body, {
    objet: { type: 'string', required: true, label: 'Objet', maxLength: 200 },
    corps: { type: 'string', required: true, label: 'Message', maxLength: 10000 },
    eleve_id: { type: 'int', label: 'Élève concerné' },
    envoyer: { type: 'bool', defaut: false },
    important: { type: 'bool', defaut: false },
  });
  const destinataires = [...new Set(lireDestinataires(req.body.destinataires))];
  if (d.envoyer && !destinataires.length) throw new HttpError(400, 'Choisissez au moins un destinataire.');
  const { eleve } = await preparerEnvoi(req, { destinataires, eleveId: d.eleve_id || m.eleve_id, reponseA: null });
  const aSupprimer = lireDestinataires(req.body.fichiers_supprimes);
  const maj = await db.tx(req, async (c) => {
    const r = (
      await c.query(
        `UPDATE messages SET objet = $1, corps = $2, eleve_id = $3, statut = $4, envoye_at = $5 WHERE id = $6 RETURNING *`,
        [d.objet, d.corps, eleve, d.envoyer ? 'envoye' : 'brouillon', d.envoyer ? new Date() : null, id]
      )
    ).rows[0];
    await c.query('DELETE FROM messages_destinataires WHERE message_id = $1', [id]);
    if (destinataires.length) {
      await c.query('INSERT INTO messages_destinataires (message_id, destinataire_id) SELECT $1, unnest($2::int[])', [id, destinataires]);
    }
    if (aSupprimer.length) {
      await c.query("UPDATE fichiers SET deleted_at = now() WHERE id = ANY($1) AND categorie = 'message_pj' AND ref_id = $2", [aSupprimer, id]);
    }
    for (const f of req.files || []) await enregistrerFichier(c, f, 'message_pj', id, req.user.id);
    if (d.envoyer) await diffuser(c, req, r, destinataires, d.important);
    return r;
  });
  res.json(maj);
});

// Suppression : brouillon (expéditeur) ou masquage (destinataire). Un message envoyé reste dans l'historique.
router.delete('/:id', async (req, res) => {
  const id = entierParam(req.params.id);
  const m = await db.un('SELECT * FROM messages WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!m) throw introuvable('Message');
  if (m.statut === 'brouillon') {
    if (m.expediteur_id !== req.user.id) throw introuvable('Message');
    await db.tx(req, (c) => c.query('UPDATE messages SET deleted_at = now() WHERE id = $1', [id]));
    return res.json({ ok: true, action: 'brouillon_supprime' });
  }
  const dest = await db.un('SELECT * FROM messages_destinataires WHERE message_id = $1 AND destinataire_id = $2', [id, req.user.id]);
  if (dest) {
    await db.query('UPDATE messages_destinataires SET masque_at = now() WHERE message_id = $1 AND destinataire_id = $2', [id, req.user.id]);
    await db.query(
      `INSERT INTO journal_audit (utilisateur_id, action, entite, entite_id, ip) VALUES ($1, 'masquage', 'messages', $2, $3)`,
      [req.user.id, id, req.ip || null]
    );
    return res.json({ ok: true, action: 'masque' });
  }
  if (m.expediteur_id === req.user.id) {
    throw new HttpError(403, 'Un message envoyé est immuable : il ne peut être ni modifié ni supprimé par son expéditeur.', { immuable: true });
  }
  throw introuvable('Message');
});

// Réafficher un message masqué dans sa boîte
router.post('/:id/afficher', async (req, res) => {
  const id = entierParam(req.params.id);
  const r = await db.query('UPDATE messages_destinataires SET masque_at = NULL WHERE message_id = $1 AND destinataire_id = $2', [id, req.user.id]);
  if (!r.rowCount) throw introuvable('Message');
  res.json({ ok: true });
});

module.exports = router;
