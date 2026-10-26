const multer = require('multer');
const { HttpError } = require('../utils');

// Gestionnaire d'erreurs centralisé : renvoie toujours un JSON { erreur, ... } en français.
// eslint-disable-next-line no-unused-vars
function gestionErreurs(err, req, res, next) {
  if (res.headersSent) return;

  if (err instanceof HttpError) {
    return res.status(err.status).json({ erreur: err.message, ...err.extra });
  }

  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: 'Le fichier est trop volumineux.',
      LIMIT_FILE_COUNT: 'Trop de fichiers envoyés.',
      LIMIT_UNEXPECTED_FILE: 'Champ de fichier inattendu.',
    };
    return res.status(400).json({ erreur: messages[err.code] || 'Erreur lors de l’envoi du fichier.' });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ erreur: 'Requête invalide (JSON mal formé).' });
  }

  // Erreurs PostgreSQL
  if (err.code === 'P0001' && err.hint === 'immuable') {
    return res.status(403).json({ erreur: err.message, immuable: true });
  }
  if (err.code === '23505') {
    return res.status(409).json({ erreur: 'Cet enregistrement existe déjà (doublon).' });
  }
  if (err.code === '23503') {
    return res.status(409).json({ erreur: 'Opération impossible : cet élément est lié à d’autres données.' });
  }
  if (err.code === '23514' || err.code === '22P02' || err.code === '22007' || err.code === '22008') {
    return res.status(400).json({ erreur: 'Données invalides.' });
  }

  console.error('[erreur]', req.method, req.originalUrl, err);
  return res.status(500).json({ erreur: 'Une erreur interne est survenue. Veuillez réessayer.' });
}

module.exports = { gestionErreurs };
