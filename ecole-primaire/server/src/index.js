// Point d'entrée : API REST + interface web (PWA) servies par le même serveur Express.
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const config = require('./config');
const db = require('./db');
const { migrer } = require('./db/migrer');
const { initialiserParametres, chargerParametres } = require('./services/parametres');
const { initialiserCanaux } = require('./services/notifications');
const { assurerAdministrateur } = require('./services/administrateur');
const { demarrerTachesPlanifiees } = require('./services/planificateur');
const { gestionErreurs } = require('./middleware/erreurs');

async function demarrer() {
  await db.attendreBase();
  await migrer();
  await initialiserParametres();
  if (config.seedDemo) {
    const { chargerDonneesDemo } = require('./db/seed');
    await chargerDonneesDemo();
    await chargerParametres();
  }
  await assurerAdministrateur();
  initialiserCanaux();
  fs.mkdirSync(config.uploadsDir, { recursive: true });

  const app = express();
  app.set('trust proxy', 1); // derrière Cloudflare Tunnel / reverse proxy
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          workerSrc: ["'self'"],
          manifestSrc: ["'self'"],
          frameSrc: ["'self'"],
          objectSrc: ["'self'"],
          frameAncestors: ["'self'"],
          upgradeInsecureRequests: null,
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  app.use('/api', require('./routes'));
  app.use('/api', (req, res) => res.status(404).json({ erreur: 'Ressource introuvable.' }));

  // Interface web (fichiers construits par Vite)
  app.use(
    express.static(config.publicDir, {
      index: false,
      maxAge: '7d',
      setHeaders: (res, fichier) => {
        const nom = path.basename(fichier);
        if (nom === 'sw.js' || nom === 'index.html' || nom.endsWith('.webmanifest')) res.setHeader('Cache-Control', 'no-cache');
      },
    })
  );
  const index = path.join(config.publicDir, 'index.html');
  app.get('/{*chemin}', (req, res) => {
    if (fs.existsSync(index)) {
      res.setHeader('Cache-Control', 'no-cache');
      return res.sendFile(index);
    }
    res.status(404).send('Interface non construite. Lancez « npm run build » dans le dossier client.');
  });

  app.use(gestionErreurs);

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`\n  ✔ Application démarrée sur http://localhost:${config.port}\n`);
  });
  demarrerTachesPlanifiees();
}

demarrer().catch((e) => {
  console.error('Échec du démarrage :', e);
  process.exit(1);
});
