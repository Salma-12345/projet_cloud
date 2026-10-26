// Calcul des moyennes (par matière, générale avec coefficients) et des rangs.
const { HttpError } = require('../utils');

const arrondi = (v, d = 2) => (v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d);

function appreciation(moyenne) {
  if (moyenne === null || moyenne === undefined) return '—';
  if (moyenne >= 18) return 'Excellent';
  if (moyenne >= 16) return 'Très bien';
  if (moyenne >= 14) return 'Bien';
  if (moyenne >= 12) return 'Assez bien';
  if (moyenne >= 10) return 'Passable';
  return 'Insuffisant';
}

/** Bornes de dates d'un trimestre pour une année scolaire « AAAA-AAAA ». */
function periodeTrimestre(annee, trimestre) {
  const [a1, a2] = annee.split('-').map(Number);
  if (trimestre === 1) return { debut: `${a1}-09-01`, fin: `${a1}-12-31` };
  if (trimestre === 2) return { debut: `${a2}-01-01`, fin: `${a2}-03-31` };
  return { debut: `${a2}-04-01`, fin: `${a2}-07-31` };
}

function trimestreDeDate(dateIso) {
  const m = Number(dateIso.slice(5, 7));
  if (m >= 9) return 1;
  if (m <= 3) return 2;
  return 3;
}

async function matieresDeClasse(db, classe) {
  const r = await db.query(
    `SELECT id, nom, coefficient, niveau FROM matieres
      WHERE deleted_at IS NULL AND (niveau IS NULL OR niveau = $1)
      UNION
     SELECT m.id, m.nom, m.coefficient, m.niveau FROM matieres m
       JOIN evaluations ev ON ev.matiere_id = m.id AND ev.classe_id = $2 AND ev.deleted_at IS NULL
     ORDER BY coefficient DESC, nom`,
    [classe.niveau, classe.id]
  );
  return r.rows;
}

/**
 * Résultats d'une classe pour un trimestre :
 *  moyenne matière = moyenne des notes ramenées sur 20 ;
 *  moyenne générale = Σ (moyenne matière × coefficient) / Σ coefficients des matières notées ;
 *  rang = position selon la moyenne générale (ex aequo possibles).
 */
async function resultatsClasse(db, classeId, trimestre) {
  const classe = (await db.query('SELECT * FROM classes WHERE id = $1', [classeId])).rows[0];
  if (!classe) throw new HttpError(404, 'Classe introuvable.');
  const matieres = await matieresDeClasse(db, classe);
  const eleves = (
    await db.query(
      `SELECT e.id, e.nom, e.prenom, e.matricule, e.date_naissance, e.sexe
         FROM inscriptions i JOIN eleves e ON e.id = i.eleve_id AND e.deleted_at IS NULL
        WHERE i.classe_id = $1 ORDER BY e.nom, e.prenom`,
      [classeId]
    )
  ).rows;
  const moy = (
    await db.query(
      `SELECT n.eleve_id, ev.matiere_id, AVG(n.valeur / ev.bareme * 20) AS moyenne, COUNT(*)::int AS nb
         FROM notes n JOIN evaluations ev ON ev.id = n.evaluation_id
        WHERE ev.classe_id = $1 AND ev.trimestre = $2 AND n.deleted_at IS NULL AND ev.deleted_at IS NULL
        GROUP BY n.eleve_id, ev.matiere_id`,
      [classeId, trimestre]
    )
  ).rows;

  const parEleve = new Map(eleves.map((e) => [e.id, {}]));
  for (const m of moy) if (parEleve.has(m.eleve_id)) parEleve.get(m.eleve_id)[m.matiere_id] = { moyenne: m.moyenne, nb: m.nb };

  const lignes = eleves.map((e) => {
    const notes = parEleve.get(e.id);
    let somme = 0;
    let coefs = 0;
    const parMatiere = {};
    for (const m of matieres) {
      const v = notes[m.id];
      parMatiere[m.id] = v ? arrondi(v.moyenne) : null;
      if (v) {
        somme += v.moyenne * m.coefficient;
        coefs += m.coefficient;
      }
    }
    const generale = coefs > 0 ? somme / coefs : null;
    return { eleve: e, moyennes: parMatiere, generale_brute: generale, moyenne_generale: arrondi(generale), total_coefficients: coefs };
  });

  const notees = lignes.filter((l) => l.generale_brute !== null);
  for (const l of lignes) {
    l.rang = l.generale_brute === null ? null : 1 + notees.filter((o) => o.generale_brute > l.generale_brute + 1e-9).length;
    l.appreciation = appreciation(l.moyenne_generale);
  }

  const stats = {};
  for (const m of matieres) {
    const vals = lignes.map((l) => l.moyennes[m.id]).filter((v) => v !== null);
    stats[m.id] = vals.length
      ? { moyenne: arrondi(vals.reduce((a, b) => a + b, 0) / vals.length), min: Math.min(...vals), max: Math.max(...vals) }
      : { moyenne: null, min: null, max: null };
  }
  const gen = notees.map((l) => l.generale_brute);
  const statsGenerale = gen.length
    ? { moyenne: arrondi(gen.reduce((a, b) => a + b, 0) / gen.length), min: arrondi(Math.min(...gen)), max: arrondi(Math.max(...gen)) }
    : { moyenne: null, min: null, max: null };

  for (const l of lignes) delete l.generale_brute;
  return { classe, trimestre, matieres, lignes, stats, stats_generale: statsGenerale, effectif: eleves.length };
}

