// Tâches planifiées : relances automatiques des impayés (une fois par jour, à partir de 8 h).
const db = require('../db');
const config = require('../config');
const { anneeCourante, param, chargerParametres } = require('./parametres');
const { envoyerRelances } = require('./finances');
const { expediteurSysteme } = require('./messagerie');
const { dateLocaleIso } = require('../utils');

async function executerRelancesQuotidiennes() {
  const aujourdhui = dateLocaleIso();
  if (new Date().getHours() < 8) return;
  const derniere = await db.un("SELECT valeur FROM parametres WHERE cle = 'derniere_relance_auto'");
  if ((derniere && derniere.valeur) === aujourdhui || param('derniere_relance_auto') === aujourdhui) return;
  const expediteurId = await expediteurSysteme(db);
  if (!expediteurId) return;
  const nb = await db.tx(null, async (c) => {
    const n = await envoyerRelances(c, {
      annee: anneeCourante(),
      expediteurId,
      automatique: true,
      intervalleJours: 7,
      baseUrl: config.publicUrl,
    });
    await c.query(
      "INSERT INTO parametres (cle, valeur) VALUES ('derniere_relance_auto', $1) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur",
      [aujourdhui]
    );
    return n;
  });
  await chargerParametres();
  console.log(`[relances] ${nb} relance(s) automatique(s) envoyée(s)`);
}

function demarrerTachesPlanifiees() {
  const lancer = () => executerRelancesQuotidiennes().catch((e) => console.error('[relances]', e.message));
  setTimeout(lancer, 60 * 1000);
  setInterval(lancer, 30 * 60 * 1000);
}

module.exports = { demarrerTachesPlanifiees, executerRelancesQuotidiennes };
