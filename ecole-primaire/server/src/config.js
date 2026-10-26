const path = require('path');

const bool = (v, defaut) => (v === undefined || v === '' ? defaut : ['1', 'true', 'oui', 'yes'].includes(String(v).toLowerCase()));

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgres://ecole:ecole_mdp@localhost:5432/ecole',
  uploadsDir: process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads'),
  publicDir: process.env.PUBLIC_DIR || path.join(__dirname, '..', 'public'),
  // Charge les données de démonstration au premier démarrage (base vide)
  seedDemo: bool(process.env.SEED_DEMO, true),
  // Affiche les comptes de démonstration sur la page de connexion
  demoMode: bool(process.env.DEMO_MODE, true),
  // URL publique (ex. https://xxx.trycloudflare.com) — sinon déduite de la requête
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/$/, ''),
  jwtSecret: process.env.JWT_SECRET || '',
  tailleMaxFichierMo: parseInt(process.env.TAILLE_MAX_FICHIER_MO || '10', 10),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
  },
};