/** Bulletin complet d'un élève (trimestre, année). */
async function bulletinEleve(db, eleveId, annee, trimestre) {
  const eleve = (
    await db.query(
      `SELECT id, matricule, nom, prenom, date_naissance, lieu_naissance, sexe FROM eleves WHERE id = $1 AND deleted_at IS NULL`,
      [eleveId]
    )
  ).rows[0];
  if (!eleve) throw new HttpError(404, 'Élève introuvable.');
  const insc = (await db.query('SELECT classe_id FROM inscriptions WHERE eleve_id = $1 AND annee_scolaire = $2', [eleveId, annee])).rows[0];
  if (!insc) throw new HttpError(404, `Aucune inscription pour l’année ${annee}.`);
  const res = await resultatsClasse(db, insc.classe_id, trimestre);
  const ligne = res.lignes.find((l) => l.eleve.id === eleveId);
  const titulaire = res.classe.titulaire_id
    ? (await db.query('SELECT nom, prenom FROM utilisateurs WHERE id = $1', [res.classe.titulaire_id])).rows[0]
    : null;

  const details = (
    await db.query(
      `SELECT ev.id, ev.titre, ev.type, ev.date_evaluation, ev.bareme, ev.matiere_id, n.valeur, n.commentaire
         FROM evaluations ev
         LEFT JOIN notes n ON n.evaluation_id = ev.id AND n.eleve_id = $1 AND n.deleted_at IS NULL
        WHERE ev.classe_id = $2 AND ev.trimestre = $3 AND ev.deleted_at IS NULL
        ORDER BY ev.date_evaluation, ev.id`,
      [eleveId, insc.classe_id, trimestre]
    )
  ).rows;

  const { debut, fin } = periodeTrimestre(annee, trimestre);
  const abs = (
    await db.query(
      `SELECT COUNT(*) FILTER (WHERE statut = 'justifiee')::int AS justifiees,
              COUNT(*) FILTER (WHERE statut <> 'justifiee')::int AS non_justifiees
         FROM absences WHERE eleve_id = $1 AND deleted_at IS NULL AND date_absence BETWEEN $2 AND $3`,
      [eleveId, debut, fin]
    )
  ).rows[0];

  const matieres = res.matieres.map((m) => ({
    id: m.id,
    nom: m.nom,
    coefficient: m.coefficient,
    moyenne: ligne ? ligne.moyennes[m.id] : null,
    moyenne_classe: res.stats[m.id].moyenne,
    min: res.stats[m.id].min,
    max: res.stats[m.id].max,
    appreciation: appreciation(ligne ? ligne.moyennes[m.id] : null),
    evaluations: details.filter((d) => d.matiere_id === m.id),
  }));

  return {
    eleve,
    annee_scolaire: annee,
    trimestre,
    classe: { id: res.classe.id, niveau: res.classe.niveau, section: res.classe.section, nom: `${res.classe.niveau} ${res.classe.section}` },
    titulaire,
    matieres,
    moyenne_generale: ligne ? ligne.moyenne_generale : null,
    rang: ligne ? ligne.rang : null,
    effectif: res.effectif,
    appreciation: ligne ? ligne.appreciation : '—',
    stats_generale: res.stats_generale,
    absences: abs,
  };
}

module.exports = { resultatsClasse, bulletinEleve, appreciation, arrondi, periodeTrimestre, trimestreDeDate, matieresDeClasse };
