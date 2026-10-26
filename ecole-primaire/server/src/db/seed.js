// Données de démonstration : une école complète (année courante + historique de l'année précédente).
// Chargées automatiquement au premier démarrage si la base est vide (SEED_DEMO=true).
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const db = require('./index');
const { anneeCourante } = require('../services/parametres');
const { enregistrerContenu } = require('../services/fichiers');
const { dateLocaleIso, formatMontant, formatDate, LIBELLES_MODE } = require('../utils');
const { trimestreDeDate } = require('../services/notes');

const MOT_DE_PASSE = 'Ecole2026';

// Générateur pseudo-aléatoire déterministe (mêmes données à chaque installation)
function prng(graine) {
  let s = graine;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const alea = prng(20262027);
const entre = (a, b) => a + Math.floor(alea() * (b - a + 1));
const choisir = (liste) => liste[Math.floor(alea() * liste.length)];
function melanger(liste) {
  const l = [...liste];
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
}
const slug = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
const nomFichier = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function decaler(jours, base = new Date()) {
  const d = new Date(base);
  d.setDate(d.getDate() + jours);
  return d;
}
function aHeure(d, h, m = 0) {
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x;
}

function pdfSimple(titre, sousTitre, paragraphes) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    const morceaux = [];
    doc.on('data', (c) => morceaux.push(c));
    doc.on('end', () => resolve(Buffer.concat(morceaux)));
    doc.rect(0, 0, doc.page.width, 6).fill('#1f4e5f');
    doc.fillColor('#1f4e5f').font('Helvetica-Bold').fontSize(18).text(titre, 56, 50);
    doc.fillColor('#5b6472').font('Helvetica').fontSize(10).text(sousTitre).moveDown(1.2);
    doc.fillColor('#1d2433').fontSize(11.5);
    for (const p of paragraphes) doc.text(p, { lineGap: 4 }).moveDown(0.6);
    doc.end();
  });
}

const PRENOMS_F = ['Mariem', 'Eya', 'Nour', 'Rania', 'Sarra', 'Lina', 'Malek', 'Farah', 'Amira', 'Chaima', 'Hiba', 'Aya', 'Ranim', 'Emna', 'Rahma', 'Yosra', 'Nada', 'Lilia', 'Sirine', 'Dorra', 'Arij', 'Tasnim', 'Jouri', 'Selma', 'Alaa', 'Maissa'];
const PRENOMS_M = ['Youssef', 'Mohamed', 'Ahmed', 'Amine', 'Iyed', 'Skander', 'Aziz', 'Hamza', 'Omar', 'Rayen', 'Fares', 'Mehdi', 'Ayoub', 'Elyes', 'Anas', 'Yassine', 'Bilel', 'Ghassen', 'Seif', 'Taha', 'Ilyes', 'Zied', 'Mootez', 'Firas', 'Nassim'];
const NOMS = ['Bouazizi', 'Mejri', 'Ayari', 'Sassi', 'Khemiri', 'Ferchichi', 'Nasri', 'Riahi', 'Jebali', 'Ouertani', 'Baccouche', 'Toumi', 'Bouslama', 'Masmoudi', 'Karoui', 'Laabidi', 'Hajji', 'Bacha', 'Fourati', 'Gannouni', 'Kchaou', 'Ellouze', 'Zribi', 'Abidi', 'Mzali', 'Rekik', 'Sfar', 'Jaziri', 'Hamrouni', 'Klai', 'Dhaouadi', 'Selmi', 'Ghanmi', 'Mtibaa', 'Boughanmi', 'Arfaoui', 'Cherif', 'Bennour', 'Soltani', 'Gharsalli', 'Majdoub', 'Lahmar', 'Hachicha', 'Bouhlel', 'Feki', 'Jemli', 'Chouchane', 'Mahjoub', 'Tlili', 'Sahli', 'Brahmi', 'Daoud'];
const MERES = ['Samia', 'Hela', 'Mouna', 'Najet', 'Rym', 'Wafa', 'Imen', 'Raja', 'Saloua', 'Henda', 'Fatma', 'Sihem', 'Monia', 'Basma', 'Houda', 'Kaouther', 'Narjes', 'Hajer', 'Dalila', 'Latifa', 'Souad', 'Zeineb', 'Afef', 'Khaoula', 'Manel', 'Rabeb', 'Ons', 'Sana', 'Nesrine', 'Chiraz', 'Mabrouka', 'Lamia', 'Thouraya', 'Besma', 'Hayet', 'Jamila', 'Nawel', 'Samira', 'Hanen', 'Rihab', 'Ahlem', 'Saida', 'Yamina', 'Mounira', 'Hamida', 'Wided', 'Sarra'];
const PERES = ['Lotfi', 'Kamel', 'Tarek', 'Fethi', 'Slim', 'Mehrez', 'Anis', 'Sofiene', 'Chokri', 'Mounir', 'Bassem', 'Mondher', 'Faouzi', 'Habib', 'Jamel', 'Ridha', 'Nabil', 'Adel', 'Lassaad', 'Moez', 'Raouf', 'Fayçal', 'Hedi', 'Imed', 'Khaled', 'Noureddine'];
const VILLES = ['Sousse', 'Sousse', 'Sousse', 'Monastir', 'Hammam Sousse', 'Msaken', 'Akouda', 'Kalâa Kebira'];
const RUES = ['rue de la Liberté', 'avenue Habib Bourguiba', 'rue Ibn Khaldoun', 'rue de Palestine', 'avenue Léopold Senghor', 'rue Farhat Hached', 'rue des Oliviers', 'rue Ali Belhouane'];
const MEDICAL = [null, null, null, null, null, null, 'Asthme léger — inhalateur dans le cartable', 'Allergie aux arachides', 'Porte des lunettes', 'Allergie au pollen (printemps)', null, null];

