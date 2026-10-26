const fs = require('fs');
const path = require('path');
const { pool } = require('./index');

// Applique, dans l'ordre, les fichiers SQL de migrations/ qui n'ont pas encore été exécutés.
async function migrer() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    nom TEXT PRIMARY KEY,
    applique_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const dossier = path.join(__dirname, 'migrations');
  const fichiers = fs.readdirSync(dossier).filter((f) => f.endsWith('.sql')).sort();
  const deja = new Set((await pool.query('SELECT nom FROM schema_migrations')).rows.map((r) => r.nom));
  for (const f of fichiers) {
    if (deja.has(f)) continue;
    const sql = fs.readFileSync(path.join(dossier, f), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (nom) VALUES ($1)', [f]);
      await client.query('COMMIT');
      console.log(`[migration] ${f} appliquée`);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(`Échec de la migration ${f} : ${e.message}`);
    } finally {
      client.release();
    }
  }
}

module.exports = { migrer };
