// Devoirs (homework) : publication par l'enseignant, dépôt par l'élève, notation, correction, suivi par les parents.
const express = require('express');
const db = require('../db');
const { autoriser } = require('../middleware/auth');
const { valider, entierParam, HttpError, introuvable, interdit, confirmationRequise, formatDate } = require('../utils');
const { anneeCourante } = require('../services/parametres');
const { verifierEnseignement, enfantsParent, eleveDuCompte, classeDeLEleve, peutVoirEleve } = require('../services/acces');
const { notifier } = require('../services/notifications');
const { televersement, enregistrerFichier, fichiersDe, fichiersDePlusieurs } = require('../services/fichiers');

const router = express.Router();
const upload = televersement({ maxFichiers: 5 });

const SELECT = `
  SELECT d.id, d.titre, d.description, d.matiere_id, m.nom AS matiere, d.classe_id, c.niveau || ' ' || c.section AS classe,
         d.enseignant_id, u.prenom || ' ' || u.nom AS enseignant, d.date_remise, d.bareme, d.correction_publiee_at,
         d.annee_scolaire, d.created_at,
         (SELECT COUNT(*)::int FROM fichiers f WHERE f.categorie = 'devoir_enonce' AND f.ref_id = d.id AND f.deleted_at IS NULL) AS nb_fichiers,
         (SELECT COUNT(*)::int FROM soumissions s WHERE s.devoir_id = d.id) AS nb_rendus,
         (SELECT COUNT(*)::int FROM soumissions s WHERE s.devoir_id = d.id AND s.note IS NOT NULL) AS nb_notes,
         (SELECT COUNT(*)::int FROM soumissions s WHERE s.devoir_id = d.id AND s.note IS NOT NULL AND s.note_publiee_at IS NULL) AS nb_notes_non_publiees,
         (SELECT COUNT(*)::int FROM inscriptions i WHERE i.classe_id = d.classe_id) AS effectif
    FROM devoirs d
    JOIN matieres m ON m.id = d.matiere_id
    JOIN classes c ON c.id = d.classe_id
    JOIN utilisateurs u ON u.id = d.enseignant_id`;

function statutSoumission(s, dateRemise) {
  if (!s) return new Date(dateRemise) < new Date() ? 'non_rendu' : 'a_faire';
  if (s.note_publiee_at) return 'note';
  return new Date(s.depose_at) > new Date(dateRemise) ? 'en_retard' : 'rendu';
}

/** Masque la note tant qu'elle n'est pas publiée (vue élève / parent). */
function vueSoumission(s, dateRemise) {
  if (!s) return { statut: statutSoumission(null, dateRemise) };
  const publiee = Boolean(s.note_publiee_at);
  return {
    id: s.id,
    depose_at: s.depose_at,
    modifie_at: s.modifie_at,
    commentaire_eleve: s.commentaire_eleve,
    en_retard: new Date(s.depose_at) > new Date(dateRemise),
    note: publiee ? s.note : null,
    commentaire_enseignant: publiee ? s.commentaire_enseignant : null,
    note_publiee_at: s.note_publiee_at,
    statut: statutSoumission(s, dateRemise),
  };
}

/** Élèves concernés par la requête (élève connecté ou enfants du parent). */
async function elevesDuDemandeur(user, eleveIdParam) {
  if (user.role === 'eleve') {
    const id = await eleveDuCompte(db, user.id);
    return id ? [id] : [];
  }
  if (user.role === 'parent') {
    const enfants = await enfantsParent(db, user.id);
    if (eleveIdParam) {
      const id = entierParam(eleveIdParam, 'élève');
      if (!enfants.includes(id)) throw interdit();
      return [id];
    }
    return enfants;
  }
  return [];
}

