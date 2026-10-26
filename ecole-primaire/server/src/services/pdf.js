// Génération des PDF : reçus de paiement et bulletins scolaires (pdfkit).
const PDFDocument = require('pdfkit');
const { formatMontant, formatDate, formatDateCourte, LIBELLES_MODE } = require('../utils');
const { param } = require('./parametres');

const COULEUR = '#1f4e5f';
const ENCRE = '#1d2433';
const GRIS = '#5b6472';
const LIGNE = '#d5dbe3';
const FOND = '#f3f6f8';

function versBuffer(doc) {
  return new Promise((resolve, reject) => {
    const morceaux = [];
    doc.on('data', (c) => morceaux.push(c));
    doc.on('end', () => resolve(Buffer.concat(morceaux)));
    doc.on('error', reject);
    doc.end();
  });
}

const nombre = (v, d = 2) => (v === null || v === undefined ? '—' : Number(v).toFixed(d).replace('.', ','));

function entete(doc, titre, sousTitre) {
  const L = doc.page.margins.left;
  const largeur = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.rect(0, 0, doc.page.width, 8).fill(COULEUR);
  doc.fillColor(COULEUR).font('Helvetica-Bold').fontSize(15).text(param('nom_ecole'), L, 34, { width: largeur * 0.6 });
  doc
    .fillColor(GRIS)
    .font('Helvetica')
    .fontSize(9)
    .text(param('adresse_ecole') || '', L, doc.y + 2, { width: largeur * 0.6 })
    .text(`Tél. ${param('telephone_ecole') || ''}  ·  ${param('email_ecole') || ''}`, { width: largeur * 0.6 });
  doc
    .fillColor(ENCRE)
    .font('Helvetica-Bold')
    .fontSize(13)
    .text(titre, L + largeur * 0.55, 34, { width: largeur * 0.45, align: 'right' });
  if (sousTitre) {
    doc.fillColor(GRIS).font('Helvetica').fontSize(9.5).text(sousTitre, L + largeur * 0.55, doc.y + 2, { width: largeur * 0.45, align: 'right' });
  }
  doc.moveTo(L, 96).lineTo(L + largeur, 96).lineWidth(1).strokeColor(LIGNE).stroke();
  doc.y = 110;
}

function blocInfos(doc, titre, paires, x, y, largeur) {
  doc.fillColor(GRIS).font('Helvetica-Bold').fontSize(8.5).text(titre.toUpperCase(), x, y, { width: largeur, characterSpacing: 0.6 });
  let cy = doc.y + 6;
  for (const [cle, val] of paires) {
    doc.fillColor(GRIS).font('Helvetica').fontSize(9.5).text(cle, x, cy, { width: largeur * 0.42 });
    doc.fillColor(ENCRE).font('Helvetica-Bold').fontSize(9.5).text(val || '—', x + largeur * 0.42, cy, { width: largeur * 0.58 });
    cy = Math.max(doc.y, cy + 14) + 3;
  }
  return cy;
}

