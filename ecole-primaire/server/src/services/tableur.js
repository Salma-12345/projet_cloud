// Import / export CSV et Excel (xlsx).
const path = require('path');
const ExcelJS = require('exceljs');
const { HttpError } = require('../utils');

/** Analyse un CSV (séparateur ; ou , détecté automatiquement, guillemets gérés). */
function lireCsv(texte) {
  const contenu = texte.replace(/^﻿/, '');
  const premiere = contenu.split(/\r?\n/)[0] || '';
  const sep = (premiere.match(/;/g) || []).length >= (premiere.match(/,/g) || []).length ? ';' : ',';
  const lignes = [];
  let ligne = [];
  let champ = '';
  let guillemets = false;
  for (let i = 0; i < contenu.length; i++) {
    const ch = contenu[i];
    if (guillemets) {
      if (ch === '"') {
        if (contenu[i + 1] === '"') {
          champ += '"';
          i++;
        } else guillemets = false;
      } else champ += ch;
    } else if (ch === '"') guillemets = true;
    else if (ch === sep) {
      ligne.push(champ);
      champ = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && contenu[i + 1] === '\n') i++;
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = '';
    } else champ += ch;
  }
  if (champ !== '' || ligne.length) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  return lignes.filter((l) => l.some((c) => String(c).trim() !== ''));
}

function normaliserEntete(h) {
  return String(h || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function valeurCellule(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (v.text) return String(v.text);
    if (v.result !== undefined) return valeurCellule(v.result);
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.hyperlink) return String(v.text || v.hyperlink);
  }
  return String(v).trim();
}

/** Lit un fichier CSV ou XLSX et renvoie une liste d'objets { entete_normalisee: valeur }. */
async function lireTableur(buffer, nomFichier) {
  const ext = path.extname(nomFichier || '').toLowerCase();
  let lignes;
  if (ext === '.csv' || ext === '.txt') {
    lignes = lireCsv(buffer.toString('utf8'));
  } else if (ext === '.xlsx') {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new HttpError(400, 'Le fichier Excel ne contient aucune feuille.');
    lignes = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = [];
      for (let i = 1; i <= ws.columnCount; i++) vals.push(valeurCellule(row.getCell(i).value));
      lignes.push(vals);
    });
  } else {
    throw new HttpError(400, 'Format non pris en charge : utilisez un fichier .csv ou .xlsx.');
  }
  if (lignes.length < 2) throw new HttpError(400, 'Le fichier ne contient aucune ligne de données.');
  const entetes = lignes[0].map(normaliserEntete);
  return lignes.slice(1).map((l, i) => {
    const obj = { _ligne: i + 2 };
    entetes.forEach((h, j) => {
      if (h) obj[h] = valeurCellule(l[j]);
    });
    return obj;
  });
}

function echapperCsv(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV compatible Excel français (séparateur ; et BOM UTF-8). */
function ecrireCsv(colonnes, lignes) {
  const tete = colonnes.map((c) => echapperCsv(c.titre)).join(';');
  const corps = lignes.map((l) => colonnes.map((c) => echapperCsv(l[c.cle])).join(';'));
  return Buffer.from(`﻿${[tete, ...corps].join('\r\n')}\r\n`, 'utf8');
}

async function ecrireXlsx(nomFeuille, colonnes, lignes) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gestion école primaire';
  const ws = wb.addWorksheet(nomFeuille.slice(0, 31));
  ws.columns = colonnes.map((c) => ({ header: c.titre, key: c.cle, width: c.largeur || 18 }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E5F' } };
  for (const l of lignes) ws.addRow(l);
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Convertit une date saisie (AAAA-MM-JJ, JJ/MM/AAAA, JJ-MM-AAAA) en AAAA-MM-JJ, sinon null. */
function normaliserDate(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function envoyerFichier(res, buffer, nomFichier, mime) {
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename="${nomFichier}"`);
  res.send(buffer);
}

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MIME_CSV = 'text/csv; charset=utf-8';

module.exports = { lireTableur, ecrireCsv, ecrireXlsx, normaliserDate, envoyerFichier, MIME_XLSX, MIME_CSV };
