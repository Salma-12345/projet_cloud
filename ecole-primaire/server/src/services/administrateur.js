// Mise en service sans données de démonstration (SEED_DEMO=false) : la base est vide,
// il faut un premier compte de direction pour créer le reste depuis l'interface.
const bcrypt = require('bcryptjs');
const db = require('../db');
const { genererMotDePasse } = require('../utils');

async function assurerAdministrateur() {
  const { n } = await db.un("SELECT count(*)::int AS n FROM utilisateurs WHERE role = 'admin' AND deleted_at IS NULL");
  if (n > 0) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@ecole.tn').trim().toLowerCase();
  const motDePasseFourni = Boolean(process.env.ADMIN_MOT_DE_PASSE);
  const motDePasse = process.env.ADMIN_MOT_DE_PASSE || genererMotDePasse();
  await db.query(
    `INSERT INTO utilisateurs (role, email, mot_de_passe, nom, prenom, doit_changer_mdp)
     VALUES ('admin', $1, $2, 'École', 'Administrateur', TRUE)`,
    [email, await bcrypt.hash(motDePasse, 10)]
  );
  console.log(`\n  Premier compte administrateur créé : ${email}`);
  console.log(
    motDePasseFourni
      ? '  Mot de passe : celui de la variable ADMIN_MOT_DE_PASSE (à changer à la première connexion).\n'
      : `  Mot de passe provisoire : ${motDePasse} (à changer à la première connexion).\n`
  );
}

module.exports = { assurerAdministrateur };