router.get('/', async (req, res) => {
  const annee = req.query.annee || anneeCourante();
  const conditions = ['d.deleted_at IS NULL', 'd.annee_scolaire = $1'];
  const params = [annee];
  const ajouter = (sql, v) => {
    params.push(v);
    conditions.push(sql.replace('?', `$${params.length}`));
  };
  if (req.query.classe_id) ajouter('d.classe_id = ?', entierParam(req.query.classe_id));
  if (req.query.matiere_id) ajouter('d.matiere_id = ?', entierParam(req.query.matiere_id));

  if (['admin', 'enseignant'].includes(req.user.role)) {
    if (req.user.role === 'enseignant') {
      params.push(req.user.id);
      const p = `$${params.length}`;
      conditions.push(`(d.enseignant_id = ${p} OR c.titulaire_id = ${p} OR EXISTS (SELECT 1 FROM affectations a WHERE a.classe_id = d.classe_id
                         AND a.matiere_id = d.matiere_id AND a.enseignant_id = ${p} AND a.deleted_at IS NULL))`);
    }
    const r = await db.query(`${SELECT} WHERE ${conditions.join(' AND ')} ORDER BY d.date_remise DESC`, params);
    return res.json(r.rows);
  }

  if (!['eleve', 'parent'].includes(req.user.role)) throw interdit();
  const eleves = await elevesDuDemandeur(req.user, req.query.eleve_id);
  const resultat = [];
  for (const eleveId of eleves) {
    const classeId = await classeDeLEleve(db, eleveId, annee);
    if (!classeId) continue;
    const e = await db.un('SELECT id, prenom, nom FROM eleves WHERE id = $1', [eleveId]);
    const r = await db.query(`${SELECT} WHERE ${conditions.join(' AND ')} AND d.classe_id = $${params.length + 1} ORDER BY d.date_remise DESC`, [
      ...params,
      classeId,
    ]);
    const ids = r.rows.map((d) => d.id);
    const soumissions = ids.length
      ? (await db.query('SELECT * FROM soumissions WHERE devoir_id = ANY($1) AND eleve_id = $2', [ids, eleveId])).rows
      : [];
    const vus = req.user.role === 'parent' && ids.length
      ? (await db.query('SELECT devoir_id, vu_at FROM devoirs_vus WHERE devoir_id = ANY($1) AND eleve_id = $2 AND parent_id = $3', [ids, eleveId, req.user.id])).rows
      : [];
    for (const d of r.rows) {
      const s = soumissions.find((x) => x.devoir_id === d.id);
      const vu = vus.find((x) => x.devoir_id === d.id);
      resultat.push({
        ...d,
        nb_rendus: undefined,
        nb_notes: undefined,
        nb_notes_non_publiees: undefined,
        eleve: { id: e.id, nom: `${e.prenom} ${e.nom}` },
        soumission: vueSoumission(s, d.date_remise),
        vu_at: vu ? vu.vu_at : null,
        correction_disponible: Boolean(d.correction_publiee_at) && new Date(d.date_remise) <= new Date(),
      });
    }
  }
  resultat.sort((a, b) => new Date(b.date_remise) - new Date(a.date_remise));
  res.json(resultat);
});

async function chargerDevoir(id) {
  const d = await db.un(`${SELECT} WHERE d.id = $1 AND d.deleted_at IS NULL`, [id]);
  if (!d) throw introuvable('Devoir');
  return d;
}

async function verifierAccesDevoir(user, d, eleveIdParam) {
  if (user.role === 'admin') return null;
  if (user.role === 'enseignant') {
    await verifierEnseignement(db, user, d.classe_id, d.matiere_id).catch(async (e) => {
      if (d.enseignant_id !== user.id) throw e;
    });
    return null;
  }
  const eleves = await elevesDuDemandeur(user, eleveIdParam);
  for (const eleveId of eleves) {
    if ((await classeDeLEleve(db, eleveId, d.annee_scolaire)) === d.classe_id) return eleveId;
  }
  throw interdit("Ce devoir ne concerne pas votre classe.");
}

