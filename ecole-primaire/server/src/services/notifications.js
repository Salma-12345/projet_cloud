// Notifications : in-app (cloche), push (PWA, Web Push/VAPID) et e-mail (SMTP, ex. SendGrid).
// Chaque envoi push / e-mail est journalisé dans journal_envois (date, destinataire, statut).
const webpush = require('web-push');
const nodemailer = require('nodemailer');
const config = require('../config');
const db = require('../db');
const { param } = require('./parametres');

let transporteur = null;
let pushPret = false;

function initialiserCanaux() {
  if (config.smtp.host) {
    transporteur = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
    console.log(`[email] SMTP configuré (${config.smtp.host})`);
  } else {
    console.log('[email] Aucun SMTP configuré : les e-mails sont simulés et visibles dans le journal des envois.');
  }
  try {
    webpush.setVapidDetails(`mailto:${param('email_ecole', 'contact@ecole.tn')}`, param('vapid_public'), param('vapid_prive'));
    pushPret = true;
  } catch (e) {
    console.error('[push] configuration VAPID invalide :', e.message);
  }
}

function emailActif() {
  return Boolean(transporteur);
}

async function journaliserEnvoi(executeur, e) {
  await executeur.query(
    `INSERT INTO journal_envois (destinataire_id, destinataire, canal, contexte, sujet, contenu, statut, erreur, ref_type, ref_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      e.destinataire_id || null,
      e.destinataire || null,
      e.canal,
      e.contexte || 'general',
      e.sujet || null,
      e.contenu || null,
      e.statut,
      e.erreur || null,
      e.ref_type || null,
      e.ref_id || null,
    ]
  );
}

/**
 * Crée une notification in-app pour chaque destinataire, puis (après le COMMIT)
 * envoie les notifications push et, si demandé, les e-mails.
 */
async function notifier(client, destinataires, opts) {
  const ids = [...new Set((destinataires || []).filter(Boolean).map(Number))];
  if (!ids.length) return;
  const { type, titre, contenu = null, lien = null } = opts;
  await client.query(
    `INSERT INTO notifications (utilisateur_id, type, titre, contenu, lien)
     SELECT unnest($1::int[]), $2, $3, $4, $5`,
    [ids, type, titre, contenu, lien]
  );
  const tache = () => envoyerCanauxExternes(ids, opts);
  if (client.apresCommit) client.apresCommit.push(tache);
  else setImmediate(() => tache().catch((e) => console.error('[notifier]', e.message)));
}

async function envoyerCanauxExternes(ids, opts) {
  const { titre, contenu, lien, email = false, contexte = 'general', ref_type, ref_id, baseUrl = '' } = opts;

  // 1) Push (PWA)
  if (pushPret && opts.push !== false) {
    const abonnements = await db.query(
      `SELECT a.*, u.prenom, u.nom FROM abonnements_push a JOIN utilisateurs u ON u.id = a.utilisateur_id
        WHERE a.utilisateur_id = ANY($1)`,
      [ids]
    );
    for (const ab of abonnements.rows) {
      const destinataire = `${ab.prenom} ${ab.nom}`;
      try {
        await webpush.sendNotification(
          { endpoint: ab.endpoint, keys: { p256dh: ab.p256dh, auth: ab.auth } },
          JSON.stringify({ titre, contenu: (contenu || '').slice(0, 180), lien: lien || '/' }),
          { TTL: 24 * 3600 }
        );
        await journaliserEnvoi(db, { destinataire_id: ab.utilisateur_id, destinataire, canal: 'push', contexte, sujet: titre, statut: 'envoye', ref_type, ref_id });
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          await db.query('DELETE FROM abonnements_push WHERE id = $1', [ab.id]);
        }
        await journaliserEnvoi(db, {
          destinataire_id: ab.utilisateur_id,
          destinataire,
          canal: 'push',
          contexte,
          sujet: titre,
          statut: 'echec',
          erreur: e.message.slice(0, 300),
          ref_type,
          ref_id,
        });
      }
    }
  }

  // 2) E-mail
  if (email) {
    const users = await db.query('SELECT id, email, prenom, nom FROM utilisateurs WHERE id = ANY($1) AND deleted_at IS NULL', [ids]);
    const lienAbsolu = lien ? `${baseUrl}${lien}` : baseUrl;
    for (const u of users.rows) {
      const texte = `Bonjour ${u.prenom} ${u.nom},\n\n${contenu || titre}\n\n${lienAbsolu ? `Accéder à l'application : ${lienAbsolu}\n\n` : ''}${param('nom_ecole')}`;
      const base = { destinataire_id: u.id, destinataire: u.email, canal: 'email', contexte, sujet: titre, contenu: texte, ref_type, ref_id };
      if (!transporteur) {
        await journaliserEnvoi(db, { ...base, statut: 'simule' });
        continue;
      }
      try {
        await transporteur.sendMail({
          from: config.smtp.from || `"${param('nom_ecole')}" <${param('email_ecole')}>`,
          to: u.email,
          subject: titre,
          text: texte,
        });
        await journaliserEnvoi(db, { ...base, statut: 'envoye' });
      } catch (e) {
        await journaliserEnvoi(db, { ...base, statut: 'echec', erreur: e.message.slice(0, 300) });
      }
    }
  }
}

/** E-mail direct (ex. identifiants d'un nouveau parent), journalisé. */
async function envoyerEmailDirect({ destinataire_id, email, sujet, texte, contexte, ref_type, ref_id }) {
  const base = { destinataire_id, destinataire: email, canal: 'email', contexte, sujet, contenu: texte, ref_type, ref_id };
  if (!transporteur) {
    await journaliserEnvoi(db, { ...base, statut: 'simule' });
    return 'simule';
  }
  try {
    await transporteur.sendMail({
      from: config.smtp.from || `"${param('nom_ecole')}" <${param('email_ecole')}>`,
      to: email,
      subject: sujet,
      text: texte,
    });
    await journaliserEnvoi(db, { ...base, statut: 'envoye' });
    return 'envoye';
  } catch (e) {
    await journaliserEnvoi(db, { ...base, statut: 'echec', erreur: e.message.slice(0, 300) });
    return 'echec';
  }
}

module.exports = { initialiserCanaux, notifier, journaliserEnvoi, envoyerEmailDirect, emailActif };
