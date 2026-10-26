const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');
const { HttpError } = require('../utils');

const TYPES_AUTORISES = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.txt': 'text/plain',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
const IMAGES = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

// Les noms de fichiers multipart arrivent parfois encodés en latin1 : on les remet en UTF-8.
function corrigerNom(nom) {
  try {
    const converti = Buffer.from(nom, 'latin1').toString('utf8');
    if (!converti.includes('�') && /[^\x00-\x7F]/.test(nom)) return converti;
  } catch {
    /* ignore */
  }
  return nom;
}

function televersement({ maxFichiers = 5, imagesSeulement = false } = {}) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.tailleMaxFichierMo * 1024 * 1024, files: maxFichiers },
    fileFilter: (req, file, cb) => {
      file.originalname = corrigerNom(file.originalname);
      const ext = path.extname(file.originalname).toLowerCase();
      const autorise = imagesSeulement ? IMAGES.includes(ext) : Boolean(TYPES_AUTORISES[ext]);
      if (!autorise) {
        return cb(
          new HttpError(
            400,
            imagesSeulement
              ? 'Format d’image non accepté (PNG, JPG, WEBP ou GIF).'
              : 'Format de fichier non accepté (PDF, images, documents Office/LibreOffice, texte).'
          )
        );
      }
      cb(null, true);
    },
  });
}

/** Enregistre un fichier envoyé (multer) sur le disque et dans la table fichiers. */
async function enregistrerFichier(db, fichier, categorie, refId, utilisateurId) {
  const ext = path.extname(fichier.originalname).toLowerCase();
  const dossier = path.join(config.uploadsDir, categorie);
  fs.mkdirSync(dossier, { recursive: true });
  const nomDisque = `${crypto.randomUUID()}${ext}`;
  const relatif = path.join(categorie, nomDisque);
  fs.writeFileSync(path.join(config.uploadsDir, relatif), fichier.buffer);
  const r = await db.query(
    `INSERT INTO fichiers (categorie, ref_id, chemin, nom_original, mime, taille, depose_par)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, nom_original, mime, taille, created_at`,
    [categorie, refId, relatif, fichier.originalname, TYPES_AUTORISES[ext] || fichier.mimetype, fichier.size, utilisateurId]
  );
  return r.rows[0];
}

/** Enregistre un contenu généré (PDF de reçu…). */
async function enregistrerContenu(db, buffer, nomOriginal, categorie, refId, utilisateurId) {
  return enregistrerFichier(
    db,
    { buffer, originalname: nomOriginal, mimetype: TYPES_AUTORISES[path.extname(nomOriginal).toLowerCase()], size: buffer.length },
    categorie,
    refId,
    utilisateurId
  );
}

function cheminAbsolu(f) {
  return path.join(config.uploadsDir, f.chemin);
}

async function fichiersDe(db, categorie, refId) {
  const r = await db.query(
    `SELECT id, nom_original, mime, taille, created_at FROM fichiers
      WHERE categorie = $1 AND ref_id = $2 AND deleted_at IS NULL ORDER BY id`,
    [categorie, refId]
  );
  return r.rows;
}

async function fichiersDePlusieurs(db, categorie, refIds) {
  if (!refIds.length) return {};
  const r = await db.query(
    `SELECT id, ref_id, nom_original, mime, taille, created_at FROM fichiers
      WHERE categorie = $1 AND ref_id = ANY($2) AND deleted_at IS NULL ORDER BY id`,
    [categorie, refIds]
  );
  const parRef = {};
  for (const f of r.rows) (parRef[f.ref_id] = parRef[f.ref_id] || []).push(f);
  return parRef;
}

module.exports = {
  televersement,
  enregistrerFichier,
  enregistrerContenu,
  cheminAbsolu,
  fichiersDe,
  fichiersDePlusieurs,
  TYPES_AUTORISES,
};
