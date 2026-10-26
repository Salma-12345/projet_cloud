// Tests d'acceptation automatisés — vérifient les fonctionnalités du cahier des charges.
// Les tests créent des données (suffixe unique à chaque exécution) puis les nettoient
// autant que possible : ils peuvent être relancés, mais réinitialisez la démo avant une
// présentation (docker compose down -v puis docker compose up -d).
//   Avec Docker : docker compose exec app npm test
//   Sans Docker : BASE_URL=http://localhost:3000 npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const MDP = 'Ecole2026';

async function connecter(email, motDePasse = MDP) {
  const r = await fetch(`${BASE}/api/auth/connexion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, mot_de_passe: motDePasse }),
  });
  const corps = await r.json();
  if (r.status !== 200) throw new Error(`Connexion ${email} : ${r.status} ${corps.erreur}`);
  const cookie = r.headers.getSetCookie()[0].split(';')[0];
  const appel = async (methode, chemin, donnees, { brut = false } = {}) => {
    const opts = { method: methode, headers: { cookie } };
    if (donnees instanceof FormData) opts.body = donnees;
    else if (donnees !== undefined) {
      opts.headers['content-type'] = 'application/json';
      opts.body = JSON.stringify(donnees);
    }
    const rep = await fetch(`${BASE}/api${chemin}`, opts);
    if (brut) return rep;
    const type = rep.headers.get('content-type') || '';
    const json = type.includes('json') ? await rep.json() : null;
    return { status: rep.status, data: json };
  };
  return {
    profil: corps,
    get: (c) => appel('GET', c),
    post: (c, d) => appel('POST', c, d ?? {}),
    put: (c, d) => appel('PUT', c, d ?? {}),
    del: (c) => appel('DELETE', c),
    brut: (c) => appel('GET', c, undefined, { brut: true }),
  };
}

const fichierPdf = (nom) => new File([Buffer.from('%PDF-1.4\n% test\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')], nom, { type: 'application/pdf' });
const dans = (jours) => new Date(Date.now() + jours * 86400000).toISOString();
const S = {}; // sessions partagées
const U = Date.now().toString(36); // suffixe unique : les tests peuvent être relancés

test('Connexion des 5 rôles de démonstration et refus des mauvais identifiants', async () => {
  for (const [cle, email] of [
    ['admin', 'admin@ecole.tn'],
    ['ens', 'enseignant@ecole.tn'],
    ['parent', 'parent@ecole.tn'],
    ['eleve', 'eleve@ecole.tn'],
    ['compta', 'comptable@ecole.tn'],
  ]) {
    S[cle] = await connecter(email);
  }
  S.sonia = await connecter('sonia.bensalah@ecole.tn');
  assert.equal(S.parent.profil.enfants.length, 2);
  assert.equal(S.eleve.profil.eleve.prenom, 'Adam');
  const r = await fetch(`${BASE}/api/auth/connexion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@ecole.tn', mot_de_passe: 'mauvais' }),
  });
  assert.equal(r.status, 401);
  assert.equal((await fetch(`${BASE}/api/eleves`)).status, 401);
});

test('RBAC : chaque rôle est limité à son périmètre', async () => {
  assert.equal((await S.parent.get('/utilisateurs?role=parent')).status, 403);
  assert.equal((await S.ens.post('/classes', { niveau: 'CP', section: 'Z', capacite_max: 20 })).status, 403);
  assert.equal((await S.eleve.post('/paiements', {})).status, 403);
  assert.equal((await S.compta.post('/creneaux', {})).status, 403);
  const autres = (await S.admin.get('/eleves')).data.filter((e) => !S.parent.profil.enfants.some((x) => x.id === e.id));
  assert.equal((await S.parent.get(`/eleves/${autres[0].id}`)).status, 403);
  assert.equal((await S.parent.get(`/bulletins/eleve/${autres[0].id}?trimestre=1`)).status, 403);
  // L'enseignant ne voit que les élèves de ses classes
  const sesEleves = (await S.ens.get('/eleves')).data;
  assert.ok(sesEleves.length > 0 && sesEleves.every((e) => e.classe === 'CE1 A'));
});