/** Reçu de paiement. */
async function pdfRecu({ paiement, eleve, classe, situation, enregistrePar }) {
  const devise = param('devise', 'DT');
  const doc = new PDFDocument({
    size: 'A4',
    margin: 48,
    info: { Title: `Reçu ${paiement.numero_recu}`, Author: param('nom_ecole') },
  });
  const L = doc.page.margins.left;
  const largeur = doc.page.width - 96;
  entete(doc, 'REÇU DE PAIEMENT', `N° ${paiement.numero_recu}\nÉmis le ${formatDate(paiement.date_paiement)}`);

  const y0 = doc.y + 6;
  const colG = blocInfos(
    doc,
    'Élève',
    [
      ['Nom et prénom', `${eleve.prenom} ${eleve.nom}`],
      ['Matricule', eleve.matricule],
      ['Classe', classe || '—'],
      ['Année scolaire', paiement.annee_scolaire],
    ],
    L,
    y0,
    largeur * 0.48
  );
  const colD = blocInfos(
    doc,
    'Paiement',
    [
      ['Date', formatDate(paiement.date_paiement)],
      ['Mode', LIBELLES_MODE[paiement.mode] || paiement.mode],
      ['Référence', paiement.reference || '—'],
      ['Objet', paiement.tarif_libelle || 'Frais de scolarité'],
    ],
    L + largeur * 0.52,
    y0,
    largeur * 0.48
  );

  let y = Math.max(colG, colD) + 14;
  doc.roundedRect(L, y, largeur, 64, 6).fill(FOND);
  doc.fillColor(GRIS).font('Helvetica').fontSize(10).text('Montant reçu', L + 18, y + 14);
  doc.fillColor(COULEUR).font('Helvetica-Bold').fontSize(24).text(formatMontant(paiement.montant, devise), L + 18, y + 28, { width: largeur - 36 });
  y += 84;

  doc.fillColor(GRIS).font('Helvetica-Bold').fontSize(8.5).text(`SITUATION DU COMPTE — ANNÉE ${paiement.annee_scolaire}`, L, y, { characterSpacing: 0.6 });
  y = doc.y + 8;
  const lignes = [
    ['Total dû pour l’année', formatMontant(situation.total_du, devise)],
    ['Total payé (ce paiement inclus)', formatMontant(situation.total_paye, devise)],
    ['Nouveau solde restant', formatMontant(situation.solde, devise)],
  ];
  for (const [i, [cle, val]] of lignes.entries()) {
    const gras = i === lignes.length - 1;
    doc.moveTo(L, y).lineTo(L + largeur, y).lineWidth(0.6).strokeColor(LIGNE).stroke();
    doc.fillColor(gras ? ENCRE : GRIS).font(gras ? 'Helvetica-Bold' : 'Helvetica').fontSize(10.5).text(cle, L, y + 8, { width: largeur * 0.6 });
    doc.fillColor(ENCRE).font('Helvetica-Bold').fontSize(10.5).text(val, L + largeur * 0.6, y + 8, { width: largeur * 0.4, align: 'right' });
    y += 28;
  }
  doc.moveTo(L, y).lineTo(L + largeur, y).lineWidth(0.6).strokeColor(LIGNE).stroke();

  if (situation.echeances && situation.echeances.length) {
    y += 18;
    doc.fillColor(GRIS).font('Helvetica-Bold').fontSize(8.5).text('DÉTAIL DES ÉCHÉANCES', L, y, { characterSpacing: 0.6 });
    y = doc.y + 6;
    for (const e of situation.echeances) {
      const statut = e.statut === 'payee' ? 'Réglée' : e.statut === 'partielle' ? 'Partielle' : 'À payer';
      doc.fillColor(ENCRE).font('Helvetica').fontSize(9.5).text(e.libelle, L, y, { width: largeur * 0.42 });
      doc.fillColor(GRIS).text(e.date_echeance ? `Échéance ${formatDateCourte(e.date_echeance)}` : '', L + largeur * 0.42, y, { width: largeur * 0.22 });
      doc.fillColor(ENCRE).text(formatMontant(e.montant, devise), L + largeur * 0.64, y, { width: largeur * 0.2, align: 'right' });
      doc.fillColor(e.statut === 'payee' ? '#1d7a46' : '#9a5b00').font('Helvetica-Bold').text(statut, L + largeur * 0.84, y, { width: largeur * 0.16, align: 'right' });
      y += 17;
    }
  }

  y = Math.max(y + 30, 640);
  doc.fillColor(GRIS).font('Helvetica').fontSize(9).text('Cachet et signature', L + largeur * 0.62, y, { width: largeur * 0.38, align: 'center' });
  doc.rect(L + largeur * 0.62, y + 14, largeur * 0.38, 70).lineWidth(0.6).strokeColor(LIGNE).stroke();

  const maintenant = new Date();
  doc
    .fillColor(GRIS)
    .fontSize(8)
    .text(
      `Reçu généré automatiquement le ${formatDateCourte(maintenant.toISOString())} à ${maintenant.toTimeString().slice(0, 5)}` +
        `${enregistrePar ? ` · Paiement enregistré par ${enregistrePar}` : ''}. Ce document fait foi de paiement.`,
      L,
      doc.page.height - 70,
      { width: largeur, align: 'center' }
    );
  return versBuffer(doc);
}

