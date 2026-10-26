const crypto = require('crypto');
const webpush = require('web-push');
const db = require('../db');
const config = require('../config');
const { anneeDepuisDate } = require('../utils');

let cache = {};

const NIVEAUX = ['CP', 'CE1', 'CE2', 'CM1', 'CM2'];

async function chargerParametres() {
  const r = await db.query('SELECT cle, valeur FROM parametres');
  cache = Object.fromEntries(r.rows.map((x) => [x.cle, x.valeur]));
  return cache;
}

function param(cle, defaut = null) {
  return cache[cle] !== undefined ? cache[cle] : defaut;
}

function anneeCourante() {
  return cache.annee_courante || anneeDepuisDate();
}

function secretJwt() {
  return config.jwtSecret || cache.jwt_secret;
}

/** Crée les paramètres manquants (secret de session, clés push, année courante…). */
async function initialiserParametres() {
  await chargerParametres();
  const defauts = {
    nom_ecole: 'École primaire Aboukacem Chebbi',
    adresse_ecole: 'Avenue Aboukacem Chebbi, 4000 Sousse',
    telephone_ecole: '+216 73 000 000',
    email_ecole: 'contact@ecole-aboukacem-chebbi.tn',
    devise: 'DT',
    annee_courante: anneeDepuisDate(),
  };
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.seed', 'on', true)");
    for (const [cle, valeur] of Object.entries(defauts)) {
      if (cache[cle] === undefined) {
        await client.query('INSERT INTO parametres (cle, valeur) VALUES ($1, $2) ON CONFLICT (cle) DO NOTHING', [cle, valeur]);
      }
    }
    if (!cache.jwt_secret) {
      await client.query('INSERT INTO parametres (cle, valeur) VALUES ($1, $2) ON CONFLICT (cle) DO NOTHING', [
        'jwt_secret',
        crypto.randomBytes(48).toString('hex'),
      ]);
    }
    if (!cache.vapid_public || !cache.vapid_prive) {
      const cles = webpush.generateVAPIDKeys();
      await client.query(
        `INSERT INTO parametres (cle, valeur) VALUES ('vapid_public', $1), ('vapid_prive', $2)
         ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur`,
        [cles.publicKey, cles.privateKey]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  await chargerParametres();
}

function parametresPublics() {
  return {
    nom_ecole: param('nom_ecole'),
    adresse_ecole: param('adresse_ecole'),
    telephone_ecole: param('telephone_ecole'),
    email_ecole: param('email_ecole'),
    devise: param('devise', 'DT'),
    annee_courante: anneeCourante(),
  };
}

module.exports = {
  NIVEAUX,
  chargerParametres,
  initialiserParametres,
  param,
  anneeCourante,
  secretJwt,
  parametresPublics,
};