test('Critère 1 & 7 — CRUD classes (suppression contrôlée)', async () => {
  const c = await S.admin.post('/classes', { niveau: 'CE2', section: 'B', capacite_max: 24 });
  assert.equal(c.status, 201);
  const m = await S.admin.put(`/classes/${c.data.id}`, { niveau: 'CE2', section: 'B', capacite_max: 25 });
  assert.equal(m.data.capacite_max, 25);
  // Classe contenant des élèves : confirmation exigée
  const classes = (await S.admin.get('/classes')).data;
  const pleine = classes.find((x) => x.effectif > 0);
  const refus = await S.admin.del(`/classes/${pleine.id}`);
  assert.equal(refus.status, 409);
  assert.equal(refus.data.confirmationRequise, true);
  // Contrôle des effectifs
  const petite = await S.admin.post('/classes', { niveau: 'CM2', section: 'C', capacite_max: 1 });
  const e1 = (await S.admin.get('/eleves?q=yasmine')).data[0];
  const e2 = (await S.admin.get('/eleves?q=adam')).data[0];
  const trop = await S.admin.post(`/classes/${petite.data.id}/eleves`, { eleve_ids: [e1.id, e2.id] });
  assert.equal(trop.status, 409);
  assert.equal((await S.admin.del(`/classes/${petite.data.id}`)).status, 200);
  assert.equal((await S.admin.del(`/classes/${c.data.id}`)).status, 200);
});

test('Critère 1 & 7 — CRUD matières (suppression bloquée si notes/affectations)', async () => {
  const m = await S.admin.post('/matieres', { nom: 'Informatique', coefficient: 1, niveau: 'CM2' });
  assert.equal(m.status, 201);
  assert.equal((await S.admin.put(`/matieres/${m.data.id}`, { nom: 'Informatique', coefficient: 1.5, niveau: 'CM2' })).data.coefficient, 1.5);
  assert.equal((await S.admin.del(`/matieres/${m.data.id}`)).status, 200);
  const maths = (await S.admin.get('/matieres')).data.find((x) => x.nom === 'Mathématiques');
  const r = await S.admin.del(`/matieres/${maths.id}`);
  assert.equal(r.status, 409);
  assert.equal(r.data.bloque, true);
});

test('Critère 1 & 7 — CRUD enseignants, affectations et salles', async () => {
  const t = await S.admin.post('/utilisateurs', { role: 'enseignant', nom: 'Testeur', prenom: 'Karim', email: 'karim.testeur@ecole.tn', specialite: 'Musique' });
  assert.equal(t.status, 201);
  assert.ok(t.data.identifiants.mot_de_passe);
  const id = t.data.utilisateur.id;
  assert.equal((await S.admin.put(`/utilisateurs/${id}`, { nom: 'Testeur', prenom: 'Karim', email: 'karim.testeur@ecole.tn', specialite: 'Musique et chant', actif: true })).status, 200);
  const cp = (await S.admin.get('/classes')).data.find((x) => x.nom === 'CP A');
  const m = await S.admin.post('/matieres', { nom: 'Musique', coefficient: 1 });
  const a = await S.admin.post('/affectations', { enseignant_id: id, matiere_id: m.data.id, classe_id: cp.id });
  assert.equal(a.status, 201);
  const refus = await S.admin.del(`/utilisateurs/${id}`);
  assert.equal(refus.status, 409);
  assert.equal((await S.admin.del(`/utilisateurs/${id}?force=1`)).status, 200);
  assert.equal((await S.admin.del(`/matieres/${m.data.id}`)).status, 200);
  const s = await S.admin.post('/salles', { nom: 'Bibliothèque', capacite: 25, disponible: true });
  assert.equal(s.status, 201);
  assert.equal((await S.admin.put(`/salles/${s.data.id}`, { nom: 'Bibliothèque', capacite: 30, disponible: false })).data.capacite, 30);
  assert.equal((await S.admin.del(`/salles/${s.data.id}`)).status, 200);
});