async function chargerDonneesDemo() {
  const n = (await db.un('SELECT COUNT(*)::int AS n FROM utilisateurs')).n;
  if (n > 0) return;
  console.log('[démo] Chargement des données de démonstration…');
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.seed', 'on', true)");
    await remplir(client);
    await client.query('COMMIT');
    console.log(`[démo] Données chargées. Comptes : admin@ecole.tn, enseignant@ecole.tn, parent@ecole.tn, eleve@ecole.tn, comptable@ecole.tn (mot de passe : ${MOT_DE_PASSE})`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function remplir(c) {
  const un = async (sql, p) => (await c.query(sql, p)).rows[0];
  const hash = await bcrypt.hash(MOT_DE_PASSE, 10);
  const annee = anneeCourante();
  const A1 = Number(annee.slice(0, 4));
  const anneePrec = `${A1 - 1}-${A1}`;
  const aujourdhui = new Date();
  const debutAnnee = new Date(A1, 8, 15);

  // ---------- Personnel ----------
  const utilisateur = async (role, prenom, nom, email, extra = {}) =>
    (
      await un(
        `INSERT INTO utilisateurs (role, email, mot_de_passe, nom, prenom, telephone, adresse, specialite, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [role, email, hash, nom, prenom, extra.telephone || null, extra.adresse || null, extra.specialite || null, new Date(A1 - 1, 6, 1)]
      )
    ).id;
  const tel = () => `+216 ${choisir(['20', '22', '23', '25', '50', '52', '55', '58', '97', '98'])} ${entre(100, 999)} ${entre(100, 999)}`;

  const admin = await utilisateur('admin', 'Faten', 'Belhadj', 'admin@ecole.tn', { telephone: '+216 73 000 001' });
  const comptable = await utilisateur('comptable', 'Mourad', 'Saidi', 'comptable@ecole.tn', { telephone: '+216 73 000 002' });
  const ens = {};
  const ENSEIGNANTS = [
    ['leila', 'Leila', 'Mansouri', 'leila.mansouri@ecole.tn', 'Enseignement général'],
    ['sami', 'Sami', 'Gharbi', 'enseignant@ecole.tn', 'Enseignement général'],
    ['nadia', 'Nadia', 'Zouari', 'nadia.zouari@ecole.tn', 'Enseignement général'],
    ['hatem', 'Hatem', 'Jlassi', 'hatem.jlassi@ecole.tn', 'Enseignement général'],
    ['sonia', 'Sonia', 'Ben Salah', 'sonia.bensalah@ecole.tn', 'Enseignement général'],
    ['riadh', 'Riadh', 'Trabelsi', 'riadh.trabelsi@ecole.tn', 'Enseignement général'],
    ['olfa', 'Olfa', 'Hammami', 'olfa.hammami@ecole.tn', 'Langue française'],
    ['walid', 'Walid', 'Dridi', 'walid.dridi@ecole.tn', 'Éducation physique et sportive'],
    ['ines', 'Ines', 'Chaabane', 'ines.chaabane@ecole.tn', 'Anglais, arts plastiques'],
  ];
  for (const [cle, prenom, nom, email, specialite] of ENSEIGNANTS) {
    ens[cle] = await utilisateur('enseignant', prenom, nom, email, { telephone: tel(), specialite });
  }

  // ---------- Matières ----------
  const mat = {};
  for (const [cle, nom, coef, niveau] of [
    ['arabe', 'Arabe', 3, null],
    ['francais', 'Français', 3, null],
    ['maths', 'Mathématiques', 3, null],
    ['eveil', 'Éveil scientifique', 2, null],
    ['civique', 'Éducation civique', 1, null],
    ['art', 'Éducation artistique', 1, null],
    ['eps', 'Éducation physique', 1, null],
    ['anglais_cm1', 'Anglais', 1, 'CM1'],
    ['anglais_cm2', 'Anglais', 1, 'CM2'],
  ]) {
    mat[cle] = (await un('INSERT INTO matieres (nom, coefficient, niveau) VALUES ($1,$2,$3) RETURNING id', [nom, coef, niveau])).id;
  }
  const NOM_MATIERE = { arabe: 'Arabe', francais: 'Français', maths: 'Mathématiques', eveil: 'Éveil scientifique', civique: 'Éducation civique', art: 'Éducation artistique', eps: 'Éducation physique', anglais_cm1: 'Anglais', anglais_cm2: 'Anglais' };

  // ---------- Salles ----------
  const salle = {};
  for (const [cle, nom, cap, dispo, desc] of [
    ['s1', 'Salle 1', 30, true, 'Rez-de-chaussée'],
    ['s2', 'Salle 2', 30, true, 'Rez-de-chaussée'],
    ['s3', 'Salle 3', 30, true, 'Rez-de-chaussée'],
    ['s4', 'Salle 4', 30, true, '1er étage'],
    ['s5', 'Salle 5', 30, true, '1er étage'],
    ['s6', 'Salle 6', 30, true, '1er étage'],
    ['poly', 'Salle polyvalente', 40, true, 'Arts plastiques, musique, réunions'],
    ['terrain', 'Terrain de sport', 60, true, 'Cour extérieure'],
    ['info', 'Salle informatique', 20, false, 'Fermée pour travaux jusqu’aux vacances'],
  ]) {
    salle[cle] = (await un('INSERT INTO salles (nom, capacite, disponible, description) VALUES ($1,$2,$3,$4) RETURNING id', [nom, cap, dispo, desc])).id;
  }

  // ---------- Classes (année courante + année précédente) ----------
  const CLASSES = [
    { cle: 'cpa', niveau: 'CP', section: 'A', cap: 26, tit: 'leila', salle: 's1' },
    { cle: 'ce1a', niveau: 'CE1', section: 'A', cap: 26, tit: 'sami', salle: 's2' },
    { cle: 'ce1b', niveau: 'CE1', section: 'B', cap: 26, tit: 'nadia', salle: 's3' },
    { cle: 'ce2a', niveau: 'CE2', section: 'A', cap: 28, tit: 'hatem', salle: 's4' },
    { cle: 'cm1a', niveau: 'CM1', section: 'A', cap: 28, tit: 'sonia', salle: 's5' },
    { cle: 'cm2a', niveau: 'CM2', section: 'A', cap: 28, tit: 'riadh', salle: 's6' },
  ];
  for (const cl of CLASSES) {
    cl.id = (
      await un('INSERT INTO classes (niveau, section, capacite_max, annee_scolaire, titulaire_id) VALUES ($1,$2,$3,$4,$5) RETURNING id', [
        cl.niveau,
        cl.section,
        cl.cap,
        annee,
        ens[cl.tit],
      ])
    ).id;
  }
  const PREC = [
    { cle: 'cpa', niveau: 'CP', section: 'A', tit: 'sami' },
    { cle: 'ce1a', niveau: 'CE1', section: 'A', tit: 'hatem' },
    { cle: 'ce2a', niveau: 'CE2', section: 'A', tit: 'sonia' },
    { cle: 'cm1a', niveau: 'CM1', section: 'A', tit: 'riadh' },
  ];
  for (const cl of PREC) {
    cl.id = (
      await un('INSERT INTO classes (niveau, section, capacite_max, annee_scolaire, titulaire_id) VALUES ($1,$2,28,$3,$4) RETURNING id', [
        cl.niveau,
        cl.section,
        anneePrec,
        ens[cl.tit],
      ])
    ).id;
  }
  const precParNiveau = Object.fromEntries(PREC.map((p) => [p.niveau, p]));
  const NIV = ['CP', 'CE1', 'CE2', 'CM1', 'CM2'];

  // ---------- Affectations matière <-> enseignant <-> classe ----------
  const affect = {}; // `${classe}|${matiere}` -> enseignant
  for (const cl of CLASSES) {
    const liste = [
      ['arabe', cl.tit],
      ['maths', cl.tit],
      ['eveil', cl.tit],
      ['civique', cl.tit],
      ['francais', 'olfa'],
      ['eps', 'walid'],
      ['art', 'ines'],
    ];
    if (cl.niveau === 'CM1') liste.push(['anglais_cm1', 'ines']);
    if (cl.niveau === 'CM2') liste.push(['anglais_cm2', 'ines']);
    cl.matieres = liste.map(([m]) => m);
    for (const [m, e] of liste) {
      await c.query('INSERT INTO affectations (enseignant_id, matiere_id, classe_id, annee_scolaire) VALUES ($1,$2,$3,$4)', [ens[e], mat[m], cl.id, annee]);
      affect[`${cl.cle}|${m}`] = e;
    }
  }

  // ---------- Familles, parents, élèves ----------
  const nomsLibres = melanger(NOMS);
  const meres = melanger(MERES);
  const peres = melanger(PERES);
  const emailsPris = new Set();
  const emailParent = (prenom, nom) => {
    let e = `${slug(prenom)}.${slug(nom)}@exemple.tn`;
    for (let i = 2; emailsPris.has(e); i++) e = `${slug(prenom)}.${slug(nom)}${i}@exemple.tn`;
    emailsPris.add(e);
    return e;
  };
  const familles = [];
  const nouvelleFamille = async (nom, mere, pere, emailMere, adresse) => {
    const f = { nom, adresse, parents: [] };
    f.parents.push({
      id: await utilisateur('parent', mere, nom, emailMere || emailParent(mere, nom), { telephone: tel(), adresse }),
      lien: 'Mère',
      prenom: mere,
    });
    if (pere) {
      f.parents.push({ id: await utilisateur('parent', pere, nom, emailParent(pere, nom), { telephone: tel(), adresse }), lien: 'Père', prenom: pere });
    }
    familles.push(f);
    return f;
  };

  const eleves = [];
  const prenomsPris = new Set();
  const prenom = (sexe) => {
    const liste = sexe === 'F' ? PRENOMS_F : PRENOMS_M;
    const libres = liste.filter((x) => !prenomsPris.has(x));
    const p = libres.length ? choisir(libres) : choisir(liste);
    prenomsPris.add(p);
    return p;
  };
  const nouvelEleve = async (famille, cl, { prenom: pr, sexe, naissance, niveauCapacite }) => {
    const idxNiveau = NIV.indexOf(cl.niveau);
    const anneeEntree = A1 - idxNiveau;
    const n = (await un("SELECT nextval('seq_matricule') AS n")).n;
    const e = {
      prenom: pr,
      nom: famille.nom,
      sexe,
      naissance,
      classe: cl,
      famille,
      capacite: niveauCapacite || 8 + alea() * 10,
      matricule: `E${anneeEntree}-${String(n).padStart(4, '0')}`,
    };
    e.id = (
      await un(
        `INSERT INTO eleves (matricule, nom, prenom, date_naissance, lieu_naissance, sexe, adresse, antecedents_medicaux, annee_entree, consentement_rgpd_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [
          e.matricule,
          e.nom,
          e.prenom,
          naissance,
          choisir(VILLES),
          sexe,
          famille.adresse,
          choisir(MEDICAL),
          `${anneeEntree}-${anneeEntree + 1}`,
          new Date(anneeEntree, 7, 20),
          new Date(anneeEntree, 7, 20),
        ]
      )
    ).id;
    for (const p of famille.parents) await c.query('INSERT INTO parents_eleves (parent_id, eleve_id, lien) VALUES ($1,$2,$3)', [p.id, e.id, p.lien]);
    await c.query(
      `INSERT INTO inscriptions (eleve_id, classe_id, annee_scolaire, mode_affectation, date_affectation) VALUES ($1,$2,$3,'manuelle',$4)`,
      [e.id, cl.id, annee, `${A1}-09-01`]
    );
    if (idxNiveau > 0) {
      const p = precParNiveau[NIV[idxNiveau - 1]];
      await c.query(
        `INSERT INTO inscriptions (eleve_id, classe_id, annee_scolaire, mode_affectation, date_affectation) VALUES ($1,$2,$3,'manuelle',$4)`,
        [e.id, p.id, anneePrec, `${A1 - 1}-09-01`]
      );
      e.classePrec = p;
    }
    eleves.push(e);
    return e;
  };
  const naissancePour = (cl) => `${A1 - 6 - NIV.indexOf(cl.niveau)}-${String(entre(1, 12)).padStart(2, '0')}-${String(entre(1, 28)).padStart(2, '0')}`;
  const adresseAleatoire = () => `${entre(2, 120)} ${choisir(RUES)}, ${choisir(VILLES)}`;
  const parCle = Object.fromEntries(CLASSES.map((x) => [x.cle, x]));

  // Famille de démonstration : Amel Ben Ali (parent@ecole.tn), deux enfants
  const benAli = await nouvelleFamille('Ben Ali', 'Amel', 'Nizar', 'parent@ecole.tn', '14 rue Ibn Khaldoun, Sousse');
  const yasmine = await nouvelEleve(benAli, parCle.ce1a, { prenom: 'Yasmine', sexe: 'F', naissance: `${A1 - 7}-04-12`, niveauCapacite: 15.5 });
  const adam = await nouvelEleve(benAli, parCle.cm1a, { prenom: 'Adam', sexe: 'M', naissance: `${A1 - 9}-02-03`, niveauCapacite: 12.5 });
  prenomsPris.add('Yasmine');
  prenomsPris.add('Adam');

  // Trois autres fratries
  for (const [c1, c2] of [
    ['cpa', 'ce2a'],
    ['ce1b', 'cm2a'],
    ['ce2a', 'cm1a'],
  ]) {
    const nom = nomsLibres.pop();
    const f = await nouvelleFamille(nom, meres.pop(), alea() < 0.8 ? peres.pop() : null, null, adresseAleatoire());
    for (const cle of [c1, c2]) {
      const sexe = alea() < 0.5 ? 'F' : 'M';
      await nouvelEleve(f, parCle[cle], { prenom: prenom(sexe), sexe, naissance: naissancePour(parCle[cle]) });
    }
  }
  // Compléter chaque classe à 8 élèves
  for (const cl of CLASSES) {
    while (eleves.filter((e) => e.classe === cl).length < 8) {
      const nom = nomsLibres.pop();
      const f = await nouvelleFamille(nom, meres.pop() || 'Samira', alea() < 0.55 ? peres.pop() || null : null, null, adresseAleatoire());
      const sexe = alea() < 0.5 ? 'F' : 'M';
      await nouvelEleve(f, cl, { prenom: prenom(sexe), sexe, naissance: naissancePour(cl) });
    }
  }

  // Comptes élèves (identifiant prenom.nom@eleve.ecole.tn ; Adam = eleve@ecole.tn)
  for (const e of eleves) {
    const email = e === adam ? 'eleve@ecole.tn' : `${slug(e.prenom)}.${slug(e.nom)}@eleve.ecole.tn`;
    const uid = await utilisateur('eleve', e.prenom, e.nom, email);
    e.utilisateur = uid;
    await c.query('UPDATE eleves SET utilisateur_id = $1 WHERE id = $2', [uid, e.id]);
  }

  // ---------- Emploi du temps (sans conflit) ----------
  const CRENEAUX = [];
  for (let j = 1; j <= 6; j++) for (const [d, f] of [['08:00', '09:00'], ['09:00', '10:00'], ['10:00', '11:00'], ['11:00', '12:00']]) CRENEAUX.push({ jour: j, debut: d, fin: f });
  for (const j of [1, 2, 4, 5]) for (const [d, f] of [['14:00', '15:00'], ['15:00', '16:00']]) CRENEAUX.push({ jour: j, debut: d, fin: f });
  const occupeClasse = new Map(CLASSES.map((x) => [x.cle, new Set()]));
  const occupeEns = new Map(Object.keys(ens).map((k) => [k, new Set()]));
  const planning = [];
  const placer = (cl, m, e, s) => {
    occupeClasse.get(cl.cle).add(s);
    occupeEns.get(e).add(s);
    planning.push({ cl, m, e, s });
  };
  // Français : rotation sans conflit (l'enseignante intervient dans les 6 classes)
  CLASSES.forEach((cl, k) => {
    for (let s = k; s < 30; s += 6) placer(cl, 'francais', 'olfa', s);
  });
  const placerHeures = (cl, m, e, heures) => {
    for (let h = 0; h < heures; h++) {
      const joursUtilises = new Set(planning.filter((p) => p.cl === cl && p.m === m).map((p) => CRENEAUX[p.s].jour));
      const libres = melanger(CRENEAUX.map((_, i) => i)).filter((s) => !occupeClasse.get(cl.cle).has(s) && !occupeEns.get(e).has(s));
      const s = libres.find((x) => !joursUtilises.has(CRENEAUX[x].jour)) ?? libres[0];
      if (s !== undefined) placer(cl, m, e, s);
    }
  };
  for (const cl of CLASSES) {
    placerHeures(cl, 'eps', 'walid', 1);
    placerHeures(cl, 'art', 'ines', 1);
    if (cl.niveau === 'CM1') placerHeures(cl, 'anglais_cm1', 'ines', 2);
    if (cl.niveau === 'CM2') placerHeures(cl, 'anglais_cm2', 'ines', 2);
  }
  for (const cl of CLASSES) {
    placerHeures(cl, 'arabe', cl.tit, 6);
    placerHeures(cl, 'maths', cl.tit, 5);
    placerHeures(cl, 'eveil', cl.tit, 3);
    placerHeures(cl, 'civique', cl.tit, 1);
  }
  for (const p of planning) {
    const cr = CRENEAUX[p.s];
    const s = p.m === 'eps' ? salle.terrain : p.m === 'art' ? salle.poly : salle[p.cl.salle];
    await c.query(
      `INSERT INTO creneaux (classe_id, matiere_id, enseignant_id, salle_id, jour, heure_debut, heure_fin, annee_scolaire) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [p.cl.id, mat[p.m], ens[p.e], s, cr.jour, cr.debut, cr.fin, annee]
    );
  }

  // ---------- Évaluations et notes ----------
  const noteSur20 = (e, decalage = 0) => {
    const v = e.capacite + decalage + (alea() - 0.5) * 6;
    return Math.min(20, Math.max(3, Math.round(v * 2) / 2));
  };
  const dateEval = (joursAvant) => {
    const d = decaler(-joursAvant, aujourdhui);
    return dateLocaleIso(d < debutAnnee ? decaler(entre(5, 12), debutAnnee) : d);
  };
  const evalAvecNotes = async (cl, m, enseignant, titre, type, dateIso, anneeEval, liste, sansNotes = false) => {
    const t = trimestreDeDate(dateIso);
    const ev = (
      await un(
        `INSERT INTO evaluations (classe_id, matiere_id, enseignant_id, titre, type, trimestre, date_evaluation, bareme, annee_scolaire, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,20,$8,$9) RETURNING id`,
        [cl.id, mat[m], ens[enseignant], titre, type, t, dateIso, anneeEval, new Date(`${dateIso}T12:00:00`)]
      )
    ).id;
    if (sansNotes) return ev;
    const offset = { arabe: 0.5, francais: -0.5, maths: 0, eveil: 0.8, civique: 1.5, art: 2, eps: 2.5, anglais_cm1: 0.5, anglais_cm2: 0.5 }[m] || 0;
    for (const e of liste) {
      await c.query('INSERT INTO notes (evaluation_id, eleve_id, valeur, annee_scolaire, created_at) VALUES ($1,$2,$3,$4,$5)', [
        ev,
        e.id,
        noteSur20(e, offset),
        anneeEval,
        new Date(`${dateIso}T18:00:00`),
      ]);
    }
    return ev;
  };
  for (const cl of CLASSES) {
    const liste = eleves.filter((e) => e.classe === cl);
    for (const m of cl.matieres) {
      const enseignant = affect[`${cl.cle}|${m}`];
      await evalAvecNotes(cl, m, enseignant, `Contrôle n°1 — ${NOM_MATIERE[m]}`, 'controle_continu', dateEval(entre(18, 24)), annee, liste);
      if (['arabe', 'francais', 'maths'].includes(m)) {
        const vide = cl.cle === 'ce1a' && m === 'maths';
        await evalAvecNotes(
          cl,
          m,
          enseignant,
          vide ? 'Contrôle n°2 — Calcul mental' : `Contrôle n°2 — ${NOM_MATIERE[m]}`,
          'controle_continu',
          dateEval(vide ? 3 : entre(6, 10)),
          annee,
          liste,
          vide
        );
      }
    }
  }
  // Historique : examens trimestriels de l'année précédente
  for (const p of PREC) {
    const liste = eleves.filter((e) => e.classePrec === p);
    if (!liste.length) continue;
    const matieres = ['arabe', 'francais', 'maths', 'eveil', 'civique', 'art', 'eps'];
    if (p.niveau === 'CM1') matieres.push('anglais_cm1');
    const prof = (m) => ({ francais: 'olfa', eps: 'walid', art: 'ines', anglais_cm1: 'ines' })[m] || p.tit;
    for (const [t, dateIso] of [
      [1, `${A1 - 1}-12-08`],
      [2, `${A1}-03-09`],
      [3, `${A1}-05-25`],
    ]) {
      for (const m of matieres) {
        await evalAvecNotes(p, m, prof(m), `Examen du ${t === 1 ? '1er' : `${t}e`} trimestre — ${NOM_MATIERE[m]}`, 'examen', dateIso, anneePrec, liste);
      }
    }
  }

  // ---------- Finances ----------
  const tarifsCourants = [];
  for (const [libelle, type, montant, niveau, echeance] of [
    ['Frais d’inscription', 'inscription', 150, null, `${A1}-09-15`],
    ['Fournitures scolaires (CP)', 'autre', 60, 'CP', `${A1}-09-15`],
    ['Scolarité — 1re tranche', 'tranche', 450, null, `${A1}-09-30`],
    ['Scolarité — 2e tranche', 'tranche', 450, null, `${A1 + 1}-01-15`],
    ['Scolarité — 3e tranche', 'tranche', 450, null, `${A1 + 1}-04-15`],
  ]) {
    tarifsCourants.push({
      libelle,
      montant,
      niveau,
      echeance,
      id: (await un('INSERT INTO tarifs (libelle, type, montant, niveau, date_echeance, annee_scolaire) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [libelle, type, montant, niveau, echeance, annee])).id,
    });
  }
  const tarifsPrec = [];
  for (const [libelle, type, montant, echeance] of [
    ['Frais d’inscription', 'inscription', 140, `${A1 - 1}-09-15`],
    ['Scolarité — 1re tranche', 'tranche', 430, `${A1 - 1}-09-30`],
    ['Scolarité — 2e tranche', 'tranche', 430, `${A1}-01-15`],
    ['Scolarité — 3e tranche', 'tranche', 430, `${A1}-04-15`],
  ]) {
    tarifsPrec.push({
      montant,
      echeance,
      id: (await un('INSERT INTO tarifs (libelle, type, montant, niveau, date_echeance, annee_scolaire) VALUES ($1,$2,$3,NULL,$4,$5) RETURNING id', [libelle, type, montant, echeance, anneePrec])).id,
    });
  }
  const aPayer = [];
  const mode = () => choisir(['especes', 'especes', 'especes', 'especes', 'virement', 'virement', 'mobile_money', 'mobile_money', 'cheque']);
  const datePaiement = (echeance, avant) => {
    let d = decaler(-entre(0, avant), new Date(`${echeance}T10:00:00`));
    if (d > aujourdhui) d = decaler(-entre(3, 20), aujourdhui); // paiement anticipé d'une échéance future
    const plancher = new Date(Number(echeance.slice(0, 4)) - (Number(echeance.slice(5, 7)) < 8 ? 1 : 0), 8, 5);
    return dateLocaleIso(d < plancher ? plancher : d);
  };
  for (const e of eleves) {
    const t = tarifsCourants.filter((x) => !x.niveau || x.niveau === e.classe.niveau);
    let scenario = alea();
    if (e === yasmine) scenario = 0.3; // à jour (inscription + 1re tranche)
    if (e === adam) scenario = 0.84; // inscription seulement -> retard
    const echus = t.filter((x) => new Date(x.echeance) <= aujourdhui);
    let lignes;
    if (scenario < 0.65) lignes = echus;
    else if (scenario < 0.8) lignes = t.filter((x) => x.niveau || x.libelle.includes('inscription') || x.libelle.includes('1re') || x.libelle.includes('2e'));
    else if (scenario < 0.92) lignes = t.filter((x) => x.libelle.includes('inscription'));
    else lignes = [];
    for (const l of lignes) aPayer.push({ e, tarif: l.id, montant: l.montant, date: datePaiement(l.echeance, 12), annee, mode: mode() });
    if (e.classePrec) {
      for (const l of tarifsPrec) aPayer.push({ e, tarif: l.id, montant: l.montant, date: datePaiement(l.echeance, 10), annee: anneePrec, mode: mode() });
    }
  }
  aPayer.sort((a, b) => a.date.localeCompare(b.date));
  for (const p of aPayer) {
    const n = (await un("SELECT nextval('seq_recu') AS n")).n;
    p.numero = `R${p.annee.slice(0, 4)}-${String(n).padStart(5, '0')}`;
    p.id = (
      await un(
        `INSERT INTO paiements (numero_recu, eleve_id, tarif_id, montant, date_paiement, mode, reference, annee_scolaire, enregistre_par, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [
          p.numero,
          p.e.id,
          p.tarif,
          p.montant,
          p.date,
          p.mode,
          p.mode === 'virement' ? `VIR-${entre(100000, 999999)}` : p.mode === 'cheque' ? `CHQ-${entre(1000000, 9999999)}` : p.mode === 'mobile_money' ? `MM-${entre(10000000, 99999999)}` : null,
          p.annee,
          comptable,
          new Date(`${p.date}T10:30:00`),
        ]
      )
    ).id;
  }

  // ---------- Messagerie ----------
  const message = async ({ de, a, objet, corps, eleve = null, fil = null, quand, lu = true, auto = false }) => {
    const m = (
      await un(
        `INSERT INTO messages (expediteur_id, objet, corps, eleve_id, fil_id, statut, automatique, envoye_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,'envoye',$6,$7,$7,$7) RETURNING id`,
        [de, objet, corps, eleve, fil, auto, quand]
      )
    ).id;
    for (const d of a) {
      await c.query('INSERT INTO messages_destinataires (message_id, destinataire_id, lu_at) VALUES ($1,$2,$3)', [m, d, lu ? new Date(quand.getTime() + 3600 * 1000) : null]);
    }
    return m;
  };
  const journalEnvoi = async (destinataires, contexte, sujet, contenu, refType, refId, quand) => {
    for (const d of destinataires) {
      const u = await un('SELECT prenom, nom, email FROM utilisateurs WHERE id = $1', [d]);
      await c.query(
        `INSERT INTO journal_envois (destinataire_id, destinataire, canal, contexte, sujet, contenu, statut, ref_type, ref_id, created_at)
         VALUES ($1,$2,'messagerie',$3,$4,$5,'envoye',$6,$7,$8), ($1,$9,'email',$3,$4,$5,'simule',$6,$7,$8)`,
        [d, `${u.prenom} ${u.nom}`, contexte, sujet, contenu, refType, refId, quand, u.email]
      );
    }
  };
  const parentsBenAli = benAli.parents.map((p) => p.id);
  const amel = benAli.parents[0].id;

  // Message automatique après le paiement de la 1re tranche de Yasmine
  const paiementYasmine = aPayer.filter((p) => p.e === yasmine && p.annee === annee).pop();
  if (paiementYasmine) {
    const situationPayee = aPayer.filter((p) => p.e === yasmine && p.annee === annee).reduce((s, p) => s + p.montant, 0);
    const corps =
      `Bonjour,\n\nNous confirmons la réception d'un paiement pour Yasmine Ben Ali (CE1 A) :\n\n` +
      `  • Montant payé : ${formatMontant(paiementYasmine.montant)}\n  • Date : ${formatDate(paiementYasmine.date)}\n` +
      `  • Mode de paiement : ${LIBELLES_MODE[paiementYasmine.mode]}\n  • Objet : Scolarité — 1re tranche\n` +
      `  • Nouveau solde restant (${annee}) : ${formatMontant(1500 - situationPayee)}\n\n` +
      `Reçu N° ${paiementYasmine.numero} — téléchargement : /api/paiements/${paiementYasmine.id}/recu\n\nMerci.\nMourad Saidi — Comptabilité`;
    const quand = new Date(`${paiementYasmine.date}T10:31:00`);
    const objet = `Paiement reçu — Yasmine Ben Ali — Reçu ${paiementYasmine.numero}`;
    await message({ de: comptable, a: parentsBenAli, objet, corps, eleve: yasmine.id, quand, auto: true });
    await journalEnvoi(parentsBenAli, 'paiement', objet, corps, 'paiement', paiementYasmine.id, quand);
  }

  // Relances (impayés) déjà envoyées il y a 5 jours
  const enRetard = eleves.filter((e) => {
    const du = tarifsCourants.filter((t) => (!t.niveau || t.niveau === e.classe.niveau) && new Date(t.echeance) <= aujourdhui).reduce((s, t) => s + t.montant, 0);
    const paye = aPayer.filter((p) => p.e === e && p.annee === annee).reduce((s, p) => s + p.montant, 0);
    e.retard = du - paye;
    return e.retard > 0;
  });
  for (const e of enRetard.slice(0, 4).concat(enRetard.includes(adam) ? [] : [])) {
    const quand = aHeure(decaler(-5, aujourdhui), 8, 5);
    const dest = e.famille.parents.map((p) => p.id);
    const objet = `Rappel de paiement – ${e.prenom} ${e.nom}`;
    const corps =
      `Bonjour,\n\nSauf erreur de notre part, le compte de ${e.prenom} ${e.nom} (${e.classe.niveau} ${e.classe.section}) présente un retard de paiement de ${formatMontant(e.retard)}.\n\n` +
      `Merci de régulariser la situation auprès du secrétariat (espèces, virement ou mobile money). Si le paiement a déjà été effectué, veuillez ne pas tenir compte de ce message.\n\nLe service comptabilité`;
    await message({ de: comptable, a: dest, objet, corps, eleve: e.id, quand, auto: true, lu: e !== adam });
    await journalEnvoi(dest, 'relance', objet, corps, 'eleve', e.id, quand);
    await c.query('INSERT INTO relances (eleve_id, montant_du, annee_scolaire, automatique, created_at) VALUES ($1,$2,$3,TRUE,$4)', [e.id, e.retard, annee, quand]);
  }
  if (!enRetard.slice(0, 4).includes(adam) && adam.retard > 0) {
    const quand = aHeure(decaler(-5, aujourdhui), 8, 6);
    const objet = 'Rappel de paiement – Adam Ben Ali';
    const corps = `Bonjour,\n\nSauf erreur de notre part, le compte d'Adam Ben Ali (CM1 A) présente un retard de paiement de ${formatMontant(adam.retard)} (Scolarité — 1re tranche, échéance du 30/09/${A1}).\n\nMerci de régulariser la situation auprès du secrétariat (espèces, virement ou mobile money). Si le paiement a déjà été effectué, veuillez ne pas tenir compte de ce message.\n\nLe service comptabilité`;
    await message({ de: comptable, a: parentsBenAli, objet, corps, eleve: adam.id, quand, auto: true, lu: false });
    await journalEnvoi(parentsBenAli, 'relance', objet, corps, 'eleve', adam.id, quand);
    await c.query('INSERT INTO relances (eleve_id, montant_du, annee_scolaire, automatique, created_at) VALUES ($1,$2,$3,TRUE,$4)', [adam.id, adam.retard, annee, quand]);
  }
  await c.query(
    "INSERT INTO parametres (cle, valeur) VALUES ('derniere_relance_auto', $1) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur",
    [dateLocaleIso(aujourdhui)]
  );

  // Conversation enseignant <-> parent (fil par élève)
  const fil = await message({
    de: ens.sami,
    a: [amel],
    objet: 'Progrès en lecture de Yasmine',
    corps:
      'Bonjour Madame Ben Ali,\n\nJe tenais à vous dire que Yasmine fait de très beaux progrès en lecture depuis la rentrée. Elle participe davantage en classe et lit avec plus d’assurance.\n\nPour continuer dans ce sens, je vous propose de lire avec elle 10 minutes chaque soir le livret distribué cette semaine.\n\nBien cordialement,\nSami Gharbi',
    eleve: yasmine.id,
    quand: aHeure(decaler(-6, aujourdhui), 16, 40),
  });
  await message({
    de: amel,
    a: [ens.sami],
    objet: 'RE: Progrès en lecture de Yasmine',
    corps: 'Bonjour Monsieur Gharbi,\n\nMerci beaucoup pour ce retour, cela nous fait très plaisir. Nous allons lire le livret avec elle tous les soirs.\n\nUne question : faut-il aussi lui faire réviser les tables d’addition ?\n\nCordialement,\nAmel Ben Ali',
    eleve: yasmine.id,
    fil,
    quand: aHeure(decaler(-5, aujourdhui), 20, 15),
  });
  await message({
    de: ens.sami,
    a: [amel],
    objet: 'RE: Progrès en lecture de Yasmine',
    corps: 'Oui, tout à fait : 5 minutes de calcul mental par jour suffisent (tables de 1 à 5). Un contrôle de calcul mental est prévu cette semaine.\n\nBonne soirée,\nSami Gharbi',
    eleve: yasmine.id,
    fil,
    quand: aHeure(decaler(-1, aujourdhui), 17, 5),
    lu: false,
  });
  await message({
    de: admin,
    a: parentsBenAli,
    objet: 'Dossier d’Adam — certificat médical à fournir',
    corps:
      'Bonjour,\n\nPour finaliser le dossier d’Adam pour les activités sportives, merci de déposer un certificat médical d’aptitude au secrétariat avant la fin du mois.\n\nCordialement,\nFaten Belhadj — Direction',
    eleve: adam.id,
    quand: aHeure(decaler(-3, aujourdhui), 11, 20),
    lu: false,
  });
  await message({
    de: admin,
    a: [adam.utilisateur],
    objet: 'Inscription au club de lecture',
    corps: 'Bonjour Adam,\n\nTu t’es inscrit au club de lecture du mercredi. Rendez-vous mercredi à 11 h à la bibliothèque avec ton livre préféré !\n\nLa direction',
    quand: aHeure(decaler(-2, aujourdhui), 9, 0),
    lu: false,
  });
  const autreEleve = eleves.find((e) => e.classe.cle === 'ce2a' && e.famille.parents.length);
  if (autreEleve) {
    const f2 = await message({
      de: ens.olfa,
      a: [autreEleve.famille.parents[0].id],
      objet: `Dictées de ${autreEleve.prenom}`,
      corps: `Bonjour,\n\n${autreEleve.prenom} a oublié son cahier de dictées deux fois cette semaine. Pouvez-vous vérifier son cartable le soir ?\n\nMerci,\nOlfa Hammami`,
      eleve: autreEleve.id,
      quand: aHeure(decaler(-4, aujourdhui), 13, 10),
    });
    await message({
      de: autreEleve.famille.parents[0].id,
      a: [ens.olfa],
      objet: `RE: Dictées de ${autreEleve.prenom}`,
      corps: 'Bonjour Madame,\n\nC’est noté, nous y veillerons. Merci de nous avoir prévenus.',
      eleve: autreEleve.id,
      fil: f2,
      quand: aHeure(decaler(-4, aujourdhui), 19, 45),
    });
  }
  // Brouillon de l'enseignant de démonstration
  const brouillon = (
    await un(
      `INSERT INTO messages (expediteur_id, objet, corps, eleve_id, statut, created_at, updated_at)
       VALUES ($1, 'Sortie pédagogique — autorisation parentale', $2, $3, 'brouillon', now(), now()) RETURNING id`,
      [ens.sami, 'Bonjour,\n\nLa classe de CE1 A visitera le musée archéologique de Sousse. Merci de signer l’autorisation jointe…', yasmine.id]
    )
  ).id;
  await c.query('INSERT INTO messages_destinataires (message_id, destinataire_id) VALUES ($1,$2)', [brouillon, amel]);

  // ---------- Annonces (dont une annonce corrective) ----------
  const annonce = async (titre, contenu, audience, quand, corrige = null, statut = 'publiee') =>
    (
      await un(
        `INSERT INTO annonces (titre, contenu, audience, auteur_id, statut, corrige_id, publiee_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id`,
        [titre, contenu, audience, admin, statut, corrige, statut === 'publiee' ? quand : null, quand]
      )
    ).id;
  const dateReunion = decaler(12, aujourdhui);
  await annonce(
    'Réunion parents–enseignants du 1er trimestre',
    `Les parents sont invités à rencontrer les enseignants le ${formatDate(dateLocaleIso(dateReunion))} de 14 h à 17 h. ` +
      'Chaque enseignant recevra les familles dans sa salle de classe. Les bulletins du 1er trimestre seront commentés à cette occasion.',
    'tous',
    aHeure(decaler(-10, aujourdhui), 9, 0)
  );
  const sortie = await annonce(
    'Sortie pédagogique au musée archéologique de Sousse',
    `Les classes de CE1 et CE2 visiteront le musée archéologique de Sousse le ${formatDate(dateLocaleIso(decaler(9, aujourdhui)))}. ` +
      'Départ à 8 h 30, retour prévu à 12 h. Merci de prévoir un goûter et une casquette.',
    'parents',
    aHeure(decaler(-7, aujourdhui), 10, 0)
  );
  await annonce(
    'Rectificatif : sortie pédagogique — nouvelle date',
    `Suite à une contrainte du musée, la sortie des classes de CE1 et CE2 est déplacée au ${formatDate(dateLocaleIso(decaler(16, aujourdhui)))}. ` +
      'Les horaires restent inchangés (départ 8 h 30, retour 12 h). Nous vous prions de nous excuser pour ce changement.',
    'parents',
    aHeure(decaler(-6, aujourdhui), 15, 30),
    sortie
  );
  await annonce(
    'Journée sportive inter-classes',
    'Une journée sportive sera organisée samedi matin sur le terrain de l’école : course relais, football et jeux collectifs. Tenue de sport obligatoire.',
    'tous',
    aHeure(decaler(-2, aujourdhui), 8, 30)
  );
  await annonce(
    'Conseil des enseignants',
    'Réunion du conseil des enseignants jeudi à 16 h 15 en salle polyvalente : préparation des bulletins du 1er trimestre.',
    'personnel',
    aHeure(decaler(-4, aujourdhui), 12, 0)
  );
  await annonce(
    'Calendrier des examens du 1er trimestre',
    'Les examens du 1er trimestre auront lieu la première quinzaine de décembre. Le calendrier détaillé par classe sera communiqué prochainement.',
    'tous',
    aHeure(decaler(-1, aujourdhui), 18, 0),
    null,
    'brouillon'
  );

  // ---------- Devoirs ----------
  const devoir = async ({ cl, m, enseignant, titre, description, remise, fichierEnonce, correction }) => {
    const id = (
      await un(
        `INSERT INTO devoirs (titre, description, matiere_id, classe_id, enseignant_id, date_remise, bareme, correction_publiee_at, annee_scolaire, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,20,$7,$8,$9) RETURNING id`,
        [titre, description, mat[m], cl.id, ens[enseignant], remise, correction ? new Date(remise.getTime() + 5 * 3600 * 1000) : null, annee, decaler(-7, remise)]
      )
    ).id;
    if (fichierEnonce) {
      const buf = await pdfSimple(titre, `${NOM_MATIERE[m]} — ${cl.niveau} ${cl.section} — à rendre le ${formatDate(dateLocaleIso(remise))}`, fichierEnonce);
      await enregistrerContenu(c, buf, `${nomFichier(titre).slice(0, 48)}-enonce.pdf`, 'devoir_enonce', id, ens[enseignant]);
    }
    if (correction) {
      const buf = await pdfSimple(`Corrigé — ${titre}`, `${NOM_MATIERE[m]} — ${cl.niveau} ${cl.section}`, correction);
      await enregistrerContenu(c, buf, `${nomFichier(titre).slice(0, 48)}-corrige.pdf`, 'devoir_correction', id, ens[enseignant]);
    }
    return id;
  };
  const deposer = async (devoirId, e, quand, { note = null, commentaire = null, publiee = false } = {}) => {
    const s = (
      await un(
        `INSERT INTO soumissions (devoir_id, eleve_id, commentaire_eleve, depose_at, note, commentaire_enseignant, note_publiee_at, annee_scolaire)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [devoirId, e.id, alea() < 0.3 ? 'J’ai fait tous les exercices.' : null, quand, note, commentaire, publiee ? decaler(1, quand) : null, annee]
      )
    ).id;
    const buf = await pdfSimple(`Travail de ${e.prenom} ${e.nom}`, `Déposé le ${formatDate(dateLocaleIso(quand))}`, [
      'Exercice 1 : réponses rédigées par l’élève.',
      'Exercice 2 : calculs posés et vérifiés.',
    ]);
    await enregistrerContenu(c, buf, `travail-${nomFichier(e.prenom)}-${nomFichier(e.nom)}.pdf`, 'soumission', s, e.utilisateur);
  };
  const eleveDe = (cle) => eleves.filter((e) => e.classe.cle === cle);
  const commentaires = ['Très bon travail, bravo !', 'Bien, attention aux retenues.', 'Travail soigné.', 'Des progrès, continue ainsi.', 'Revois la méthode de l’exercice 2.'];

  // CE1 A — Mathématiques (passé, noté, corrigé)
  const d1Remise = aHeure(decaler(-3, aujourdhui), 18, 0);
  const d1 = await devoir({
    cl: parCle.ce1a,
    m: 'maths',
    enseignant: 'sami',
    titre: 'Fiche n°3 — Additions avec retenue',
    description: 'Faire les exercices 1 à 4 de la fiche. Poser les additions en colonnes et vérifier chaque résultat.',
    remise: d1Remise,
    fichierEnonce: ['Exercice 1 : 27 + 15 = …   38 + 46 = …   59 + 23 = …', 'Exercice 2 : Pose et calcule : 145 + 78 ; 236 + 159.', 'Exercice 3 : Problème — Yassine a 48 billes, il en gagne 35. Combien en a-t-il ?', 'Exercice 4 : Complète la grille d’additions.'],
    correction: ['Exercice 1 : 42 ; 84 ; 82', 'Exercice 2 : 223 ; 395', 'Exercice 3 : 48 + 35 = 83 billes', 'Exercice 4 : voir la grille corrigée en classe.'],
  });
  for (const [i, e] of eleveDe('ce1a').entries()) {
    if (i >= 6 && e !== yasmine) continue;
    const enRetardDepot = i === 4;
    const quand = enRetardDepot ? aHeure(decaler(-2, aujourdhui), 9, 30) : aHeure(decaler(-4 - (i % 2), aujourdhui), 18 + (i % 3), 10);
    const note = e === yasmine ? 16 : i < 5 ? Math.min(20, Math.round(e.capacite + (alea() - 0.3) * 4)) : null;
    await deposer(d1, e, quand, { note, commentaire: note ? (e === yasmine ? 'Très bon travail, bravo !' : choisir(commentaires)) : null, publiee: note !== null });
  }
  // CE1 A — Arabe (à venir)
  const d2 = await devoir({
    cl: parCle.ce1a,
    m: 'arabe',
    enseignant: 'sami',
    titre: 'Lecture et compréhension — texte n°4',
    description: 'Lire le texte du livret page 18 et répondre aux questions 1 à 5 sur le cahier.',
    remise: aHeure(decaler(4, aujourdhui), 18, 0),
    fichierEnonce: ['Lire le texte page 18 du livret.', 'Répondre aux questions de compréhension 1 à 5.', 'Recopier la phrase en gras en écriture soignée.'],
  });
  for (const e of eleveDe('ce1a').filter((x) => x !== yasmine).slice(0, 2)) await deposer(d2, e, aHeure(decaler(-1, aujourdhui), 19, 0));
  // CE1 A — Français (à venir)
  await devoir({
    cl: parCle.ce1a,
    m: 'francais',
    enseignant: 'olfa',
    titre: 'Dictée préparée n°2',
    description: 'Apprendre les mots de la liste et s’entraîner à les écrire. La dictée aura lieu en classe.',
    remise: aHeure(decaler(2, aujourdhui), 8, 0),
    fichierEnonce: ['Mots à apprendre : maison, jardin, soleil, école, cartable, cahier, crayon, maîtresse.', 'Écrire chaque mot trois fois.'],
  });
  // CM1 A — Éveil scientifique (à venir : Adam peut déposer son travail)
  const d4 = await devoir({
    cl: parCle.cm1a,
    m: 'eveil',
    enseignant: 'sonia',
    titre: 'Le cycle de l’eau — schéma à compléter',
    description: 'Compléter le schéma du cycle de l’eau avec les mots : évaporation, condensation, précipitations, ruissellement. Ajouter une phrase d’explication pour chaque étape.',
    remise: aHeure(decaler(6, aujourdhui), 18, 0),
    fichierEnonce: ['Complète le schéma avec : évaporation, condensation, précipitations, ruissellement.', 'Explique chaque étape en une phrase.', 'Bonus : donne un exemple observé près de chez toi.'],
  });
  for (const e of eleveDe('cm1a').filter((x) => x !== adam).slice(0, 3)) await deposer(d4, e, aHeure(decaler(-1, aujourdhui), 18, 30));
  // CM1 A — Mathématiques (passé, noté, corrigé)
  const d5 = await devoir({
    cl: parCle.cm1a,
    m: 'maths',
    enseignant: 'sonia',
    titre: 'Problèmes — les fractions',
    description: 'Résoudre les 4 problèmes de la fiche en détaillant les étapes.',
    remise: aHeure(decaler(-5, aujourdhui), 18, 0),
    fichierEnonce: ['Problème 1 : 3/4 d’un gâteau…', 'Problème 2 : comparer 2/3 et 3/5.', 'Problème 3 : additionner 1/4 + 2/4.', 'Problème 4 : fraction d’une quantité.'],
    correction: ['Problème 1 : 6 parts sur 8.', 'Problème 2 : 2/3 > 3/5.', 'Problème 3 : 3/4.', 'Problème 4 : 12 élèves.'],
  });
  for (const [i, e] of eleveDe('cm1a').entries()) {
    if (i >= 6 && e !== adam) continue;
    const note = e === adam ? 14.5 : Math.min(20, Math.round(e.capacite + (alea() - 0.3) * 4));
    await deposer(d5, e, aHeure(decaler(-6, aujourdhui), 17 + (i % 3), 0), {
      note,
      commentaire: e === adam ? 'Bon raisonnement, attention à la rédaction du problème 4.' : choisir(commentaires),
      publiee: true,
    });
  }
  // CM2 A — Anglais / CP A — Mathématiques (à venir)
  await devoir({
    cl: parCle.cm2a,
    m: 'anglais_cm2',
    enseignant: 'ines',
    titre: 'My family — vocabulary',
    description: 'Learn the family vocabulary (mother, father, brother, sister, grandmother, grandfather) and draw your family tree.',
    remise: aHeure(decaler(3, aujourdhui), 18, 0),
    fichierEnonce: ['Learn: mother, father, brother, sister, grandmother, grandfather, uncle, aunt.', 'Draw your family tree and write the names in English.'],
  });
  await devoir({
    cl: parCle.cpa,
    m: 'maths',
    enseignant: 'leila',
    titre: 'Compter jusqu’à 20',
    description: 'Compter les objets de chaque dessin et écrire le nombre dans la case.',
    remise: aHeure(decaler(1, aujourdhui), 8, 0),
    fichierEnonce: ['Compte les pommes et écris le nombre.', 'Relie chaque nombre à la bonne quantité.'],
  });
  await c.query('INSERT INTO devoirs_vus (devoir_id, eleve_id, parent_id, vu_at) VALUES ($1,$2,$3,$4)', [d1, yasmine.id, amel, aHeure(decaler(-2, aujourdhui), 20, 0)]);

  // ---------- Absences ----------
  const absence = async (e, joursAvant, periode, statut, justification = null) => {
    const d = dateLocaleIso(decaler(-joursAvant, aujourdhui));
    await c.query(
      `INSERT INTO absences (eleve_id, date_absence, periode, statut, justification, justifie_par, justifie_at, valide_par, valide_at, annee_scolaire, saisi_par, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
      [
        e.id,
        d,
        periode,
        statut,
        justification,
        justification ? e.famille.parents[0].id : null,
        justification ? decaler(-joursAvant + 1, aujourdhui) : null,
        statut === 'justifiee' || statut === 'refusee' ? admin : null,
        statut === 'justifiee' || statut === 'refusee' ? decaler(-joursAvant + 2, aujourdhui) : null,
        annee,
        ens[e.classe.tit],
        new Date(`${d}T08:15:00`),
      ]
    );
  };
  await absence(yasmine, 9, 'journee', 'justifiee', 'Fièvre, consultation chez le pédiatre (certificat remis).');
  await absence(yasmine, 2, 'matin', 'en_attente', 'Rendez-vous chez le dentiste à 9 h.');
  await absence(adam, 4, 'apres_midi', 'non_justifiee');
  const autres = melanger(eleves.filter((e) => e !== yasmine && e !== adam)).slice(0, 9);
  for (const [i, e] of autres.entries()) {
    const statut = i < 3 ? 'justifiee' : i < 5 ? 'en_attente' : 'non_justifiee';
    await absence(e, entre(1, 20), choisir(['matin', 'apres_midi', 'journee']), statut, statut !== 'non_justifiee' ? choisir(['Maladie (grippe).', 'Rendez-vous médical.', 'Raison familiale.']) : null);
  }

  // ---------- Pré-inscriptions en attente ----------
  const preinscription = async (enfant, naissance, sexe, niveau, parent, lien, email, telephone, quand, medical = null) => {
    const n = (await un("SELECT nextval('seq_preinscription') AS n")).n;
    await c.query(
      `INSERT INTO preinscriptions (reference, enfant_nom, enfant_prenom, date_naissance, lieu_naissance, sexe, niveau_souhaite, antecedents_medicaux,
          parent_nom, parent_prenom, lien, email, telephone, adresse, consentement, consentement_at, annee_scolaire, created_at)
       VALUES ($1,$2,$3,$4,'Sousse',$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE,$14,$15,$14)`,
      [
        `PI-${A1}-${String(n).padStart(4, '0')}`,
        enfant[1],
        enfant[0],
        naissance,
        sexe,
        niveau,
        medical,
        parent[1],
        parent[0],
        lien,
        email,
        telephone,
        adresseAleatoire(),
        quand,
        annee,
      ]
    );
  };
  await preinscription(['Lina', 'Ben Youssef'], `${A1 - 6}-05-21`, 'F', 'CP', ['Karima', 'Ben Youssef'], 'Mère', 'karima.benyoussef@exemple.tn', '+216 22 410 552', aHeure(decaler(-3, aujourdhui), 21, 12), 'Allergie aux arachides');
  await preinscription(['Omar', 'Haddad'], `${A1 - 8}-11-02`, 'M', 'CE2', ['Hichem', 'Haddad'], 'Père', 'hichem.haddad@exemple.tn', '+216 98 225 140', aHeure(decaler(-2, aujourdhui), 10, 45));
  await preinscription(['Eya', 'Mabrouk'], `${A1 - 10}-07-15`, 'F', null, ['Rim', 'Mabrouk'], 'Mère', 'rim.mabrouk@exemple.tn', '+216 55 731 904', aHeure(decaler(-1, aujourdhui), 8, 20));

  // ---------- Notifications initiales ----------
  const notif = async (u, type, titre, contenu, lien, joursAvant, lu = false) =>
    c.query('INSERT INTO notifications (utilisateur_id, type, titre, contenu, lien, lu_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [
      u,
      type,
      titre,
      contenu,
      lien,
      lu ? new Date() : null,
      decaler(-joursAvant, aujourdhui),
    ]);
  await notif(amel, 'message', 'Nouveau message de Sami Gharbi', 'RE: Progrès en lecture de Yasmine', `/messagerie/${fil}`, 1);
  await notif(amel, 'message', 'Nouveau message de Faten Belhadj', 'Dossier d’Adam — certificat médical à fournir', '/messagerie', 3);
  await notif(amel, 'devoir', 'Nouveau devoir d’Éveil scientifique — CM1 A', '« Le cycle de l’eau — schéma à compléter »', `/devoirs/${d4}`, 1);
  await notif(amel, 'annonce', 'Annonce : Journée sportive inter-classes', 'Une journée sportive sera organisée samedi matin…', '/annonces', 2, true);
  await notif(ens.sami, 'devoir', 'Travail déposé', 'Lecture et compréhension — texte n°4 (CE1 A)', `/devoirs/${d2}`, 1);
  await notif(adam.utilisateur, 'devoir', 'Nouveau devoir d’Éveil scientifique — CM1 A', '« Le cycle de l’eau — schéma à compléter »', `/devoirs/${d4}`, 1);
  await notif(adam.utilisateur, 'devoir', 'Note publiée — Problèmes — les fractions', 'Adam a obtenu 14,5/20 en Mathématiques.', `/devoirs/${d5}`, 4, true);
  for (const u of [admin, comptable]) {
    await notif(u, 'preinscription', 'Nouvelle pré-inscription en ligne', 'Eya Mabrouk — demande à valider.', '/preinscriptions', 1);
  }
}

module.exports = { chargerDonneesDemo, MOT_DE_PASSE };
