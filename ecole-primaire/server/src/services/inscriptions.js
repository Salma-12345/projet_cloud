// Affectation des élèves aux classes (manuelle ou automatique selon l'âge / le niveau) avec contrôle des effectifs.
const bcrypt = require('bcryptjs');
const { HttpError, genererMotDePasse } = require('../utils');
const { NIVEAUX, anneeCourante } = require('./parametres');

/** Niveau théorique selon l'âge : 6 ans dans l'année civile de rentrée -> CP, 7 ans -> CE1, etc. */
function niveauSelonAge(dateNaissance, annee = anneeCourante()) {
  const debut = Number(annee.slice(0, 4));
  const naissance = Number(String(dateNaissance).slice(0, 4));
  const idx = Math.min(Math.max(debut - naissance - 6, 0), NIVEAUX.length - 1);
  return NIVEAUX[idx];
}

async function effectif(client, classeId, saufEleveId = null) {
  const r = await client.query(
    `SELECT COUNT(*)::int AS n FROM inscriptions i JOIN eleves e ON e.id = i.eleve_id AND e.deleted_at IS NULL
      WHERE i.classe_id = $1 AND ($2::int IS NULL OR i.eleve_id <> $2)`,
    [classeId, saufEleveId]
  );
  return r.rows[0].n;
}

/** Affecte (ou réaffecte) un élève à une classe pour l'année de la classe. */
async function affecterClasse(client, eleveId, classeId, mode = 'manuelle') {
  const classe = (await client.query('SELECT * FROM classes WHERE id = $1 AND deleted_at IS NULL', [classeId])).rows[0];
  if (!classe) throw new HttpError(404, 'Classe introuvable.');
  const n = await effectif(client, classeId, eleveId);
  if (n >= classe.capacite_max) {
    throw new HttpError(409, `La classe ${classe.niveau} ${classe.section} est complète (${n}/${classe.capacite_max} élèves).`, {
      complete: true,
    });
  }
  await client.query(
    `INSERT INTO inscriptions (eleve_id, classe_id, annee_scolaire, mode_affectation)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (eleve_id, annee_scolaire)
     DO UPDATE SET classe_id = EXCLUDED.classe_id, mode_affectation = EXCLUDED.mode_affectation, date_affectation = CURRENT_DATE`,
    [eleveId, classeId, classe.annee_scolaire, mode]
  );
  return classe;
}

/** Affectation automatique : classe du niveau (indiqué ou déduit de l'âge) la moins chargée et non complète. */
async function affecterAutomatiquement(client, eleveId, { niveau = null, dateNaissance, annee = anneeCourante() }) {
  const niv = niveau || niveauSelonAge(dateNaissance, annee);
  const r = await client.query(
    `SELECT c.id, c.niveau, c.section, c.capacite_max,
            (SELECT COUNT(*)::int FROM inscriptions i JOIN eleves e ON e.id = i.eleve_id AND e.deleted_at IS NULL
              WHERE i.classe_id = c.id AND i.eleve_id <> $3) AS effectif
       FROM classes c
      WHERE c.deleted_at IS NULL AND c.niveau = $1 AND c.annee_scolaire = $2
      ORDER BY effectif, c.section`,
    [niv, annee, eleveId]
  );
  const libre = r.rows.find((c) => c.effectif < c.capacite_max);
  if (!libre) {
    throw new HttpError(
      409,
      r.rows.length
        ? `Toutes les classes de niveau ${niv} sont complètes. Créez une nouvelle section ou affectez manuellement.`
        : `Aucune classe de niveau ${niv} n'existe pour l'année ${annee}.`
    );
  }
  return affecterClasse(client, eleveId, libre.id, 'automatique');
}

async function genererMatricule(client, annee = anneeCourante()) {
  const n = (await client.query("SELECT nextval('seq_matricule') AS n")).rows[0].n;
  return `E${annee.slice(0, 4)}-${String(n).padStart(4, '0')}`;
}

function slug(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Crée le compte de connexion d'un élève (identifiant prenom.nom@eleve.ecole.tn). */
async function creerCompteEleve(client, eleve) {
  const base = `${slug(eleve.prenom)}.${slug(eleve.nom)}`;
  let email = `${base}@eleve.ecole.tn`;
  for (let i = 2; (await client.query('SELECT 1 FROM utilisateurs WHERE lower(email) = $1 AND deleted_at IS NULL', [email])).rowCount; i++) {
    email = `${base}${i}@eleve.ecole.tn`;
  }
  const motDePasse = genererMotDePasse();
  const u = (
    await client.query(
      `INSERT INTO utilisateurs (role, email, mot_de_passe, nom, prenom, doit_changer_mdp)
       VALUES ('eleve', $1, $2, $3, $4, TRUE) RETURNING id, email`,
      [email, await bcrypt.hash(motDePasse, 10), eleve.nom, eleve.prenom]
    )
  ).rows[0];
  await client.query('UPDATE eleves SET utilisateur_id = $1 WHERE id = $2', [u.id, eleve.id]);
  return { role: 'eleve', nom: `${eleve.prenom} ${eleve.nom}`, email: u.email, mot_de_passe: motDePasse, utilisateur_id: u.id };
}

module.exports = { niveauSelonAge, affecterClasse, affecterAutomatiquement, genererMatricule, creerCompteEleve, effectif, slug };