test('Critère 2 — Dossier élève + parent créé, identifiants reçus, connexion et consultation', async () => {
  const r = await S.admin.post('/eleves', {
    nom: 'Testelli',
    prenom: 'Rami',
    date_naissance: `${Number(S.admin.profil.annee_courante.slice(0, 4)) - 8}-03-10`,
    sexe: 'M',
    affectation_auto: true,
    creer_compte_eleve: true,
    consentement: true,
    parents: [{ nom: 'Testelli', prenom: 'Hend', email: `hend.testelli.${U}@exemple.tn`, lien: 'Mère' }],
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.classe.niveau, 'CE2'); // affectation automatique selon l'âge
  const idParent = r.data.identifiants.find((i) => i.role === 'parent');
  const p = await connecter(idParent.email, idParent.mot_de_passe);
  assert.equal(p.profil.doit_changer_mdp, true);
  const enfant = p.profil.enfants[0];
  assert.equal((await p.get(`/creneaux?classe_id=${enfant.classe_id}`)).status, 200);
  assert.equal((await p.get(`/bulletins/eleve/${enfant.id}?trimestre=1`)).status, 200);
  assert.equal((await p.get('/devoirs')).status, 200);
  // Modification puis suppression contrôlée du dossier
  assert.equal(
    (await S.admin.put(`/eleves/${r.data.eleve.id}`, { nom: 'Testelli', prenom: 'Rami', date_naissance: r.data.eleve.date_naissance, sexe: 'M', adresse: 'Sousse' })).status,
    200
  );
  const sup = await S.admin.del(`/eleves/${r.data.eleve.id}`);
  assert.equal(sup.status, 409);
  assert.equal((await S.admin.del(`/eleves/${r.data.eleve.id}?force=1`)).status, 200);
});

test('Critère 3 — Saisie de notes par l’enseignant et moyenne du bulletin avec coefficients', async () => {
  const evals = (await S.ens.get('/evaluations')).data;
  const modele = evals.find((e) => e.classe === 'CE1 A') || evals[0];
  assert.ok(modele, 'l’enseignant a au moins une évaluation');
  const cree = await S.ens.post('/evaluations', {
    titre: `Contrôle de test ${U}`,
    classe_id: modele.classe_id,
    matiere_id: modele.matiere_id,
    type: 'controle_continu',
    trimestre: modele.trimestre,
    date_evaluation: modele.date_evaluation,
    bareme: 20,
  });
  assert.equal(cree.status, 201, JSON.stringify(cree.data));
  const vide = cree.data;
  assert.equal(vide.nb_notes, 0);
  const grille = (await S.ens.get(`/evaluations/${vide.id}/notes`)).data;
  const notes = grille.lignes.map((l, i) => ({ eleve_id: l.eleve_id, valeur: 10 + (i % 10), commentaire: i === 0 ? 'Bien' : '' }));
  const maj = await S.ens.put(`/evaluations/${vide.id}/notes`, { notes });
  assert.equal(maj.status, 200);
  assert.equal(maj.data.evaluation.nb_notes, notes.length);
  // Note hors barème refusée
  assert.equal((await S.ens.put(`/evaluations/${vide.id}/notes`, { notes: [{ eleve_id: notes[0].eleve_id, valeur: 25 }] })).status, 400);
  // Vérification indépendante de la moyenne générale
  const eleveId = grille.lignes[0].eleve_id;
  const b = (await S.ens.get(`/bulletins/eleve/${eleveId}?trimestre=${vide.trimestre}`)).data;
  let somme = 0;
  let coefs = 0;
  for (const m of b.matieres) {
    const notees = m.evaluations.filter((ev) => ev.valeur !== null);
    if (!notees.length) continue;
    const moy = notees.reduce((s, ev) => s + (ev.valeur / ev.bareme) * 20, 0) / notees.length;
    assert.ok(Math.abs(moy - m.moyenne) < 0.006, `moyenne ${m.nom}`);
    somme += moy * m.coefficient;
    coefs += m.coefficient;
  }
  assert.ok(Math.abs(somme / coefs - b.moyenne_generale) < 0.006, 'moyenne générale pondérée');
  const pdf = await S.ens.brut(`/bulletins/eleve/${eleveId}/pdf?trimestre=${vide.trimestre}`);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.ok((await pdf.arrayBuffer()).byteLength > 2000);
  // Suppression contrôlée : confirmation exigée car l'évaluation contient des notes
  assert.equal((await S.ens.del(`/evaluations/${vide.id}`)).status, 409);
  assert.equal((await S.ens.del(`/evaluations/${vide.id}?force=1`)).status, 200);
});

test('Critère 4 — Paiement : solde mis à jour, reçu PDF, message automatique au parent, journalisation', async () => {
  const adam = S.parent.profil.enfants.find((e) => e.prenom === 'Adam');
  const avant = (await S.compta.get(`/finances/situation/${adam.id}`)).data;
  const nonLusAvant = (await S.parent.get('/notifications/compteur')).data.messages;
  const p = await S.compta.post('/paiements', { eleve_id: adam.id, montant: 450, date_paiement: new Date().toISOString().slice(0, 10), mode: 'mobile_money', reference: 'MM-TEST' });
  assert.equal(p.status, 201, JSON.stringify(p.data));
  assert.equal(p.data.situation.solde, Math.round((avant.solde - 450) * 1000) / 1000);
  assert.equal(p.data.nb_parents_notifies, 2);
  const recu = await S.parent.brut(`/paiements/${p.data.paiement.id}/recu`);
  assert.equal(recu.headers.get('content-type'), 'application/pdf');
  const fils = (await S.parent.get('/messages')).data;
  const msg = fils.find((f) => f.objet.includes(p.data.paiement.numero_recu));
  assert.ok(msg, 'message automatique reçu par le parent');
  assert.ok(msg.extrait.includes('Montant payé'));
  assert.equal((await S.parent.get('/notifications/compteur')).data.messages, nonLusAvant + 1);
  await new Promise((r) => setTimeout(r, 400));
  const journal = (await S.admin.get('/journal/envois?contexte=paiement')).data.items.filter((j) => j.ref_id === p.data.paiement.id);
  assert.ok(journal.some((j) => j.canal === 'messagerie' && j.statut === 'envoye'));
  assert.ok(journal.some((j) => j.canal === 'email'));
  // Modification et suppression (journalisées)
  const mod = await S.compta.put(`/paiements/${p.data.paiement.id}`, { eleve_id: adam.id, montant: 400, date_paiement: new Date().toISOString().slice(0, 10), mode: 'especes' });
  assert.equal(mod.data.situation.solde, Math.round((avant.solde - 400) * 1000) / 1000);
  const audit = (await S.admin.get(`/journal/audit?entite=paiements&entite_id=${p.data.paiement.id}`)).data.items;
  assert.ok(audit.some((a) => a.action === 'modification' && a.anciennes_valeurs.montant === 450 && a.nouvelles_valeurs.montant === 400));
  const sup = await S.compta.del(`/paiements/${p.data.paiement.id}`);
  assert.equal(sup.data.situation.solde, avant.solde);
});

test('Critère 5 — Message enseignant → notification visible par le parent', async () => {
  const contacts = (await S.ens.get('/messages/contacts')).data;
  const amel = contacts.find((c) => c.prenom === 'Amel');
  assert.ok(amel);
  const avant = (await S.parent.get('/notifications/compteur')).data.notifications;
  const fd = new FormData();
  fd.append('destinataires', String(amel.id));
  fd.append('objet', 'Test de notification');
  fd.append('corps', 'Bonjour, ceci est un test.');
  fd.append('eleve_id', String(amel.eleves[0].id));
  fd.append('envoyer', 'true');
  fd.append('fichiers', fichierPdf('pièce jointe é.pdf'));
  const r = await S.ens.post('/messages', fd);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal((await S.parent.get('/notifications/compteur')).data.notifications, avant + 1);
  const notifs = (await S.parent.get('/notifications')).data;
  assert.equal(notifs[0].titre, 'Nouveau message de Sami Gharbi');
  const fil = (await S.parent.get(`/messages/fil/${r.data.id}`)).data;
  assert.equal(fil.messages.at(-1).pieces_jointes[0].nom_original, 'pièce jointe é.pdf');
  S.messageEnvoye = r.data.id;
});

test('Messagerie — immuabilité, masquage côté destinataire, brouillons, RBAC', async () => {
  const id = S.messageEnvoye;
  const modif = await S.ens.put(`/messages/${id}`, { objet: 'x', corps: 'y' });
  assert.equal(modif.status, 403);
  assert.equal((await S.ens.del(`/messages/${id}`)).status, 403);
  assert.equal((await S.parent.del(`/messages/${id}`)).data.action, 'masque');
  // L'expéditeur garde sa copie
  assert.ok((await S.ens.get(`/messages/fil/${id}`)).data.messages.some((m) => m.id === id));
  // Brouillon : création, modification, suppression
  const fd = new FormData();
  fd.append('objet', 'Brouillon de test');
  fd.append('corps', 'texte');
  fd.append('envoyer', 'false');
  const b = await S.ens.post('/messages', fd);
  assert.equal(b.data.statut, 'brouillon');
  const fd2 = new FormData();
  fd2.append('objet', 'Brouillon modifié');
  fd2.append('corps', 'texte 2');
  assert.equal((await S.ens.put(`/messages/${b.data.id}`, fd2)).data.objet, 'Brouillon modifié');
  assert.equal((await S.ens.del(`/messages/${b.data.id}`)).data.action, 'brouillon_supprime');
  // Un parent ne peut pas écrire à un enseignant qui n'enseigne pas à ses enfants
  const ines = (await S.admin.get('/utilisateurs?role=enseignant')).data.find((u) => u.prenom === 'Leila');
  const fd3 = new FormData();
  fd3.append('destinataires', String(ines.id));
  fd3.append('objet', 'x');
  fd3.append('corps', 'y');
  assert.equal((await S.parent.post('/messages', fd3)).status, 403);
  // L'accès à l'historique est journalisé
  const acces = (await S.admin.get('/journal/acces?ressource=conversation')).data.items;
  assert.ok(acces.length > 0);
});

test('Annonces — publication, immuabilité et annonce corrective', async () => {
  const a = await S.admin.post('/annonces', { titre: 'Annonce test', contenu: 'Contenu', audience: 'parents', publier: true });
  assert.equal(a.status, 201);
  assert.ok(a.data.notifies > 0);
  assert.equal((await S.admin.put(`/annonces/${a.data.id}`, { titre: 'x', contenu: 'y', audience: 'tous' })).status, 403);
  assert.equal((await S.admin.del(`/annonces/${a.data.id}`)).status, 403);
  const corr = await S.admin.post('/annonces', { titre: 'Rectificatif test', contenu: 'Correction', audience: 'parents', publier: true, corrige_id: a.data.id });
  assert.equal(corr.status, 201);
  const vues = (await S.parent.get('/annonces')).data;
  assert.ok(vues.find((x) => x.id === a.data.id).corrections.length === 1);
  assert.ok(!(await S.eleve.get('/annonces')).data.some((x) => x.id === a.data.id)); // audience parents seulement
});

test('Emploi du temps — détection des conflits enseignant / salle / classe', async () => {
  const creneaux = (await S.admin.get('/creneaux')).data;
  const ref = creneaux.find((c) => c.matiere === 'Français');
  const autreClasse = (await S.admin.get('/classes')).data.find((c) => c.id !== ref.classe_id);
  const francais = (await S.admin.get('/matieres')).data.find((m) => m.nom === 'Français');
  // Même enseignante, même heure, autre classe -> conflit
  const r = await S.admin.post('/creneaux', {
    classe_id: autreClasse.id,
    matiere_id: francais.id,
    enseignant_id: ref.enseignant_id,
    jour: ref.jour,
    heure_debut: ref.heure_debut,
    heure_fin: ref.heure_fin,
  });
  assert.equal(r.status, 409);
  assert.ok(r.data.conflits.some((c) => c.type === 'enseignant'));
  // Créneau libre : samedi 14h-15h (aucun cours l'après-midi du samedi)
  const ok = await S.admin.post('/creneaux', { classe_id: ref.classe_id, matiere_id: francais.id, enseignant_id: ref.enseignant_id, salle_id: null, jour: 6, heure_debut: '14:00', heure_fin: '15:00' });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  const salle = creneaux.find((c) => c.salle && c.classe_id !== ref.classe_id && c.jour === 6);
  if (salle) {
    const conflitSalle = await S.admin.put(`/creneaux/${ok.data.id}`, {
      classe_id: ref.classe_id, matiere_id: francais.id, enseignant_id: ref.enseignant_id, salle_id: salle.salle_id, jour: 6, heure_debut: salle.heure_debut, heure_fin: salle.heure_fin,
    });
    assert.equal(conflitSalle.status, 409);
  }
  assert.equal((await S.admin.del(`/creneaux/${ok.data.id}`)).status, 200);
});

test('Devoirs — publication, dépôt élève, notation, publication, correction, vu parent', async () => {
  const cm1 = (await S.sonia.get('/classes')).data.find((c) => c.nom === 'CM1 A');
  const maths = (await S.admin.get('/matieres')).data.find((m) => m.nom === 'Mathématiques');
  const fd = new FormData();
  fd.append('titre', 'Devoir de test');
  fd.append('description', 'Exercices 1 à 3');
  fd.append('matiere_id', String(maths.id));
  fd.append('classe_id', String(cm1.id));
  fd.append('date_remise', dans(2));
  fd.append('bareme', '20');
  fd.append('fichiers', fichierPdf('enonce.pdf'));
  const d = await S.sonia.post('/devoirs', fd);
  assert.equal(d.status, 201, JSON.stringify(d.data));
  // L'élève voit le devoir et dépose son travail
  assert.ok((await S.eleve.get('/devoirs')).data.some((x) => x.id === d.data.id));
  const depot = new FormData();
  depot.append('fichiers', fichierPdf('mon-travail.pdf'));
  assert.equal((await S.eleve.post(`/devoirs/${d.data.id}/soumission`, depot)).status, 201);
  const depot2 = new FormData();
  depot2.append('fichiers', fichierPdf('mon-travail-v2.pdf'));
  assert.equal((await S.eleve.post(`/devoirs/${d.data.id}/soumission`, depot2)).status, 200); // remplacement avant la date
  // Notation (non visible avant publication)
  const vueProf = (await S.sonia.get(`/devoirs/${d.data.id}`)).data;
  const s = vueProf.soumissions.find((x) => x.prenom === 'Adam').soumission;
  assert.equal(s.fichiers[0].nom_original, 'mon-travail-v2.pdf');
  assert.equal((await S.sonia.put(`/devoirs/${d.data.id}/soumissions/${s.id}`, { note: 25 })).status, 400);
  await S.sonia.put(`/devoirs/${d.data.id}/soumissions/${s.id}`, { note: 17, commentaire: 'Très bien' });
  assert.equal((await S.eleve.get(`/devoirs/${d.data.id}`)).data.soumission.note, null);
  assert.equal((await S.sonia.post(`/devoirs/${d.data.id}/publier-notes`)).data.publiees, 1);
  assert.equal((await S.eleve.get(`/devoirs/${d.data.id}`)).data.soumission.note, 17);
  // Parent : consultation + « vu »
  const adam = S.parent.profil.enfants.find((e) => e.prenom === 'Adam');
  const vueParent = (await S.parent.get(`/devoirs/${d.data.id}?eleve_id=${adam.id}`)).data;
  assert.equal(vueParent.soumission.note, 17);
  assert.equal((await S.parent.post(`/devoirs/${d.data.id}/vu`, { eleve_id: adam.id })).status, 200);
  // Correction : non visible avant la date de remise
  const corr = new FormData();
  corr.append('fichiers', fichierPdf('corrige.pdf'));
  assert.equal((await S.sonia.post(`/devoirs/${d.data.id}/correction`, corr)).status, 200);
  assert.equal((await S.eleve.get(`/devoirs/${d.data.id}`)).data.corrections.length, 0);
  // Suppression contrôlée (des travaux ont été déposés)
  assert.equal((await S.sonia.del(`/devoirs/${d.data.id}`)).status, 409);
  assert.equal((await S.sonia.del(`/devoirs/${d.data.id}?force=1`)).status, 200);
});

test('Absences — appel, justification par le parent, validation', async () => {
  const yasmine = S.parent.profil.enfants.find((e) => e.prenom === 'Yasmine');
  const date = new Date(Date.now() - 86400000 * 1).toISOString().slice(0, 10);
  const anciennes = (await S.admin.get(`/absences?eleve_id=${yasmine.id}`)).data.filter((a) => a.date_absence === date && a.periode === 'apres_midi');
  for (const a of anciennes) await S.admin.del(`/absences/${a.id}`);
  const r = await S.ens.put('/absences/appel', { classe_id: yasmine.classe_id, date_absence: date, periode: 'apres_midi', absents: [yasmine.id] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const abs = (await S.parent.get(`/absences?eleve_id=${yasmine.id}`)).data.find((a) => a.date_absence === date && a.periode === 'apres_midi');
  assert.ok(abs);
  const fd = new FormData();
  fd.append('justification', 'Rendez-vous médical');
  fd.append('justificatif', fichierPdf('certificat.pdf'));
  const j = await S.parent.post(`/absences/${abs.id}/justifier`, fd);
  assert.equal(j.data.statut, 'en_attente');
  const v = await S.ens.post(`/absences/${abs.id}/valider`, { decision: 'justifiee' });
  assert.equal(v.data.statut, 'justifiee');
  assert.equal((await S.admin.del(`/absences/${abs.id}`)).status, 200);
});

test('Pré-inscription en ligne → validation → identifiants parent', async () => {
  const r = await fetch(`${BASE}/api/public/preinscriptions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      enfant_nom: 'Essai',
      enfant_prenom: 'Lilia',
      date_naissance: `${Number(S.admin.profil.annee_courante.slice(0, 4)) - 6}-06-01`,
      sexe: 'F',
      parent_nom: 'Essai',
      parent_prenom: 'Mona',
      lien: 'Mère',
      email: `mona.essai.${U}@exemple.tn`,
      telephone: '+216 20 000 000',
      consentement: true,
    }),
  });
  assert.equal(r.status, 201);
  const { id } = await r.json();
  const v = await S.compta.post(`/preinscriptions/${id}/valider`, {});
  assert.equal(v.status, 200, JSON.stringify(v.data));
  assert.match(v.data.classe.nom, /^CP /); // affectation automatique selon l'âge
  const ident = v.data.identifiants[0];
  const p = await connecter(ident.email, ident.mot_de_passe);
  assert.equal(p.profil.enfants[0].prenom, 'Lilia');
});

test('Import CSV / export Excel des élèves', async () => {
  const csv = `nom;prenom;date_naissance;sexe;classe;parent_nom;parent_prenom;parent_email\nImporte;Sami;12/05/2017;M;CM1 A;Importe;Dora;dora.importe.${U}@exemple.tn\nSansDate;Ali;;M;CM1 A;;;\n`;
  const fd = new FormData();
  fd.append('fichier', new File([csv], 'eleves.csv', { type: 'text/csv' }));
  const r = await S.admin.post('/eleves/import', fd);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.crees, 1);
  assert.equal(r.data.erreurs.length, 1);
  const x = await S.admin.brut('/eleves/export?format=xlsx');
  assert.ok(x.headers.get('content-type').includes('spreadsheetml'));
});

test('Journal d’audit : anciennes et nouvelles valeurs', async () => {
  const s = await S.admin.post('/salles', { nom: 'Salle audit', capacite: 10 });
  await S.admin.put(`/salles/${s.data.id}`, { nom: 'Salle audit', capacite: 12, disponible: true });
  const items = (await S.admin.get(`/journal/audit?entite=salles&entite_id=${s.data.id}`)).data.items;
  const modif = items.find((i) => i.action === 'modification');
  assert.equal(modif.anciennes_valeurs.capacite, 10);
  assert.equal(modif.nouvelles_valeurs.capacite, 12);
  assert.equal(modif.utilisateur, 'Faten Belhadj');
  await S.admin.del(`/salles/${s.data.id}`);
});

test('RGPD — export des données (portabilité) et anonymisation', async () => {
  const yasmine = S.parent.profil.enfants.find((e) => e.prenom === 'Yasmine');
  const r = await S.parent.get(`/eleves/${yasmine.id}/rgpd`);
  assert.equal(r.status, 200);
  assert.ok(r.data.notes.length > 0);
  const importe = (await S.admin.get('/eleves?q=importe')).data[0];
  assert.equal((await S.admin.post(`/eleves/${importe.id}/anonymiser`)).status, 200);
  assert.equal((await S.admin.get(`/eleves/${importe.id}`)).data.statut, 'anonymise');
});

test('Relances des impayés (déclenchement manuel)', async () => {
  const r = await S.compta.post('/finances/relances');
  assert.equal(r.status, 200);
  assert.ok(r.data.relances_envoyees >= 1);
  const impayes = (await S.compta.get('/finances/impayes?retard=1')).data;
  assert.ok(impayes.length >= 1);
});

test('Tableaux de bord de chaque rôle', async () => {
  for (const cle of ['admin', 'ens', 'parent', 'eleve', 'compta']) {
    const r = await S[cle].get('/tableau-de-bord');
    assert.equal(r.status, 200, cle);
  }
});

test('Critère 6 — Interface web et santé du service', async () => {
  assert.equal((await fetch(`${BASE}/api/sante`)).status, 200);
});
