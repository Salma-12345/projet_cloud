// Situation financière des élèves : total dû (grille tarifaire), payé, solde, retards, relances.
const { formatMontant, formatDateCourte, dateLocaleIso } = require('../utils');
const { param } = require('./parametres');

/** Situation d'un élève pour une année scolaire, avec le détail par échéance. */
async function situationEleve(db, eleveId, annee, { jusquAuPaiement = null } = {}) {
  const insc = (
    await db.query(
      `SELECT c.id, c.niveau, c.section FROM inscriptions i JOIN classes c ON c.id = i.classe_id
        WHERE i.eleve_id = $1 AND i.annee_scolaire = $2`,
      [eleveId, annee]
    )
  ).rows[0];
  const tarifs = insc
    ? (
        await db.query(
          `SELECT id, libelle, type, montant, niveau, date_echeance FROM tarifs
            WHERE annee_scolaire = $1 AND deleted_at IS NULL AND (niveau IS NULL OR niveau = $2)
            ORDER BY date_echeance NULLS FIRST, id`,
          [annee, insc.niveau]
        )
      ).rows
    : [];
  const paiements = (
    await db.query(
      `SELECT p.id, p.numero_recu, p.montant, p.date_paiement, p.mode, p.reference, p.remarque, p.tarif_id, p.recu_id,
              t.libelle AS tarif_libelle, u.prenom || ' ' || u.nom AS enregistre_par_nom
         FROM paiements p
         LEFT JOIN tarifs t ON t.id = p.tarif_id
         LEFT JOIN utilisateurs u ON u.id = p.enregistre_par
        WHERE p.eleve_id = $1 AND p.annee_scolaire = $2 AND p.deleted_at IS NULL
        ORDER BY p.date_paiement, p.id`,
      [eleveId, annee]
    )
  ).rows.filter(
    // Pour un reçu : seuls les paiements antérieurs ou égaux à celui-ci comptent
    (p) => !jusquAuPaiement || p.date_paiement < jusquAuPaiement.date || (p.date_paiement === jusquAuPaiement.date && p.id <= jusquAuPaiement.id)
  );

  const aujourdhui = dateLocaleIso();
  const totalDu = tarifs.reduce((s, t) => s + t.montant, 0);
  const totalPaye = paiements.reduce((s, p) => s + p.montant, 0);
  const duADate = tarifs.filter((t) => !t.date_echeance || t.date_echeance <= aujourdhui).reduce((s, t) => s + t.montant, 0);

  // Affectation des paiements aux échéances : d'abord les paiements ciblés, puis le reste dans l'ordre des échéances.
  const reste = new Map(tarifs.map((t) => [t.id, t.montant]));
  let libre = 0;
  for (const p of paiements) {
    if (p.tarif_id && reste.has(p.tarif_id)) {
      const pris = Math.min(reste.get(p.tarif_id), p.montant);
      reste.set(p.tarif_id, reste.get(p.tarif_id) - pris);
      libre += p.montant - pris;
    } else {
      libre += p.montant;
    }
  }
  for (const t of tarifs) {
    const pris = Math.min(reste.get(t.id), libre);
    reste.set(t.id, reste.get(t.id) - pris);
    libre -= pris;
  }
  const echeances = tarifs.map((t) => {
    const r = Math.round(reste.get(t.id) * 1000) / 1000;
    return {
      ...t,
      paye: Math.round((t.montant - r) * 1000) / 1000,
      reste: r,
      en_retard: r > 0 && Boolean(t.date_echeance) && t.date_echeance < aujourdhui,
      statut: r <= 0 ? 'payee' : r < t.montant ? 'partielle' : 'due',
    };
  });

  const r3 = (v) => Math.round(v * 1000) / 1000;
  return {
    eleve_id: eleveId,
    annee_scolaire: annee,
    classe: insc ? `${insc.niveau} ${insc.section}` : null,
    total_du: r3(totalDu),
    total_paye: r3(totalPaye),
    solde: r3(totalDu - totalPaye),
    du_a_date: r3(duADate),
    retard: r3(Math.max(0, duADate - totalPaye)),
    echeances,
    paiements,
  };
}

