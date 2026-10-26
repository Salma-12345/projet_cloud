// Règles de la messagerie (RBAC) et envoi de messages automatiques.
const { anneeCourante } = require('./parametres');
const { classesEnseignant } = require('./acces');
const { notifier } = require('./notifications');
const { LIBELLES_ROLE } = require('../utils');

function ajouterContact(carte, u, contexte, eleve) {
  let c = carte.get(u.id);
  if (!c) {
    c = { id: u.id, nom: u.nom, prenom: u.prenom, role: u.role, libelle_role: LIBELLES_ROLE[u.role], contextes: [], eleves: [] };
    carte.set(u.id, c);
  }
  if (contexte && !c.contextes.includes(contexte)) c.contextes.push(contexte);
  if (eleve && !c.eleves.some((e) => e.id === eleve.id)) c.eleves.push(eleve);
}

async function administration(db, sauf) {
  const r = await db.query(
    `SELECT id, nom, prenom, role FROM utilisateurs
      WHERE role IN ('admin','comptable') AND actif AND deleted_at IS NULL AND id <> $1 ORDER BY role, nom`,
    [sauf]
  );
  return r.rows;
}

/**
 * Destinataires autorisés selon le rôle :
 *  - administration (admin, comptable) : tout le monde
 *  - enseignant : parents de ses élèves + administration
 *  - parent : enseignants de ses enfants + administration
 *  - élève : administration
 */
async function contactsAutorises(db, user) {
  const carte = new Map();
  const annee = anneeCourante();

  if (user.role === 'admin' || user.role === 'comptable') {
    const r = await db.query(
      `SELECT u.id, u.nom, u.prenom, u.role,
              e.id AS eleve_id, e.prenom AS eleve_prenom, e.nom AS eleve_nom,
              c.niveau, c.section
         FROM utilisateurs u
         LEFT JOIN parents_eleves pe ON pe.parent_id = u.id AND u.role = 'parent'
         LEFT JOIN eleves e ON e.deleted_at IS NULL AND ((u.role = 'parent' AND e.id = pe.eleve_id) OR (u.role = 'eleve' AND e.utilisateur_id = u.id))
         LEFT JOIN inscriptions i ON i.eleve_id = e.id AND i.annee_scolaire = $2
         LEFT JOIN classes c ON c.id = i.classe_id
        WHERE u.deleted_at IS NULL AND u.actif AND u.id <> $1
        ORDER BY u.role, u.nom, u.prenom`,
      [user.id, annee]
    );
    for (const x of r.rows) {
      const classe = x.niveau ? `${x.niveau} ${x.section}` : '';
      let contexte = null;
      let eleve = null;
      if (x.role === 'parent' && x.eleve_id) {
        contexte = `Parent de ${x.eleve_prenom} ${x.eleve_nom}${classe ? ` (${classe})` : ''}`;
        eleve = { id: x.eleve_id, nom: `${x.eleve_prenom} ${x.eleve_nom}`, classe };
      } else if (x.role === 'eleve' && x.eleve_id) {
        contexte = classe ? `Élève de ${classe}` : 'Élève';
        eleve = { id: x.eleve_id, nom: `${x.eleve_prenom} ${x.eleve_nom}`, classe };
      }
      ajouterContact(carte, x, contexte, eleve);
    }
    return [...carte.values()];
  }

  for (const u of await administration(db, user.id)) ajouterContact(carte, u, LIBELLES_ROLE[u.role]);

  if (user.role === 'enseignant') {
    const classes = await classesEnseignant(db, user.id, annee);
    if (classes.length) {
      const r = await db.query(
        `SELECT u.id, u.nom, u.prenom, u.role, pe.lien,
                e.id AS eleve_id, e.prenom AS eleve_prenom, e.nom AS eleve_nom, c.niveau, c.section
           FROM inscriptions i
           JOIN classes c ON c.id = i.classe_id
           JOIN eleves e ON e.id = i.eleve_id AND e.deleted_at IS NULL
           JOIN parents_eleves pe ON pe.eleve_id = e.id
           JOIN utilisateurs u ON u.id = pe.parent_id AND u.deleted_at IS NULL AND u.actif
          WHERE i.classe_id = ANY($1)
          ORDER BY c.niveau, c.section, e.nom, e.prenom`,
        [classes]
      );
      for (const x of r.rows) {
        const classe = `${x.niveau} ${x.section}`;
        ajouterContact(carte, x, `${x.lien} de ${x.eleve_prenom} ${x.eleve_nom} (${classe})`, {
          id: x.eleve_id,
          nom: `${x.eleve_prenom} ${x.eleve_nom}`,
          classe,
        });
      }
    }
  }

  if (user.role === 'parent') {
    const r = await db.query(
      `SELECT DISTINCT u.id, u.nom, u.prenom, u.role,
              CASE WHEN a.enseignant_id = u.id THEN m.nom END AS matiere,
              (c.titulaire_id = u.id) AS titulaire,
              e.id AS eleve_id, e.prenom AS eleve_prenom, e.nom AS eleve_nom, c.niveau, c.section
         FROM parents_eleves pe
         JOIN eleves e ON e.id = pe.eleve_id AND e.deleted_at IS NULL
         JOIN inscriptions i ON i.eleve_id = e.id AND i.annee_scolaire = $2
         JOIN classes c ON c.id = i.classe_id AND c.deleted_at IS NULL
         LEFT JOIN affectations a ON a.classe_id = c.id AND a.deleted_at IS NULL
         LEFT JOIN matieres m ON m.id = a.matiere_id
         JOIN utilisateurs u ON (u.id = a.enseignant_id OR u.id = c.titulaire_id) AND u.deleted_at IS NULL AND u.actif
        WHERE pe.parent_id = $1
        ORDER BY u.nom`,
      [user.id, annee]
    );
    for (const x of r.rows) {
      const classe = `${x.niveau} ${x.section}`;
      const role = x.titulaire ? `Enseignant(e) titulaire de ${x.eleve_prenom} (${classe})` : `Enseignant(e) de ${x.eleve_prenom} (${classe})`;
      ajouterContact(carte, x, role, { id: x.eleve_id, nom: `${x.eleve_prenom} ${x.eleve_nom}`, classe });
      const c = carte.get(x.id);
      if (x.matiere && !(c.matieres || []).includes(x.matiere)) c.matieres = [...(c.matieres || []), x.matiere];
    }
  }

  return [...carte.values()];
}