router.get('/:id', async (req, res) => {
  const id = entierParam(req.params.id);
  const d = await chargerDevoir(id);
  const eleveId = await verifierAccesDevoir(req.user, d, req.query.eleve_id);
  d.fichiers = await fichiersDe(db, 'devoir_enonce', id);
  const echu = new Date(d.date_remise) <= new Date();
  const corrections = await fichiersDe(db, 'devoir_correction', id);

  if (['admin', 'enseignant'].includes(req.user.role)) {
    d.corrections = corrections;
    const lignes = (
      await db.query(
        `SELECT e.id AS eleve_id, e.nom, e.prenom, e.matricule, e.utilisateur_id IS NOT NULL AS a_un_compte, s.*
           FROM inscriptions i JOIN eleves e ON e.id = i.eleve_id AND e.deleted_at IS NULL
           LEFT JOIN soumissions s ON s.devoir_id = $1 AND s.eleve_id = e.id
          WHERE i.classe_id = $2 ORDER BY e.nom, e.prenom`,
        [id, d.classe_id]
      )
    ).rows;
    const fichiers = await fichiersDePlusieurs(db, 'soumission', lignes.filter((l) => l.id).map((l) => l.id));
    d.soumissions = lignes.map((l) => ({
      eleve_id: l.eleve_id,
      nom: l.nom,
      prenom: l.prenom,
      matricule: l.matricule,
      a_un_compte: l.a_un_compte,
      soumission: l.id
        ? {
            id: l.id,
            depose_at: l.depose_at,
            modifie_at: l.modifie_at,
            commentaire_eleve: l.commentaire_eleve,
            note: l.note,
            commentaire_enseignant: l.commentaire_enseignant,
            note_publiee_at: l.note_publiee_at,
            fichiers: fichiers[l.id] || [],
          }
        : null,
      statut: statutSoumission(l.id ? l : null, d.date_remise),
    }));
  } else {
    d.correction_disponible = Boolean(d.correction_publiee_at) && echu;
    d.corrections = d.correction_disponible ? corrections : [];
    const s = (await db.query('SELECT * FROM soumissions WHERE devoir_id = $1 AND eleve_id = $2', [id, eleveId])).rows[0];
    d.soumission = vueSoumission(s, d.date_remise);
    if (s) d.soumission.fichiers = await fichiersDe(db, 'soumission', s.id);
    d.peut_deposer = req.user.role === 'eleve' && (!s || (!echu && !s.note_publiee_at));
    d.eleve_id = eleveId;
    if (req.user.role === 'parent') {
      d.vu_at = (await db.un('SELECT vu_at FROM devoirs_vus WHERE devoir_id = $1 AND eleve_id = $2 AND parent_id = $3', [id, eleveId, req.user.id]) || {}).vu_at || null;
    }
    delete d.nb_rendus;
    delete d.nb_notes;
    delete d.nb_notes_non_publiees;
  }
  res.json(d);
});

const schema = {
  titre: { type: 'string', required: true, label: 'Titre', maxLength: 150 },
  description: { type: 'string', label: 'Description', maxLength: 5000 },
  matiere_id: { type: 'int', required: true, label: 'Matière' },
  classe_id: { type: 'int', required: true, label: 'Classe' },
  date_remise: { type: 'datetime', required: true, label: 'Date de remise' },
  bareme: { type: 'number', min: 1, max: 100, defaut: 20, label: 'Barème' },
};

async function destinatairesClasse(client, classeId) {
  const r = await client.query(
    `SELECT e.utilisateur_id AS id FROM inscriptions i JOIN eleves e ON e.id = i.eleve_id AND e.deleted_at IS NULL
      WHERE i.classe_id = $1 AND e.utilisateur_id IS NOT NULL
     UNION
     SELECT pe.parent_id FROM inscriptions i JOIN parents_eleves pe ON pe.eleve_id = i.eleve_id WHERE i.classe_id = $1`,
    [classeId]
  );
  return r.rows.map((x) => x.id);
}