/** Liste des élèves avec leur situation (pour le suivi des impayés). */
async function situationsAnnee(db, annee, { seulementImpayes = false } = {}) {
  const r = await db.query(
    `WITH ins AS (
        SELECT i.eleve_id, c.id AS classe_id, c.niveau, c.niveau || ' ' || c.section AS classe
          FROM inscriptions i JOIN classes c ON c.id = i.classe_id AND c.deleted_at IS NULL
         WHERE i.annee_scolaire = $1
     ), du AS (
        SELECT ins.eleve_id,
               COALESCE(SUM(t.montant), 0) AS total_du,
               COALESCE(SUM(t.montant) FILTER (WHERE t.date_echeance IS NULL OR t.date_echeance <= CURRENT_DATE), 0) AS du_a_date,
               MIN(t.date_echeance) FILTER (WHERE t.date_echeance <= CURRENT_DATE) AS premiere_echeance
          FROM ins
          LEFT JOIN tarifs t ON t.annee_scolaire = $1 AND t.deleted_at IS NULL AND (t.niveau IS NULL OR t.niveau = ins.niveau)
         GROUP BY ins.eleve_id
     ), paye AS (
        SELECT eleve_id, SUM(montant) AS total_paye
          FROM paiements WHERE annee_scolaire = $1 AND deleted_at IS NULL GROUP BY eleve_id
     )
     SELECT e.id, e.nom, e.prenom, e.matricule, ins.classe, ins.classe_id,
            du.total_du, du.du_a_date, COALESCE(paye.total_paye, 0) AS total_paye,
            du.total_du - COALESCE(paye.total_paye, 0) AS solde,
            GREATEST(du.du_a_date - COALESCE(paye.total_paye, 0), 0) AS retard,
            (SELECT MAX(created_at) FROM relances r WHERE r.eleve_id = e.id AND r.annee_scolaire = $1) AS derniere_relance,
            (SELECT COUNT(*)::int FROM relances r WHERE r.eleve_id = e.id AND r.annee_scolaire = $1) AS nb_relances
       FROM ins
       JOIN eleves e ON e.id = ins.eleve_id AND e.deleted_at IS NULL AND e.statut = 'actif'
       JOIN du ON du.eleve_id = e.id
       LEFT JOIN paye ON paye.eleve_id = e.id
      ORDER BY ins.classe, e.nom, e.prenom`,
    [annee]
  );
  const lignes = r.rows.map((x) => ({
    ...x,
    total_du: Number(x.total_du),
    du_a_date: Number(x.du_a_date),
    total_paye: Number(x.total_paye),
    solde: Math.round(Number(x.solde) * 1000) / 1000,
    retard: Math.round(Number(x.retard) * 1000) / 1000,
  }));
  return seulementImpayes ? lignes.filter((l) => l.solde > 0) : lignes;
}

/**
 * Relances automatiques des impayés : un message est envoyé aux parents des élèves
 * en retard de paiement (au plus une relance tous les `intervalleJours`).
 */
async function envoyerRelances(client, { annee, expediteurId, automatique, intervalleJours, baseUrl = '' }) {
  const { envoyerMessageAuto } = require('./messagerie');
  const lignes = (await situationsAnnee(client, annee)).filter((l) => l.retard > 0);
  const devise = param('devise', 'DT');
  let nb = 0;
  for (const l of lignes) {
    if (l.derniere_relance && Date.now() - new Date(l.derniere_relance).getTime() < intervalleJours * 24 * 3600 * 1000) continue;
    const parents = (await client.query('SELECT parent_id FROM parents_eleves WHERE eleve_id = $1', [l.id])).rows.map((x) => x.parent_id);
    if (!parents.length) continue;
    const situation = await situationEleve(client, l.id, annee);
    const enRetard = situation.echeances.filter((e) => e.en_retard);
    const detail = enRetard.map((e) => `  • ${e.libelle} (échéance du ${formatDateCourte(e.date_echeance)}) : reste ${formatMontant(e.reste, devise)}`).join('\n');
    const corps =
      `Bonjour,\n\nSauf erreur de notre part, le compte de ${l.prenom} ${l.nom} (${l.classe}) présente un retard de paiement de ` +
      `${formatMontant(l.retard, devise)}.\n\n${detail ? `Échéances concernées :\n${detail}\n\n` : ''}` +
      `Solde restant pour l'année ${annee} : ${formatMontant(l.solde, devise)}.\n\n` +
      `Merci de régulariser la situation auprès du secrétariat (espèces, virement ou mobile money). ` +
      `Si le paiement a déjà été effectué, veuillez ne pas tenir compte de ce message.\n\nLe service comptabilité`;
    const m = await envoyerMessageAuto(client, {
      expediteurId,
      destinataires: parents,
      objet: `Rappel de paiement – ${l.prenom} ${l.nom}`,
      corps,
      eleveId: l.id,
      contexte: 'relance',
      refType: 'eleve',
      refId: l.id,
      email: true,
      baseUrl,
    });
    if (m) {
      await client.query('INSERT INTO relances (eleve_id, montant_du, annee_scolaire, automatique) VALUES ($1, $2, $3, $4)', [
        l.id,
        l.retard,
        annee,
        automatique,
      ]);
      nb += 1;
    }
  }
  return nb;
}

module.exports = { situationEleve, situationsAnnee, envoyerRelances };
