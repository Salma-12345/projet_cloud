// Règles de périmètre (qui peut voir quoi) — complément du RBAC par rôle.
const { HttpError } = require('../utils');
const { anneeCourante } = require('./parametres');

/** Classes d'un enseignant (titulaire ou affecté à une matière) pour une année. */
async function classesEnseignant(db, enseignantId, annee = anneeCourante()) {
  const r = await db.query(
    `SELECT DISTINCT c.id
       FROM classes c
       LEFT JOIN affectations a ON a.classe_id = c.id AND a.deleted_at IS NULL
      WHERE c.deleted_at IS NULL AND c.annee_scolaire = $2
        AND (c.titulaire_id = $1 OR a.enseignant_id = $1)`,
    [enseignantId, annee]
  );
  return r.rows.map((x) => x.id);
}

async function enfantsParent(db, parentId) {
  const r = await db.query(
    `SELECT pe.eleve_id FROM parents_eleves pe
       JOIN eleves e ON e.id = pe.eleve_id AND e.deleted_at IS NULL
      WHERE pe.parent_id = $1`,
    [parentId]
  );
  return r.rows.map((x) => x.eleve_id);
}

async function eleveDuCompte(db, utilisateurId) {
  const r = await db.query('SELECT id FROM eleves WHERE utilisateur_id = $1 AND deleted_at IS NULL', [utilisateurId]);
  return r.rows[0] ? r.rows[0].id : null;
}

async function classeDeLEleve(db, eleveId, annee = anneeCourante()) {
  const r = await db.query('SELECT classe_id FROM inscriptions WHERE eleve_id = $1 AND annee_scolaire = $2', [eleveId, annee]);
  return r.rows[0] ? r.rows[0].classe_id : null;
}

/** Élèves visibles par l'utilisateur (null = tous). */
async function elevesVisibles(db, user, annee = anneeCourante()) {
  switch (user.role) {
    case 'admin':
    case 'comptable':
      return null;
    case 'enseignant': {
      const classes = await classesEnseignant(db, user.id, annee);
      if (!classes.length) return [];
      const r = await db.query('SELECT eleve_id FROM inscriptions WHERE classe_id = ANY($1)', [classes]);
      return r.rows.map((x) => x.eleve_id);
    }
    case 'parent':
      return enfantsParent(db, user.id);
    case 'eleve': {
      const id = await eleveDuCompte(db, user.id);
      return id ? [id] : [];
    }
    default:
      return [];
  }
}

async function peutVoirEleve(db, user, eleveId) {
  if (user.role === 'admin' || user.role === 'comptable') return true;
  if (user.role === 'parent') {
    const r = await db.query('SELECT 1 FROM parents_eleves WHERE parent_id = $1 AND eleve_id = $2', [user.id, eleveId]);
    return r.rowCount > 0;
  }
  if (user.role === 'eleve') {
    return (await eleveDuCompte(db, user.id)) === eleveId;
  }
  if (user.role === 'enseignant') {
    const r = await db.query(
      `SELECT 1 FROM inscriptions i
         JOIN classes c ON c.id = i.classe_id AND c.deleted_at IS NULL
         LEFT JOIN affectations a ON a.classe_id = c.id AND a.deleted_at IS NULL
        WHERE i.eleve_id = $2 AND (c.titulaire_id = $1 OR a.enseignant_id = $1)
        LIMIT 1`,
      [user.id, eleveId]
    );
    return r.rowCount > 0;
  }
  return false;
}

async function verifierAccesEleve(db, user, eleveId) {
  if (!(await peutVoirEleve(db, user, eleveId))) {
    throw new HttpError(403, "Vous n'avez pas accès au dossier de cet élève.");
  }
}

/** L'enseignant enseigne-t-il cette matière dans cette classe (ou en est-il titulaire) ? */
async function enseigneDans(db, enseignantId, classeId, matiereId = null) {
  const r = await db.query(
    `SELECT 1 FROM classes c
      WHERE c.id = $2 AND c.deleted_at IS NULL
        AND (c.titulaire_id = $1 OR EXISTS (
              SELECT 1 FROM affectations a
               WHERE a.classe_id = c.id AND a.enseignant_id = $1 AND a.deleted_at IS NULL
                 AND ($3::int IS NULL OR a.matiere_id = $3)))`,
    [enseignantId, classeId, matiereId]
  );
  return r.rowCount > 0;
}

async function verifierEnseignement(db, user, classeId, matiereId = null) {
  if (user.role === 'admin') return;
  if (user.role !== 'enseignant' || !(await enseigneDans(db, user.id, classeId, matiereId))) {
    throw new HttpError(403, "Cette classe ou cette matière ne vous est pas affectée.");
  }
}

async function journaliserAcces(db, req, ressource, ressourceId, detail = null) {
  await db.query('INSERT INTO journal_acces (utilisateur_id, ressource, ressource_id, detail, ip) VALUES ($1, $2, $3, $4, $5)', [
    req.user ? req.user.id : null,
    ressource,
    ressourceId,
    detail,
    req.ip || null,
  ]);
}

module.exports = {
  classesEnseignant,
  enfantsParent,
  eleveDuCompte,
  classeDeLEleve,
  elevesVisibles,
  peutVoirEleve,
  verifierAccesEleve,
  enseigneDans,
  verifierEnseignement,
  journaliserAcces,
};