/** Bulletin scolaire trimestriel. */
async function pdfBulletin(b) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    info: { Title: `Bulletin ${b.eleve.prenom} ${b.eleve.nom} T${b.trimestre}`, Author: param('nom_ecole') },
  });
  const L = doc.page.margins.left;
  const largeur = doc.page.width - 80;
  entete(doc, 'BULLETIN SCOLAIRE', `Trimestre ${b.trimestre}  ·  Année ${b.annee_scolaire}`);

  const y0 = doc.y + 2;
  const colG = blocInfos(
    doc,
    'Élève',
    [
      ['Nom et prénom', `${b.eleve.prenom} ${b.eleve.nom}`],
      ['Matricule', b.eleve.matricule],
      [b.eleve.sexe === 'F' ? 'Née le' : b.eleve.sexe === 'M' ? 'Né le' : 'Né(e) le', `${formatDate(b.eleve.date_naissance)}${b.eleve.lieu_naissance ? ` à ${b.eleve.lieu_naissance}` : ''}`],
    ],
    L,
    y0,
    largeur * 0.5
  );
  const colD = blocInfos(
    doc,
    'Classe',
    [
      ['Classe', b.classe.nom],
      ['Titulaire', b.titulaire ? `${b.titulaire.prenom} ${b.titulaire.nom}` : '—'],
      ['Effectif', String(b.effectif)],
    ],
    L + largeur * 0.54,
    y0,
    largeur * 0.46
  );

  // Tableau des moyennes
  let y = Math.max(colG, colD) + 12;
  const cols = [
    { titre: 'Matière', l: 0.3, align: 'left' },
    { titre: 'Coef.', l: 0.08, align: 'center' },
    { titre: 'Moyenne /20', l: 0.13, align: 'center' },
    { titre: 'Moy. classe', l: 0.12, align: 'center' },
    { titre: 'Min', l: 0.08, align: 'center' },
    { titre: 'Max', l: 0.08, align: 'center' },
    { titre: 'Appréciation', l: 0.21, align: 'left' },
  ];
  const hauteurLigne = 22;
  doc.rect(L, y, largeur, hauteurLigne).fill(COULEUR);
  let x = L;
  for (const c of cols) {
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5).text(c.titre, x + 6, y + 7, { width: c.l * largeur - 12, align: c.align });
    x += c.l * largeur;
  }
  y += hauteurLigne;
  b.matieres.forEach((m, i) => {
    if (i % 2 === 1) doc.rect(L, y, largeur, hauteurLigne).fill(FOND);
    const vals = [m.nom, nombre(m.coefficient, m.coefficient % 1 ? 1 : 0), nombre(m.moyenne), nombre(m.moyenne_classe), nombre(m.min), nombre(m.max), m.moyenne === null ? 'Non évalué' : m.appreciation];
    let cx = L;
    vals.forEach((v, j) => {
      const gras = j === 2;
      const couleur = j === 2 && m.moyenne !== null && m.moyenne < 10 ? '#b42318' : ENCRE;
      doc.fillColor(couleur).font(gras ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).text(v, cx + 6, y + 7, {
        width: cols[j].l * largeur - 12,
        align: cols[j].align,
        lineBreak: false,
        ellipsis: true,
      });
      cx += cols[j].l * largeur;
    });
    y += hauteurLigne;
  });
  doc.moveTo(L, y).lineTo(L + largeur, y).lineWidth(0.8).strokeColor(LIGNE).stroke();

  // Synthèse
  y += 16;
  doc.roundedRect(L, y, largeur, 84, 6).fill(FOND);
  const quart = largeur / 4;
  const synth = [
    ['Moyenne générale', b.moyenne_generale === null ? '—' : `${nombre(b.moyenne_generale)} / 20`],
    ['Rang', b.rang ? `${b.rang}${b.rang === 1 ? 'er' : 'e'} / ${b.effectif}` : '—'],
    ['Moyenne de la classe', b.stats_generale.moyenne === null ? '—' : `${nombre(b.stats_generale.moyenne)} / 20`],
    ['Absences (demi-journées)', `${b.absences.justifiees} justifiée(s) · ${b.absences.non_justifiees} non justifiée(s)`],
  ];
  synth.forEach(([cle, val], i) => {
    doc.fillColor(GRIS).font('Helvetica').fontSize(8.5).text(cle, L + i * quart + 12, y + 14, { width: quart - 24 });
    doc.fillColor(i === 0 ? COULEUR : ENCRE).font('Helvetica-Bold').fontSize(i < 3 ? 15 : 9.5).text(val, L + i * quart + 12, y + 32, { width: quart - 24 });
  });
  y += 100;
  doc.fillColor(GRIS).font('Helvetica-Bold').fontSize(8.5).text('APPRÉCIATION GÉNÉRALE', L, y, { characterSpacing: 0.6 });
  doc.fillColor(ENCRE).font('Helvetica-Bold').fontSize(12).text(b.appreciation, L, doc.y + 4);
  doc
    .fillColor(GRIS)
    .font('Helvetica')
    .fontSize(8.5)
    .text('Moyenne générale = somme des (moyenne de la matière x coefficient), divisée par la somme des coefficients des matières évaluées.', L, doc.y + 4, { width: largeur });

  // Signatures
  y = Math.max(doc.y + 24, doc.page.height - 190);
  const tiers = largeur / 3;
  ['L’enseignant(e) titulaire', 'La direction', 'Signature du parent'].forEach((t, i) => {
    doc.fillColor(GRIS).font('Helvetica').fontSize(9).text(t, L + i * tiers, y, { width: tiers - 12, align: 'center' });
    doc.rect(L + i * tiers + 6, y + 14, tiers - 24, 62).lineWidth(0.6).strokeColor(LIGNE).stroke();
  });
  doc
    .fillColor(GRIS)
    .fontSize(8)
    .text(`Bulletin généré le ${formatDateCourte(new Date().toISOString())} — ${param('nom_ecole')}`, L, doc.page.height - 60, {
      width: largeur,
      align: 'center',
    });
  return versBuffer(doc);
}

module.exports = { pdfRecu, pdfBulletin };