router.post('/', autoriser('admin', 'enseignant'), upload.array('fichiers', 5), async (req, res) => {
  const d = valider(req.body, schema);
  await verifierEnseignement(db, req.user, d.classe_id, d.matiere_id);
  const classe = await db.un('SELECT annee_scolaire, niveau, section FROM classes WHERE id = $1 AND deleted_at IS NULL', [d.classe_id]);
  if (!classe) throw introuvable('Classe');
  const enseignantId = req.user.role === 'enseignant'
    ? req.user.id
    : (await db.un('SELECT enseignant_id FROM affectations WHERE classe_id = $1 AND matiere_id = $2 AND deleted_at IS NULL', [d.classe_id, d.matiere_id]) || {})
        .enseignant_id;
  if (!enseignantId) throw new HttpError(400, 'Aucun enseignant n’est affecté à cette matière dans cette classe.');
  const id = await db.tx(req, async (c) => {
    const r = await c.query(
      `INSERT INTO devoirs (titre, description, matiere_id, classe_id, enseignant_id, date_remise, bareme, annee_scolaire)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [d.titre, d.description, d.matiere_id, d.classe_id, enseignantId, d.date_remise, d.bareme, classe.annee_scolaire]
    );
    const devoirId = r.rows[0].id;
    for (const f of req.files || []) await enregistrerFichier(c, f, 'devoir_enonce', devoirId, req.user.id);
    const matiere = (await c.query('SELECT nom FROM matieres WHERE id = $1', [d.matiere_id])).rows[0];
    await notifier(c, await destinatairesClasse(c, d.classe_id), {
      type: 'devoir',
      titre: `Nouveau devoir de ${matiere.nom} — ${classe.niveau} ${classe.section}`,
      contenu: `« ${d.titre} » à rendre avant le ${formatDate(d.date_remise)}.`,
      lien: `/devoirs/${devoirId}`,
      contexte: 'devoir',
      ref_type: 'devoir',
      ref_id: devoirId,
    });
    return devoirId;
  });
  res.status(201).json(await chargerDevoir(id));
});

router.put('/:id', autoriser('admin', 'enseignant'), upload.array('fichiers', 5), async (req, res) => {
  const id = entierParam(req.params.id);
  const ancien = await chargerDevoir(id);
  await verifierAccesDevoir(req.user, ancien);
  const d = valider(req.body, schema);
  await verifierEnseignement(db, req.user, d.classe_id, d.matiere_id);
  if (d.classe_id !== ancien.classe_id && ancien.nb_rendus > 0) throw new HttpError(400, 'Impossible de changer la classe : des travaux ont déjà été rendus.');
  const aSupprimer = String(req.body.fichiers_supprimes || '')
    .split(',')
    .map(Number)
    .filter((x) => Number.isInteger(x) && x > 0);
  await db.tx(req, async (c) => {
    await c.query(`UPDATE devoirs SET titre=$1, description=$2, matiere_id=$3, classe_id=$4, date_remise=$5, bareme=$6 WHERE id=$7`, [
      d.titre,
      d.description,
      d.matiere_id,
      d.classe_id,
      d.date_remise,
      d.bareme,
      id,
    ]);
    if (aSupprimer.length) {
      await c.query(
        "UPDATE fichiers SET deleted_at = now() WHERE id = ANY($1) AND ref_id = $2 AND categorie IN ('devoir_enonce','devoir_correction')",
        [aSupprimer, id]
      );
    }
    for (const f of req.files || []) await enregistrerFichier(c, f, 'devoir_enonce', id, req.user.id);
  });
  res.json(await chargerDevoir(id));
});

router.delete('/:id', autoriser('admin', 'enseignant'), async (req, res) => {
  const id = entierParam(req.params.id);
  const d = await chargerDevoir(id);
  await verifierAccesDevoir(req.user, d);
  const force = req.query.force === '1' || req.query.force === 'true';
  if (d.nb_rendus > 0 && !force) {
    throw confirmationRequise(`${d.nb_rendus} élève(s) ont déjà déposé leur travail pour « ${d.titre} ». Le devoir et les dépôts seront archivés.`, {
      rendus: d.nb_rendus,
    });
  }
  await db.tx(req, (c) => c.query('UPDATE devoirs SET deleted_at = now() WHERE id = $1', [id]));
  res.json({ ok: true });
});

// Correction (corrigé) : visible par les élèves et les parents après la date de remise
router.post('/:id/correction', autoriser('admin', 'enseignant'), upload.array('fichiers', 5), async (req, res) => {
  const id = entierParam(req.params.id);
  const d = await chargerDevoir(id);
  await verifierAccesDevoir(req.user, d);
  if (!req.files || !req.files.length) throw new HttpError(400, 'Joignez au moins un fichier de correction.');
  const echu = new Date(d.date_remise) <= new Date();
  await db.tx(req, async (c) => {
    for (const f of req.files) await enregistrerFichier(c, f, 'devoir_correction', id, req.user.id);
    await c.query('UPDATE devoirs SET correction_publiee_at = COALESCE(correction_publiee_at, now()) WHERE id = $1', [id]);
    await notifier(c, await destinatairesClasse(c, d.classe_id), {
      type: 'devoir',
      titre: `Correction disponible — ${d.titre}`,
      contenu: echu
        ? `La correction du devoir de ${d.matiere} est disponible.`
        : `La correction du devoir de ${d.matiere} sera visible après la date de remise (${formatDate(d.date_remise)}).`,
      lien: `/devoirs/${id}`,
      contexte: 'devoir',
      ref_type: 'devoir',
      ref_id: id,
    });
  });
  res.json(await chargerDevoir(id));
});

router.delete('/:id/fichiers/:fichierId', autoriser('admin', 'enseignant'), async (req, res) => {
  const id = entierParam(req.params.id);
  const fichierId = entierParam(req.params.fichierId);
  const d = await chargerDevoir(id);
  await verifierAccesDevoir(req.user, d);
  await db.tx(req, async (c) => {
    await c.query("UPDATE fichiers SET deleted_at = now() WHERE id = $1 AND ref_id = $2 AND categorie IN ('devoir_enonce','devoir_correction')", [fichierId, id]);
    const reste = (await c.query("SELECT COUNT(*)::int AS n FROM fichiers WHERE categorie = 'devoir_correction' AND ref_id = $1 AND deleted_at IS NULL", [id])).rows[0].n;
    if (!reste) await c.query('UPDATE devoirs SET correction_publiee_at = NULL WHERE id = $1', [id]);
  });
  res.json({ ok: true });
});

// Dépôt (ou remplacement) du travail par l'élève
router.post('/:id/soumission', autoriser('eleve'), upload.array('fichiers', 5), async (req, res) => {
  const id = entierParam(req.params.id);
  const d = await chargerDevoir(id);
  const eleveId = await verifierAccesDevoir(req.user, d);
  if (!req.files || !req.files.length) throw new HttpError(400, 'Joignez au moins un fichier.');
  const echu = new Date(d.date_remise) <= new Date();
  const existante = (await db.query('SELECT * FROM soumissions WHERE devoir_id = $1 AND eleve_id = $2', [id, eleveId])).rows[0];
  if (existante && echu) throw new HttpError(400, 'La date de remise est dépassée : le dépôt ne peut plus être modifié.');
  if (existante && existante.note_publiee_at) throw new HttpError(400, 'Ce travail a déjà été noté.');
  const commentaire = req.body.commentaire ? String(req.body.commentaire).slice(0, 1000) : null;
  await db.tx(req, async (c) => {
    let sid;
    if (existante) {
      sid = existante.id;
      await c.query("UPDATE fichiers SET deleted_at = now() WHERE categorie = 'soumission' AND ref_id = $1 AND deleted_at IS NULL", [sid]);
      await c.query('UPDATE soumissions SET commentaire_eleve = $1, depose_at = now(), modifie_at = now() WHERE id = $2', [commentaire, sid]);
    } else {
      sid = (
        await c.query('INSERT INTO soumissions (devoir_id, eleve_id, commentaire_eleve, annee_scolaire) VALUES ($1,$2,$3,$4) RETURNING id', [
          id,
          eleveId,
          commentaire,
          d.annee_scolaire,
        ])
      ).rows[0].id;
    }
    for (const f of req.files) await enregistrerFichier(c, f, 'soumission', sid, req.user.id);
    const e = (await c.query('SELECT prenom, nom FROM eleves WHERE id = $1', [eleveId])).rows[0];
    await notifier(c, [d.enseignant_id], {
      type: 'devoir',
      titre: `${existante ? 'Dépôt remplacé' : 'Travail déposé'} — ${e.prenom} ${e.nom}`,
      contenu: `${d.titre} (${d.classe})${echu ? ' — déposé en retard' : ''}.`,
      lien: `/devoirs/${id}`,
      contexte: 'devoir',
      ref_type: 'devoir',
      ref_id: id,
    });
  });
  res.status(existante ? 200 : 201).json({ ok: true, en_retard: echu });
});

// Notation d'un travail rendu (barème configurable, commentaire facultatif)
router.put('/:id/soumissions/:sid', autoriser('admin', 'enseignant'), async (req, res) => {
  const id = entierParam(req.params.id);
  const sid = entierParam(req.params.sid);
  const d = await chargerDevoir(id);
  await verifierAccesDevoir(req.user, d);
  const s = await db.un('SELECT * FROM soumissions WHERE id = $1 AND devoir_id = $2', [sid, id]);
  if (!s) throw introuvable('Travail rendu');
  const v = valider(req.body, {
    note: { type: 'number', required: true, min: 0, max: d.bareme, label: 'Note' },
    commentaire: { type: 'string', label: 'Commentaire', maxLength: 1000 },
  });
  await db.tx(req, (c) => c.query('UPDATE soumissions SET note = $1, commentaire_enseignant = $2 WHERE id = $3', [v.note, v.commentaire, sid]));
  res.json(await db.un('SELECT * FROM soumissions WHERE id = $1', [sid]));
});

// Publication des notes (notification élève + parents)
router.post('/:id/publier-notes', autoriser('admin', 'enseignant'), async (req, res) => {
  const id = entierParam(req.params.id);
  const d = await chargerDevoir(id);
  await verifierAccesDevoir(req.user, d);
  const nb = await db.tx(req, async (c) => {
    const r = await c.query(
      `UPDATE soumissions SET note_publiee_at = now() WHERE devoir_id = $1 AND note IS NOT NULL AND note_publiee_at IS NULL RETURNING eleve_id, note`,
      [id]
    );
    for (const s of r.rows) {
      const dest = (
        await c.query(
          `SELECT utilisateur_id AS id FROM eleves WHERE id = $1 AND utilisateur_id IS NOT NULL
           UNION SELECT parent_id FROM parents_eleves WHERE eleve_id = $1`,
          [s.eleve_id]
        )
      ).rows.map((x) => x.id);
      const e = (await c.query('SELECT prenom FROM eleves WHERE id = $1', [s.eleve_id])).rows[0];
      await notifier(c, dest, {
        type: 'devoir',
        titre: `Note publiée — ${d.titre}`,
        contenu: `${e.prenom} a obtenu ${String(s.note).replace('.', ',')}/${d.bareme} en ${d.matiere}.`,
        lien: `/devoirs/${id}`,
        contexte: 'devoir',
        ref_type: 'devoir',
        ref_id: id,
      });
    }
    return r.rowCount;
  });
  res.json({ ok: true, publiees: nb });
});

// Marquage « vu » par le parent
router.post('/:id/vu', autoriser('parent'), async (req, res) => {
  const id = entierParam(req.params.id);
  const d = await chargerDevoir(id);
  const eleveId = await verifierAccesDevoir(req.user, d, req.body.eleve_id);
  if (!(await peutVoirEleve(db, req.user, eleveId))) throw interdit();
  await db.query(
    `INSERT INTO devoirs_vus (devoir_id, eleve_id, parent_id) VALUES ($1,$2,$3) ON CONFLICT (devoir_id, eleve_id, parent_id) DO UPDATE SET vu_at = now()`,
    [id, eleveId, req.user.id]
  );
  res.json({ ok: true, vu_at: new Date().toISOString() });
});

module.exports = router;
