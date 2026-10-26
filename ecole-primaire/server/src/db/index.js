const { Pool, types } = require('pg');
const config = require('../config');

// NUMERIC -> nombre JavaScript, DATE -> chaîne 'AAAA-MM-JJ' (pas de décalage de fuseau), BIGINT -> entier
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(1082, (v) => v);
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

const pool = new Pool({ connectionString: config.databaseUrl, max: 20 });

pool.on('error', (err) => {
  console.error('[db] erreur inattendue sur une connexion inactive :', err.message);
});

function query(text, params) {
  return pool.query(text, params);
}

async function un(text, params) {
  const r = await pool.query(text, params);
  return r.rows[0] || null;
}

/**
 * Exécute fn dans une transaction. L'utilisateur connecté est transmis à PostgreSQL
 * (set_config) pour que le trigger de journalisation enregistre qui a fait quoi.
 * Les tâches ajoutées dans client.apresCommit (e-mails, push…) sont lancées après le COMMIT.
 */
async function tx(req, fn) {
  const client = await pool.connect();
  client.apresCommit = [];
  try {
    await client.query('BEGIN');
    if (req && req.user) {
      await client.query("SELECT set_config('app.utilisateur_id', $1, true), set_config('app.ip', $2, true)", [
        String(req.user.id),
        req.ip || '',
      ]);
    }
    const resultat = await fn(client);
    await client.query('COMMIT');
    const taches = client.apresCommit;
    client.apresCommit = [];
    for (const tache of taches) {
      Promise.resolve()
        .then(tache)
        .catch((e) => console.error('[apres-commit]', e.message));
    }
    return resultat;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.apresCommit = [];
    client.release();
  }
}

async function attendreBase(tentatives = 30) {
  for (let i = 1; i <= tentatives; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (e) {
      console.log(`[db] base de données indisponible (${i}/${tentatives}) : ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('Impossible de se connecter à la base de données.');
}

module.exports = { pool, query, un, tx, attendreBase };
