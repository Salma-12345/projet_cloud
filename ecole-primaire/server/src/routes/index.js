const express = require('express');
const { authentifier } = require('../middleware/auth');

const router = express.Router();

// Santé du service (utilisé par Docker)
router.get('/sante', (req, res) => res.json({ ok: true, heure: new Date().toISOString() }));

// Sans connexion
router.use('/public', require('./public'));
router.use('/auth', require('./auth'));

// Toutes les routes suivantes exigent une session valide
router.use(authentifier);

const { classes, affectations } = require('./classes');
const { matieres, salles } = require('./referentiels');
const { evaluations, bulletins } = require('./evaluations');
const { tarifs, paiements, finances } = require('./finances');
const divers = require('./divers');

router.use('/tableau-de-bord', require('./tableau'));
router.use('/utilisateurs', require('./utilisateurs'));
router.use('/eleves', require('./eleves'));
router.use('/preinscriptions', require('./preinscriptions'));
router.use('/classes', classes);
router.use('/affectations', affectations);
router.use('/matieres', matieres);
router.use('/salles', salles);
router.use('/creneaux', require('./creneaux'));
router.use('/evaluations', evaluations);
router.use('/bulletins', bulletins);
router.use('/absences', require('./absences'));
router.use('/tarifs', tarifs);
router.use('/paiements', paiements);
router.use('/finances', finances);
router.use('/devoirs', require('./devoirs'));
router.use('/messages', require('./messages'));
router.use('/annonces', require('./annonces'));
router.use('/notifications', divers.notifications);
router.use('/push', divers.push);
router.use('/fichiers', divers.fichiers);
router.use('/journal', divers.journal);
router.use('/parametres', divers.parametres);
router.use('/annees', divers.annees);

module.exports = router;
