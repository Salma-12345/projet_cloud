// Tableaux de bord par rôle.
const express = require('express');
const db = require('../db');
const { anneeCourante } = require('../services/parametres');
const { dateLocaleIso } = require('../utils');
const { classesEnseignant, enfantsParent, eleveDuCompte, classeDeLEleve } = require('../services/acces');
const { situationsAnnee, situationEleve } = require('../services/finances');
const { bulletinEleve, trimestreDeDate } = require('../services/notes');

const router = express.Router();

/** Jour de classe affiché : aujourd'hui, ou lundi si l'on est dimanche. */
function jourDeClasse() {
  const j = new Date().getDay(); // 0 = dimanche
  return { jour: j === 0 ? 1 : j, aujourdhui: j !== 0 };
}

async function coursDuJour(conditionSql, params) {
  const r = await db.query(
    `SELECT cr.id, to_char(cr.heure_debut, 'HH24:MI') AS heure_debut, to_char(cr.heure_fin, 'HH24:MI') AS heure_fin,
            m.nom AS matiere, c.niveau || ' ' || c.section AS classe, s.nom AS salle, u.prenom || ' ' || u.nom AS enseignant
       FROM creneaux cr JOIN matieres m ON m.id = cr.matiere_id JOIN classes c ON c.id = cr.classe_id
       LEFT JOIN salles s ON s.id = cr.salle_id JOIN utilisateurs u ON u.id = cr.enseignant_id
      WHERE cr.deleted_at IS NULL AND cr.annee_scolaire = $1 AND cr.jour = $2 AND ${conditionSql}
      ORDER BY cr.heure_debut`,
    [anneeCourante(), jourDeClasse().jour, ...params]
  );
  return r.rows;
}

async function resumeFinances(annee) {
  const lignes = await situationsAnnee(db, annee);
  const du = lignes.reduce((s, l) => s + l.total_du, 0);
  const paye = lignes.reduce((s, l) => s + l.total_paye, 0);
  return {
    total_du: du,
    total_encaisse: paye,
    reste_a_recouvrer: lignes.reduce((s, l) => s + Math.max(l.solde, 0), 0),
    total_en_retard: lignes.reduce((s, l) => s + l.retard, 0),
    nb_en_retard: lignes.filter((l) => l.retard > 0).length,
    taux_recouvrement: du > 0 ? Math.round((paye / du) * 1000) / 10 : 0,
    retards: lignes.filter((l) => l.retard > 0).sort((a, b) => b.retard - a.retard).slice(0, 6),
  };
}

async function derniersPaiements(annee, limite = 6) {
  return (
    await db.query(
      `SELECT p.id, p.numero_recu, p.montant, p.date_paiement, p.mode, e.prenom || ' ' || e.nom AS eleve, p.eleve_id
         FROM paiements p JOIN eleves e ON e.id = p.eleve_id
        WHERE p.annee_scolaire = $1 AND p.deleted_at IS NULL ORDER BY p.created_at DESC, p.id DESC LIMIT $2`,
      [annee, limite]
    )
  ).rows;
}