/** Envoie un message automatique (ex. après un paiement) via la messagerie interne + notifications. */
async function envoyerMessageAuto(client, opts) {
  const { expediteurId, destinataires, objet, corps, eleveId = null, contexte, refType = null, refId = null, email = true, baseUrl = '' } =
    opts;
  const ids = [...new Set(destinataires.filter(Boolean))];
  if (!ids.length) return null;
  const m = (
    await client.query(
      `INSERT INTO messages (expediteur_id, objet, corps, eleve_id, statut, automatique, envoye_at)
       VALUES ($1, $2, $3, $4, 'envoye', TRUE, now()) RETURNING *`,
      [expediteurId, objet, corps, eleveId]
    )
  ).rows[0];
  await client.query(
    `INSERT INTO messages_destinataires (message_id, destinataire_id) SELECT $1, unnest($2::int[])`,
    [m.id, ids]
  );
  // Journal : envoi via la messagerie interne (date, destinataire, statut)
  await client.query(
    `INSERT INTO journal_envois (destinataire_id, destinataire, canal, contexte, sujet, contenu, statut, ref_type, ref_id)
     SELECT u.id, u.prenom || ' ' || u.nom, 'messagerie', $2, $3, $4, 'envoye', $5, $6
       FROM utilisateurs u WHERE u.id = ANY($1)`,
    [ids, contexte, objet, corps, refType, refId]
  );
  await notifier(client, ids, {
    type: 'message',
    titre: objet,
    contenu: corps,
    lien: `/messagerie/${m.id}`,
    email,
    contexte,
    ref_type: refType,
    ref_id: refId,
    baseUrl,
  });
  return m;
}

/** Expéditeur par défaut des messages automatiques sans utilisateur connecté (tâches planifiées). */
async function expediteurSysteme(db) {
  const r = await db.query(
    `SELECT id FROM utilisateurs WHERE role IN ('comptable','admin') AND actif AND deleted_at IS NULL
      ORDER BY CASE role WHEN 'comptable' THEN 0 ELSE 1 END, id LIMIT 1`
  );
  return r.rows[0] ? r.rows[0].id : null;
}

module.exports = { contactsAutorises, envoyerMessageAuto, expediteurSysteme };
