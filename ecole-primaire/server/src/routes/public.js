// Routes publiques (sans connexion) : informations de l'école et pré-inscription en ligne.
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const config = require('../config');
const { valider, HttpError } = require('../utils');
const { NIVEAUX, parametresPublics, anneeCourante } = require('../services/parametres');
const { notifier } = require('../services/notifications');

const router = express.Router();

const COMPTES_DEMO = [
  { role: 'admin', libelle: 'Administrateur / Direction', email: 'admin@ecole.tn' },
  { role: 'enseignant', libelle: 'Enseignant', email: 'enseignant@ecole.tn' },
  { role: 'parent', libelle: 'Parent', email: 'parent@ecole.tn' },
  { role: 'eleve', libelle: 'Élève', email: 'eleve@ecole.tn' },
  { role: 'comptable', libelle: 'Comptable / Secrétariat', email: 'comptable@ecole.tn' },
];
const MOT_DE_PASSE_DEMO = 'Ecole2026';

router.get('/infos', (req, res) => {
  res.json({
    ...parametresPublics(),
    niveaux: NIVEAUX,
    demo: config.demoMode ? { comptes: COMPTES_DEMO, mot_de_passe: MOT_DE_PASSE_DEMO } : null,
  });
});

const limitePreinscription = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { erreur: 'Trop de demandes envoyées. Réessayez plus tard.' },
});

router.post('/preinscriptions', limitePreinscription, async (req, res) => {
  const d = valider(req.body, {
    enfant_nom: { type: 'string', required: true, label: 'Nom de l’enfant', maxLength: 80 },
    enfant_prenom: { type: 'string', required: true, label: 'Prénom de l’enfant', maxLength: 80 },
    date_naissance: { type: 'date', required: true, label: 'Date de naissance' },
    lieu_naissance: { type: 'string', label: 'Lieu de naissance', maxLength: 80 },
    sexe: { type: 'string', required: true, enum: ['F', 'M'], label: 'Sexe' },
    niveau_souhaite: { type: 'string', enum: NIVEAUX, label: 'Niveau souhaité' },
    ecole_precedente: { type: 'string', label: 'École précédente', maxLength: 120 },
    antecedents_medicaux: { type: 'string', label: 'Antécédents médicaux', maxLength: 1000 },
    parent_nom: { type: 'string', required: true, label: 'Nom du parent', maxLength: 80 },
    parent_prenom: { type: 'string', required: true, label: 'Prénom du parent', maxLength: 80 },
    lien: { type: 'string', required: true, enum: ['Père', 'Mère', 'Tuteur', 'Tutrice'], label: 'Lien de parenté' },
    email: { type: 'email', required: true, label: 'E-mail' },
    telephone: { type: 'string', required: true, label: 'Téléphone', maxLength: 30 },
    adresse: { type: 'string', label: 'Adresse', maxLength: 200 },
    consentement: { type: 'bool', label: 'Consentement' },
  });
  if (!d.consentement) {
    throw new HttpError(400, 'Le consentement parental au traitement des données (RGPD) est obligatoire.');
  }
  const naissance = new Date(d.date_naissance);
  const age = (Date.now() - naissance.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (age < 4 || age > 14) throw new HttpError(400, 'La date de naissance ne correspond pas à un enfant d’âge primaire.');

  const resultat = await db.tx(null, async (c) => {
    const ref = `PI-${new Date().getFullYear()}-${String((await c.query("SELECT nextval('seq_preinscription') AS n")).rows[0].n).padStart(4, '0')}`;
    const r = await c.query(
      `INSERT INTO preinscriptions (reference, enfant_nom, enfant_prenom, date_naissance, lieu_naissance, sexe, niveau_souhaite,
          ecole_precedente, antecedents_medicaux, parent_nom, parent_prenom, lien, email, telephone, adresse,
          consentement, consentement_at, annee_scolaire)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,TRUE,now(),$16) RETURNING id, reference`,
      [
        ref,
        d.enfant_nom,
        d.enfant_prenom,
        d.date_naissance,
        d.lieu_naissance,
        d.sexe,
        d.niveau_souhaite,
        d.ecole_precedente,
        d.antecedents_medicaux,
        d.parent_nom,
        d.parent_prenom,
        d.lien,
        d.email,
        d.telephone,
        d.adresse,
        anneeCourante(),
      ]
    );
    const gestion = (await c.query("SELECT id FROM utilisateurs WHERE role IN ('admin','comptable') AND actif AND deleted_at IS NULL")).rows.map(
      (x) => x.id
    );
    await notifier(c, gestion, {
      type: 'preinscription',
      titre: 'Nouvelle pré-inscription en ligne',
      contenu: `${d.enfant_prenom} ${d.enfant_nom} — demande ${ref} à valider.`,
      lien: '/preinscriptions',
      contexte: 'preinscription',
    });
    return r.rows[0];
  });
  res.status(201).json(resultat);
});

module.exports = router;