router.get('/', async (req, res) => {
  const annee = anneeCourante();
  const aujourdhui = dateLocaleIso();
  const u = req.user;

  if (u.role === 'admin' || u.role === 'comptable') {
    const compteurs = await db.un(
      `SELECT (SELECT COUNT(*)::int FROM inscriptions i JOIN eleves e ON e.id = i.eleve_id AND e.deleted_at IS NULL AND e.statut = 'actif'
                WHERE i.annee_scolaire = $1) AS eleves,
              (SELECT COUNT(*)::int FROM eleves e WHERE e.deleted_at IS NULL AND e.statut = 'actif'
                AND NOT EXISTS (SELECT 1 FROM inscriptions i WHERE i.eleve_id = e.id AND i.annee_scolaire = $1)) AS eleves_sans_classe,
              (SELECT COUNT(*)::int FROM classes WHERE annee_scolaire = $1 AND deleted_at IS NULL) AS classes,
              (SELECT COUNT(*)::int FROM utilisateurs WHERE role = 'enseignant' AND deleted_at IS NULL AND actif) AS enseignants,
              (SELECT COUNT(*)::int FROM utilisateurs WHERE role = 'parent' AND deleted_at IS NULL AND actif) AS parents,
              (SELECT COUNT(*)::int FROM preinscriptions WHERE statut = 'en_attente' AND deleted_at IS NULL) AS preinscriptions,
              (SELECT COUNT(*)::int FROM absences WHERE date_absence = $2 AND deleted_at IS NULL) AS absences_jour,
              (SELECT COUNT(*)::int FROM absences WHERE statut = 'en_attente' AND deleted_at IS NULL) AS justificatifs_attente`,
      [annee, aujourdhui]
    );
    const effectifs = (
      await db.query(
        `SELECT c.id, c.niveau || ' ' || c.section AS classe, c.capacite_max,
                (SELECT COUNT(*)::int FROM inscriptions i JOIN eleves e ON e.id = i.eleve_id AND e.deleted_at IS NULL WHERE i.classe_id = c.id) AS effectif
           FROM classes c WHERE c.annee_scolaire = $1 AND c.deleted_at IS NULL
          ORDER BY array_position(ARRAY['CP','CE1','CE2','CM1','CM2'], c.niveau), c.section`,
        [annee]
      )
    ).rows;
    const activite =
      u.role === 'admin'
        ? (
            await db.query(
              `SELECT j.id, j.action, j.entite, j.entite_id, j.created_at, uu.prenom || ' ' || uu.nom AS utilisateur
                 FROM journal_audit j LEFT JOIN utilisateurs uu ON uu.id = j.utilisateur_id
                WHERE j.action <> 'connexion' ORDER BY j.id DESC LIMIT 8`
            )
          ).rows
        : [];
    return res.json({
      role: u.role,
      annee,
      compteurs,
      effectifs,
      finances: await resumeFinances(annee),
      derniers_paiements: await derniersPaiements(annee),
      activite,
    });
  }

  if (u.role === 'enseignant') {
    const classes = await classesEnseignant(db, u.id, annee);
    const mesClasses = (
      await db.query(
        `SELECT c.id, c.niveau || ' ' || c.section AS classe, (c.titulaire_id = $2) AS titulaire,
                (SELECT COUNT(*)::int FROM inscriptions i WHERE i.classe_id = c.id) AS effectif,
                (SELECT string_agg(m.nom, ', ' ORDER BY m.nom) FROM affectations a JOIN matieres m ON m.id = a.matiere_id
                  WHERE a.classe_id = c.id AND a.enseignant_id = $2 AND a.deleted_at IS NULL) AS matieres
           FROM classes c WHERE c.id = ANY($1)
          ORDER BY array_position(ARRAY['CP','CE1','CE2','CM1','CM2'], c.niveau), c.section`,
        [classes, u.id]
      )
    ).rows;
    const devoirs = (
      await db.query(
        `SELECT d.id, d.titre, d.date_remise, m.nom AS matiere, c.niveau || ' ' || c.section AS classe,
                (SELECT COUNT(*)::int FROM soumissions s WHERE s.devoir_id = d.id) AS nb_rendus,
                (SELECT COUNT(*)::int FROM soumissions s WHERE s.devoir_id = d.id AND s.note IS NULL) AS a_corriger,
                (SELECT COUNT(*)::int FROM inscriptions i WHERE i.classe_id = d.classe_id) AS effectif
           FROM devoirs d JOIN matieres m ON m.id = d.matiere_id JOIN classes c ON c.id = d.classe_id
          WHERE d.deleted_at IS NULL AND d.enseignant_id = $1 AND d.annee_scolaire = $2
          ORDER BY d.date_remise DESC LIMIT 6`,
        [u.id, annee]
      )
    ).rows;
    const evaluationsSansNotes = (
      await db.query(
        `SELECT ev.id, ev.titre, ev.date_evaluation, m.nom AS matiere, c.niveau || ' ' || c.section AS classe
           FROM evaluations ev JOIN matieres m ON m.id = ev.matiere_id JOIN classes c ON c.id = ev.classe_id
          WHERE ev.deleted_at IS NULL AND ev.annee_scolaire = $2 AND ev.classe_id = ANY($1)
            AND (ev.enseignant_id = $3 OR EXISTS (SELECT 1 FROM affectations a WHERE a.classe_id = ev.classe_id AND a.matiere_id = ev.matiere_id AND a.enseignant_id = $3 AND a.deleted_at IS NULL))
            AND (SELECT COUNT(*) FROM notes n WHERE n.evaluation_id = ev.id AND n.deleted_at IS NULL)
                < (SELECT COUNT(*) FROM inscriptions i WHERE i.classe_id = ev.classe_id)
          ORDER BY ev.date_evaluation DESC LIMIT 5`,
        [classes, annee, u.id]
      )
    ).rows;
    const justificatifs = (
      await db.un(
        `SELECT COUNT(*)::int AS n FROM absences a JOIN inscriptions i ON i.eleve_id = a.eleve_id AND i.annee_scolaire = a.annee_scolaire
          WHERE a.statut = 'en_attente' AND a.deleted_at IS NULL AND i.classe_id = ANY($1)`,
        [classes]
      )
    ).n;
    return res.json({
      role: u.role,
      annee,
      classes: mesClasses,
      cours_du_jour: await coursDuJour('cr.enseignant_id = $3', [u.id]),
      jour_cours: jourDeClasse(),
      devoirs,
      evaluations_a_completer: evaluationsSansNotes,
      justificatifs_attente: justificatifs,
    });
  }

  const trimestre = trimestreDeDate(aujourdhui);
  const annonces = (
    await db.query(
      `SELECT id, titre, contenu, publiee_at, corrige_id FROM annonces
        WHERE statut = 'publiee' AND deleted_at IS NULL AND audience = ANY($1) ORDER BY publiee_at DESC LIMIT 3`,
      [u.role === 'parent' ? ['tous', 'parents'] : ['tous', 'eleves']]
    )
  ).rows;

  if (u.role === 'parent') {
    const enfants = [];
    for (const id of await enfantsParent(db, u.id)) {
      const e = await db.un('SELECT id, nom, prenom, photo_id, sexe FROM eleves WHERE id = $1', [id]);
      const classeId = await classeDeLEleve(db, id, annee);
      let bulletin = null;
      if (classeId) bulletin = await bulletinEleve(db, id, annee, trimestre).catch(() => null);
      const situation = await situationEleve(db, id, annee);
      const devoirs = classeId
        ? (
            await db.query(
              `SELECT d.id, d.titre, d.date_remise, m.nom AS matiere,
                      (SELECT depose_at FROM soumissions s WHERE s.devoir_id = d.id AND s.eleve_id = $2) AS depose_at
                 FROM devoirs d JOIN matieres m ON m.id = d.matiere_id
                WHERE d.classe_id = $1 AND d.deleted_at IS NULL AND d.date_remise >= now()
                ORDER BY d.date_remise LIMIT 4`,
              [classeId, id]
            )
          ).rows
        : [];
      const abs = await db.un(
        `SELECT COUNT(*) FILTER (WHERE statut IN ('non_justifiee','refusee'))::int AS non_justifiees,
                COUNT(*) FILTER (WHERE statut = 'en_attente')::int AS en_attente
           FROM absences WHERE eleve_id = $1 AND annee_scolaire = $2 AND deleted_at IS NULL`,
        [id, annee]
      );
      enfants.push({
        ...e,
        classe: bulletin ? bulletin.classe.nom : null,
        trimestre,
        moyenne_generale: bulletin ? bulletin.moyenne_generale : null,
        rang: bulletin ? bulletin.rang : null,
        effectif: bulletin ? bulletin.effectif : null,
        solde: situation.solde,
        retard: situation.retard,
        devoirs_a_venir: devoirs,
        absences: abs,
      });
    }
    return res.json({ role: u.role, annee, trimestre, enfants, annonces });
  }

  // Élève
  const eleveId = await eleveDuCompte(db, u.id);
  const classeId = eleveId ? await classeDeLEleve(db, eleveId, annee) : null;
  const devoirs = classeId
    ? (
        await db.query(
          `SELECT d.id, d.titre, d.date_remise, m.nom AS matiere,
                  s.depose_at, s.note, s.note_publiee_at, d.bareme
             FROM devoirs d JOIN matieres m ON m.id = d.matiere_id
             LEFT JOIN soumissions s ON s.devoir_id = d.id AND s.eleve_id = $2
            WHERE d.classe_id = $1 AND d.deleted_at IS NULL AND (d.date_remise >= now() - INTERVAL '10 days')
            ORDER BY d.date_remise LIMIT 6`,
          [classeId, eleveId]
        )
      ).rows.map((d) => ({ ...d, note: d.note_publiee_at ? d.note : null }))
    : [];
  res.json({
    role: u.role,
    annee,
    trimestre,
    cours_du_jour: classeId ? await coursDuJour('cr.classe_id = $3', [classeId]) : [],
    jour_cours: jourDeClasse(),
    devoirs,
    annonces,
  });
});

module.exports = router;
