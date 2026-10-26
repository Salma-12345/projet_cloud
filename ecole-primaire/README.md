# Gestion d’école primaire — École Aboukacem Chebbi

Application web **mono-école** réalisée selon le cahier des charges *« Application web de gestion d’école primaire — Déploiement mono-école »* (Dr Hamdi Hassen, ISG Sousse).

Elle couvre tout le cycle de l’école : pré-inscription en ligne, dossiers élèves, classes, matières, salles, emploi du temps, notes et bulletins PDF, absences, devoirs, paiements avec reçu PDF et message automatique aux parents, messagerie, annonces et notifications. Interface en français, utilisable sur ordinateur, tablette et smartphone, installable comme une application (PWA).

| Partie | Technologie |
|---|---|
| Interface | React 19 + Vite (PWA : manifeste, service worker, notifications push) |
| API REST | Node.js 22 + Express 5, authentification JWT (cookie httpOnly), contrôle d’accès par rôle (RBAC) |
| Base de données | PostgreSQL 16 (journal d’audit et règles d’immuabilité gérés par des triggers) |
| Documents | Reçus et bulletins PDF (pdfkit), import/export Excel et CSV (exceljs) |
| Déploiement | Docker Compose (application, base, sauvegardes) + Cloudflare Quick Tunnel (option A du cahier) |

---

## Sommaire

1. [Lancer l’application sur votre PC](#1-lancer-lapplication-sur-votre-pc)
2. [Mettre l’application en ligne — option A du cahier](#2-mettre-lapplication-en-ligne--option-a-du-cahier)
3. [Démonstration guidée des critères d’acceptation](#3-démonstration-guidée-des-critères-dacceptation)
4. [Fonctionnalités couvertes, chapitre par chapitre](#4-fonctionnalités-couvertes-chapitre-par-chapitre)
5. [Architecture](#5-architecture)
6. [Sauvegarde et restauration](#6-sauvegarde-et-restauration)
7. [Migration des données existantes](#7-migration-des-données-existantes)
8. [Configuration](#8-configuration)
9. [Sécurité et RGPD](#9-sécurité-et-rgpd)
10. [Tests automatisés](#10-tests-automatisés)
11. [Développement sans Docker](#11-développement-sans-docker)
12. [Structure du projet](#12-structure-du-projet)
13. [Vers une version SaaS](#13-vers-une-version-saas)

Documentation utilisateur (guide administration, enseignant, parent, élève, comptable) : [`docs/GUIDE-UTILISATEUR.md`](docs/GUIDE-UTILISATEUR.md).

---

## 1. Lancer l’application sur votre PC

**Seul prérequis : Docker Desktop**, démarré (il fonctionne avec WSL 2 sous Windows). Inutile d’installer Node.js ou PostgreSQL : tout tourne dans des conteneurs.

1. Décompressez le projet, puis ouvrez le dossier `ecole-primaire` dans un terminal.
   Sous Windows : dans l’Explorateur, clic droit dans le dossier → **Ouvrir dans le Terminal**.
2. Construisez et démarrez l’application :
   ```powershell
   docker compose up -d --build
   ```
   La première fois, comptez 3 à 5 minutes (téléchargement des images Node.js et PostgreSQL, construction de l’interface). Les fois suivantes, le démarrage prend quelques secondes.
3. Vérifiez que tout est prêt :
   ```powershell
   docker compose ps
   ```
   Le service `app` doit afficher `healthy` (comptez environ 30 secondes après le démarrage).
4. Ouvrez **http://localhost:3000** dans votre navigateur.

Au premier démarrage, la base est remplie avec une école de démonstration complète : 6 classes du CP au CM2, enseignants, élèves, notes du 1er trimestre, emploi du temps sans conflit, paiements, impayés, devoirs, messages et annonces, plus l’année scolaire précédente en historique.

### Comptes de démonstration

Mot de passe commun : **`Ecole2026`** (les comptes sont aussi listés sur la page de connexion).

| Rôle | Identifiant | Personne |
|---|---|---|
| Administration / direction | `admin@ecole.tn` | Faten Belhadj |
| Enseignant | `enseignant@ecole.tn` | Sami Gharbi, titulaire du CE1 A |
| Parent | `parent@ecole.tn` | Amel Ben Ali, mère de Yasmine (CE1 A) et d’Adam (CM1 A) |
| Élève | `eleve@ecole.tn` | Adam Ben Ali (CM1 A) |
| Comptable / secrétariat | `comptable@ecole.tn` | Mourad Saidi |

### Commandes utiles

| Action | Commande |
|---|---|
| Voir l’état des services | `docker compose ps` |
| Suivre le journal de l’application | `docker compose logs -f app` |
| Arrêter (les données sont conservées) | `docker compose stop` |
| Redémarrer | `docker compose start` |
| Appliquer une modification du code | `docker compose up -d --build` |
| Remettre la démonstration à zéro | `docker compose down -v` puis `docker compose up -d` |

> `docker compose down -v` efface la base et les fichiers déposés : la démonstration est rechargée au démarrage suivant. Le dossier `sauvegardes` n’est pas touché.

**Port déjà utilisé ?** L’application utilise le port 3000 de votre PC (la base de données n’est pas exposée, elle n’entre donc pas en conflit avec un autre PostgreSQL). Si le port 3000 est pris, copiez `.env.example` en `.env`, mettez `PORT_APP=3001`, relancez `docker compose up -d` et ouvrez http://localhost:3001. Les ports 8080 et 8081 (Oracle, Nextcloud AIO…) ne sont pas utilisés.

---

## 2. Mettre l’application en ligne — option A du cahier

Le chapitre 12 du cahier décrit l’**option A : Cloudflare Quick Tunnel**. Elle donne une adresse HTTPS publique du type `https://mots-au-hasard.trycloudflare.com` qui pointe vers l’application tournant sur votre PC, sans compte Cloudflare, sans configuration DNS et sans ouvrir de port sur votre box.

L’application doit d’abord tourner en local (section 1). Ensuite, au choix :

### Méthode 1 — cloudflared installé sur Windows (procédure du cahier)

```powershell
# Installation (une seule fois)
winget install Cloudflare.cloudflared

# Fermez puis rouvrez le terminal, puis lancez le tunnel :
cloudflared tunnel --url http://localhost:3000
```

Après quelques secondes, Cloudflare affiche un encadré contenant l’adresse publique :

```
Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):
https://exemple-mots-1234.trycloudflare.com
```

Laissez cette fenêtre ouverte : fermer le terminal coupe le lien. `Ctrl + C` arrête le tunnel.

### Méthode 2 — tunnel dans Docker (rien à installer)

```powershell
docker compose --profile tunnel up -d
docker compose logs tunnel | Select-String trycloudflare
```

La seconde commande affiche l’adresse publique (attendez 10 à 20 secondes après le lancement si rien ne s’affiche). Pour arrêter le tunnel : `docker compose stop tunnel`. Si vous utilisez ensuite `docker compose down`, ajoutez `--profile tunnel` pour qu’il supprime aussi ce conteneur.

### Vérifier le critère 6 (accès externe)

Ouvrez l’adresse `https://….trycloudflare.com` sur un smartphone **en 4G, Wi-Fi coupé** : c’est la preuve que l’application est accessible depuis un navigateur extérieur à votre réseau. Depuis **Mon compte**, vous pouvez ensuite l’installer sur l’écran d’accueil et activer les notifications push (HTTPS obligatoire, fourni par Cloudflare).

### Ce qu’il faut savoir

- L’adresse change à chaque redémarrage du tunnel, et le PC doit rester allumé avec Docker Desktop ouvert. C’est une solution de **démonstration**, pas de production (cahier, § 12.3).
- Rien à reconfigurer quand l’adresse change : les liens des e-mails et des messages (reçus, bulletins) sont construits à partir de l’adresse utilisée. Seules les notifications push sont à réactiver depuis **Mon compte**, car elles sont liées à l’adresse du site.
- Les options B, C et D du cahier (Railway/Render, nom de domaine, VPS) réutilisent la même image Docker : voir la section 13.

---

## 3. Démonstration guidée des critères d’acceptation

Parcours conseillé pour présenter l’application (chapitre 20 du cahier). Ouvrez une fenêtre de navigation privée par compte pour passer d’un rôle à l’autre sans vous déconnecter.

**Critère 1 — L’administrateur gère classes, matières et enseignants sans assistance.**
Connexion `admin@ecole.tn`.
- **Classes** → *Ajouter une classe* (niveau, section, capacité, titulaire) → crayon pour la modifier → corbeille pour la supprimer. Essayez de supprimer une classe qui contient des élèves : la suppression est refusée avec une explication (suppression contrôlée, § 3 et § 5.1).
- **Matières** → *Ajouter une matière* (nom, coefficient, niveau). Une matière qui a déjà des notes ou des affectations ne peut pas être supprimée (§ 5.2).
- **Enseignants** → *Ajouter un enseignant* : ses identifiants s’affichent aussitôt. Les matières confiées se règlent dans la fiche de chaque classe (*Matières et enseignants* → *Affecter*).

**Critère 2 — Un parent reçoit ses identifiants, se connecte et consulte notes, emploi du temps et devoirs.**
- Toujours en administrateur : **Élèves** → *Inscrire un élève*, avec un *Nouveau parent* (une adresse e-mail suffit). L’élève est affecté automatiquement à une classe selon son âge, et les identifiants du parent s’affichent (l’envoi par e-mail est tracé dans **Journal d’activité → Envois**).
- Variante publique : sur la page de connexion, *Pré-inscrire mon enfant en ligne*, puis **Pré-inscriptions** → *Valider* côté administration.
- Connectez-vous avec ces identifiants : l’application demande de choisir un mot de passe personnel, puis le parent voit son enfant, ses notes et bulletins, son emploi du temps et ses devoirs.

**Critère 3 — Un enseignant saisit une note ; le bulletin donne la moyenne correcte avec les coefficients.**
Connexion `enseignant@ecole.tn` → **Évaluations et notes** → *Ajouter une évaluation* (CE1 A) → *Saisir les notes* → *Enregistrer les notes*. La moyenne de l’évaluation s’affiche à droite. Le bulletin de l’élève (**Bulletins**, ou côté parent l’onglet *Notes et bulletins* → *Bulletin PDF*) applique la formule écrite sur le bulletin : moyenne de chaque matière ramenée sur 20, puis moyenne générale pondérée par les coefficients des matières évaluées.

**Critère 4 — Un paiement met à jour le solde, génère un reçu et envoie un message au parent.**
Connexion `comptable@ecole.tn` → **Paiements** → *Enregistrer un paiement* → élève *Ben Ali Adam*. L’objet et le montant de la prochaine échéance sont proposés automatiquement → *Enregistrer le paiement*. La fenêtre de confirmation affiche le numéro de reçu, le nouveau solde et le nombre de parents prévenus ; *Ouvrir le reçu* affiche le PDF. Côté `parent@ecole.tn`, le message automatique est arrivé dans la **Messagerie** (montant, date, mode, nouveau solde, lien du reçu) et dans les notifications. L’envoi est journalisé dans **Journal d’activité → Envois** (date, destinataire, statut).

**Critère 5 — Un message d’un enseignant déclenche une notification visible par le parent.**
Connexion `enseignant@ecole.tn` → **Messagerie** → *Nouveau message* → destinataire *Amel Ben Ali* → *Envoyer*. Côté parent, la cloche affiche le nombre de notifications non lues et le message apparaît en tête de la messagerie (et en notification push si elle est activée dans **Mon compte**).

**Critère 6 — Accès par une URL HTTPS publique sur ordinateur, tablette et smartphone.**
Voir la [section 2](#2-mettre-lapplication-en-ligne--option-a-du-cahier). L’interface s’adapte aux petits écrans (menu latéral repliable, tableaux empilés) et s’installe comme une application.

**Critère 7 — Ajouter / Modifier / Supprimer sur toutes les entités métier.**

| Entité | Où | Ajouter / Modifier / Supprimer |
|---|---|---|
| Classe, matière, salle, enseignant | menus du même nom | les trois, suppression contrôlée |
| Élève | **Élèves** puis dossier de l’élève | les trois, suppression contrôlée (confirmation explicite) |
| Créneau d’emploi du temps | **Emploi du temps** | les trois, conflits enseignant / salle / classe refusés |
| Évaluation et notes | **Évaluations et notes** | les trois (vider une case retire la note) |
| Paiement | **Paiements** | les trois, reçu régénéré et solde recalculé |
| Devoir | **Devoirs** | les trois, suppression contrôlée si des travaux ont été déposés |
| Message | **Messagerie** | brouillons : les trois ; message envoyé : immuable, le destinataire peut le retirer de sa boîte (règle imposée par le § 10.2) |
| Annonce | **Annonces** | brouillons : les trois ; annonce publiée : immuable, corrigée par une annonce rectificative (§ 10.3) |

Toutes ces opérations sont tracées automatiquement dans **Journal d’activité → Modifications**, avec les anciennes et nouvelles valeurs.

**À montrer en plus si le temps le permet** : un conflit dans l’emploi du temps (même salle ou même enseignant sur un créneau déjà pris) ; un devoir publié par l’enseignant, déposé par l’élève, noté puis corrigé ; l’appel en classe et la justification d’une absence par le parent ; les impayés et le bouton *Relancer maintenant* ; l’export des données d’un enfant (*Mes données (RGPD)*) ; le sélecteur d’année scolaire qui affiche l’historique de l’année précédente.

---

## 4. Fonctionnalités couvertes, chapitre par chapitre

| Chapitre du cahier | Réalisation |
|---|---|
| 2 — Acteurs | 5 rôles : administration, enseignant, parent, élève, comptable. Menus, pages et API filtrés par rôle (RBAC) ; un enseignant ne voit que ses classes et matières, un parent que ses enfants. |
| 3 — CRUD transversal | Formulaires validés, suppressions contrôlées (refus si l’entité est référencée, sauf confirmation explicite), suppression logique (`deleted_at`), journal d’audit automatique (utilisateur, date, anciennes et nouvelles valeurs). |
| 4 — Inscriptions et dossiers | Pré-inscription publique en 3 étapes validée par l’administration ; dossier complet (état civil, photo, parents, antécédents médicaux, année d’entrée) ; affectation automatique selon l’âge (classe la moins chargée du niveau) ou manuelle avec contrôle des effectifs ; import/export CSV et Excel. |
| 5 — Classes, matières, salles | CRUD complet, capacité, titulaire, affectations matière ↔ enseignant ↔ classe, disponibilité des salles. |
| 6 — Emploi du temps | Créneaux par classe ; détection des conflits enseignant / salle / classe ; vue semaine (ordinateur) et vue jour (smartphone) pour enseignants, parents et élèves. |
| 7 — Évaluations, notes, moyennes | Contrôles continus et examens, barème libre ramené sur 20, moyennes par matière et générale avec coefficients, rang et moyenne de classe, bulletin PDF, absences avec justification par le parent et validation. |
| 8 — Paiements | Grille tarifaire par année (inscription, tranches, autres frais) ; paiements espèces, virement, chèque, mobile money ; solde et retard calculés ; reçu PDF numéroté classé dans le dossier ; message automatique au parent (messagerie, notification, e-mail) journalisé ; impayés et relances automatiques chaque matin ; export comptable Excel/CSV. |
| 9 — Devoirs | Publication avec pièces jointes, dépôt par l’élève (remplaçable jusqu’à l’échéance, retard signalé), notation avec commentaire, correction publiée après l’échéance, suivi « vu » par les parents, notifications à chaque étape. |
| 10 — Messagerie | Canaux enseignant ↔ parent (fil par élève), administration ↔ parents, administration ↔ élèves ; destinataires filtrés selon le rôle ; pièces jointes ; brouillons ; immuabilité des messages envoyés garantie par la base ; masquage côté destinataire ; annonces ciblées et rectificatifs ; notifications in-app, push et e-mail ; journal des consultations de l’historique. |
| 16 — Checklist de mise en ligne | HTTPS (Cloudflare), secrets en variables d’environnement, sauvegarde quotidienne conservée 30 jours, colonne `annee_scolaire` sur les tables métier et sélecteur d’année. |
| 17 — Qualité | Interface responsive pensée d’abord pour le mobile, contrastes et focus clavier visibles (objectif WCAG 2.1 AA), mots de passe hachés avec bcrypt, RGPD (consentement, export, anonymisation), interface en français. |
| 18 — Contraintes techniques | React, API REST Node.js/Express, PostgreSQL, PWA, notifications push (Web Push, standard de la PWA) et e-mail SMTP (compatible SendGrid). Les fichiers sont stockés sur un volume Docker sauvegardé chaque jour. |

---

## 5. Architecture

```
  Ordinateur, tablette, smartphone (navigateur ou application installée)
                         │  HTTPS
                         ▼
        Cloudflare  https://….trycloudflare.com        ← option A du cahier
                         │  tunnel sortant : aucun port ouvert sur la box
                         ▼
  PC de démonstration : Docker Desktop
  ┌───────────────────────────────────────────────────────────────────┐
  │  app        Node.js 22 / Express 5                    port 3000    │
  │             ├─ interface React (PWA) : fichiers statiques          │
  │             ├─ API REST /api : sessions JWT, contrôle par rôle     │
  │             ├─ PDF (reçus, bulletins), Excel / CSV                 │
  │             ├─ notifications : messagerie, Web Push, e-mail SMTP   │
  │             └─ tâche planifiée : relances des impayés chaque matin │
  │                     │                                              │
  │  db         PostgreSQL 16 ── volume « donnees-db »                 │
  │             (triggers : journal d’audit, immuabilité des messages) │
  │  fichiers   volume « fichiers » (reçus, devoirs, pièces jointes)   │
  │  sauvegarde copie quotidienne de la base et des fichiers           │
  │             → dossier ./sauvegardes, conservation 30 jours         │
  └───────────────────────────────────────────────────────────────────┘
```

Choix principaux :

- **Un seul serveur sert l’interface et l’API**, sur un seul port : un seul tunnel suffit, pas de problème de CORS, et l’image Docker se déploie telle quelle sur Railway, Render ou un VPS.
- **Les règles sensibles sont dans la base de données** : un trigger PostgreSQL enregistre chaque ajout, modification et suppression dans `journal_audit` (avec l’utilisateur à l’origine de l’action), et d’autres triggers refusent toute modification d’un message envoyé ou d’une annonce publiée, même en cas d’erreur dans le code.
- **Historique pluriannuel** : `annee_scolaire` sur les classes, inscriptions, évaluations, absences, tarifs, paiements et devoirs ; une table `inscriptions` garantit une seule classe par élève et par année.
- **Notifications après validation** : les messages, e-mails et notifications push partent seulement une fois l’opération enregistrée en base, et chaque envoi est journalisé (`journal_envois`).
- **Sans serveur d’e-mail**, les e-mails sont « simulés » : ils sont enregistrés dans le journal des envois avec leur contenu, ce qui permet de vérifier le comportement pendant une démonstration.

---

## 6. Sauvegarde et restauration

### Sauvegarde automatique

Le service `sauvegarde` copie la base et les fichiers déposés **30 secondes après son démarrage, puis toutes les 24 heures**, dans le dossier `sauvegardes` du projet :

- `ecole_AAAA-MM-JJ_HHMM.dump` : la base complète (format personnalisé de `pg_dump`) ;
- `fichiers_AAAA-MM-JJ_HHMM.tgz` : les reçus, devoirs, pièces jointes et photos.

Les copies de plus de 30 jours sont supprimées automatiquement (rétention exigée par le cahier). Pour vérifier : `docker compose logs sauvegarde`.

**Faire une sauvegarde tout de suite** : `docker compose restart sauvegarde`, puis attendez 30 secondes.

### Restauration

Remplacez le nom des fichiers par ceux de la sauvegarde choisie (visibles dans le dossier `sauvegardes`).

```powershell
# 1. Arrêter l'application pendant la restauration
docker compose stop app

# 2. Restaurer la base (remplace entièrement son contenu)
docker compose exec sauvegarde pg_restore -h db -U ecole -d ecole --clean --if-exists /sauvegardes/ecole_2026-10-25_0900.dump

# 3. Redémarrer l'application
docker compose start app

# 4. Restaurer les fichiers (reçus, devoirs, pièces jointes)
docker compose exec app tar xzf /sauvegardes/fichiers_2026-10-25_0900.tgz -C /app/uploads
```

Une restauration se teste sans risque sur une copie : la procédure ci-dessus a été vérifiée en restaurant deux fois de suite la même sauvegarde (nombre d’élèves, de paiements, journal d’audit et numérotation des reçus identiques).

---

## 7. Migration des données existantes

Si l’école dispose déjà d’une liste d’élèves (tableur, ancien logiciel) :

1. Créez d’abord les **classes** de l’année (menu **Classes**), puis les **matières** et les **enseignants**.
2. **Élèves** → *Importer* → téléchargez le **modèle Excel** ou **CSV**. Colonnes : `matricule` (facultatif, généré sinon), `nom`, `prenom`, `date_naissance` (AAAA-MM-JJ ou JJ/MM/AAAA), `sexe`, `lieu_naissance`, `classe` (ex. `CE1 A`), `adresse`, `antecedents_medicaux`, `parent_nom`, `parent_prenom`, `parent_lien`, `parent_email`, `parent_telephone`.
3. Remplissez le modèle (le CSV peut utiliser `;` ou `,` comme séparateur), puis importez-le.
4. Le rapport d’import indique le nombre d’élèves créés, les lignes refusées avec la raison (date invalide, classe inconnue, matricule déjà utilisé…) et les **identifiants des comptes parents créés**, à transmettre aux familles. Un parent déjà présent (même e-mail) est simplement rattaché à l’enfant : les fratries sont gérées.
5. Corrigez les lignes refusées et réimportez uniquement celles-ci.

Les tarifs se saisissent dans **Grille tarifaire** ; les paiements déjà reçus peuvent être enregistrés avec leur date réelle. **Élèves** → *Exporter (Excel)* produit le même format, pour vérifier l’import ou récupérer les données.

---

## 8. Configuration

Sans fichier `.env`, les valeurs par défaut conviennent à la démonstration. Pour les changer : copiez `.env.example` en `.env`, modifiez-le, puis `docker compose up -d`.

| Variable | Rôle | Par défaut |
|---|---|---|
| `PORT_APP` | Port de l’application sur le PC | `3000` |
| `DB_PASSWORD` | Mot de passe de la base (à changer hors démonstration) | `ecole_mdp` |
| `SEED_DEMO` | Charger l’école de démonstration si la base est vide | `true` |
| `DEMO_MODE` | Afficher les comptes de démonstration sur la page de connexion | `true` |
| `ADMIN_EMAIL`, `ADMIN_MOT_DE_PASSE` | Premier compte de la direction quand `SEED_DEMO=false` (sans mot de passe : un mot de passe provisoire s’affiche dans `docker compose logs app`) | `admin@ecole.tn`, généré |
| `PUBLIC_URL` | Adresse publique fixe pour les liens des e-mails (sinon déduite automatiquement) | vide |
| `JWT_SECRET` | Secret des sessions (sinon généré et conservé en base) | vide |
| `TAILLE_MAX_FICHIER_MO` | Taille maximale d’un fichier envoyé | `10` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Envoi réel des e-mails (ex. SendGrid : `smtp.sendgrid.net`, port 587, utilisateur `apikey`) | e-mails simulés |

**Mise en service pour une vraie école** : `SEED_DEMO=false`, `DEMO_MODE=false`, un `DB_PASSWORD` solide, `ADMIN_EMAIL` avec l’adresse de la direction, et un serveur SMTP. Démarrez sur une base vide (`docker compose down -v` si la démonstration a déjà été chargée), connectez-vous avec le compte de la direction, puis créez classes, matières, tarifs et enseignants, et importez les élèves (section 7).

---

## 9. Sécurité et RGPD

- Mots de passe hachés avec bcrypt ; mot de passe provisoire à changer à la première connexion.
- Session dans un cookie `httpOnly` (inaccessible au JavaScript), `Secure` en HTTPS, `SameSite=Lax`.
- Contrôle d’accès par rôle appliqué par l’API sur chaque requête, pas seulement dans l’interface.
- Limitation des tentatives de connexion (30 échecs par quart d’heure et par adresse IP).
- En-têtes de sécurité (Content-Security-Policy, HSTS, protection contre l’intégration dans une autre page).
- Journalisation : modifications (audit), envois (messagerie, e-mail, push) et consultations de l’historique des conversations.
- RGPD : consentement parental enregistré à l’inscription, **export des données** d’un enfant au format JSON par le parent (portabilité), **anonymisation** d’un dossier par l’administration (droit à l’effacement : les notes et paiements sont conservés sans données personnelles). Les informations médicales ne sont visibles que par l’équipe éducative.

---

## 10. Tests automatisés

21 tests d’acceptation vérifient, par l’API, les fonctionnalités du cahier : connexion des 5 rôles, RBAC, critères 1 à 7, messagerie (immuabilité, brouillons, masquage), annonces, conflits d’emploi du temps, devoirs, absences, pré-inscription, import/export, journal d’audit, RGPD, relances et tableaux de bord.

```powershell
docker compose exec app npm test
```

Résultat attendu : `# pass 21` et `# fail 0`. Les tests créent des données (noms suffixés et nettoyés autant que possible) : ils peuvent être relancés, mais remettez la démonstration à zéro avant de la présenter (`docker compose down -v` puis `docker compose up -d`).

---

## 11. Développement sans Docker

Prérequis : Node.js 22 et PostgreSQL 16 avec une base `ecole` (utilisateur `ecole`, mot de passe `ecole_mdp`).

```bash
# Terminal 1 : API (port 3000), migrations et données de démo au premier lancement
cd server
npm install
npm run dev          # DATABASE_URL=postgres://ecole:ecole_mdp@localhost:5432/ecole par défaut

# Terminal 2 : interface avec rechargement à chaud (http://localhost:5173)
cd client
npm install
npm run dev          # les appels /api sont redirigés vers le port 3000
```

Pour servir l’interface construite par le serveur Node : `npm run build` dans `client`, puis lancer le serveur avec `PUBLIC_DIR=../client/dist`.

---

## 12. Structure du projet

```
ecole-primaire/
├── docker-compose.yml       application, base, sauvegardes, tunnel (option A)
├── Dockerfile               image de l'application (construction en 3 étapes)
├── .env.example             configuration (facultative)
├── docs/
│   └── GUIDE-UTILISATEUR.md guides administration, enseignant, parent, élève, comptable
├── client/                  interface React (PWA)
│   ├── public/              manifeste, service worker, icônes
│   └── src/
│       ├── pages/           une page par écran (élèves, notes, paiements, messagerie…)
│       ├── composants/      mise en page, formulaires, tableaux, dossier élève…
│       ├── contexte/        session et rôle, messages de confirmation
│       └── styles.css       charte graphique
└── server/                  API REST Node.js / Express
    ├── src/
    │   ├── db/migrations/   schéma SQL et triggers (audit, immuabilité)
    │   ├── db/seed.js       école de démonstration
    │   ├── routes/          une route par module (élèves, classes, paiements…)
    │   ├── services/        moyennes, finances, PDF, notifications, planificateur…
    │   └── middleware/      authentification, contrôle des rôles, erreurs
    └── tests/               tests d'acceptation
```

---

## 13. Vers une version SaaS

Le cahier exclut volontairement le multi-établissements du MVP (chapitre 19). L’application est néanmoins prête pour l’étape suivante :

- **Déjà en place** : application conteneurisée, configuration entièrement par variables d’environnement, base et fichiers dans des volumes séparés, sauvegardes automatiques, aucune donnée propre à l’école dans le code (le nom, l’adresse et les coordonnées de l’école se règlent dans **Paramètres**).
- **Options B, C, D du cahier** : la même image se déploie sur Railway ou Render (base PostgreSQL gérée fournie via `DATABASE_URL`), derrière un nom de domaine, ou sur un VPS avec Docker et un reverse proxy HTTPS.
- **SaaS « une instance par école »** : une pile `app + db` par établissement, chacune sur son sous-domaine (`ecole-x.domaine.tn`), créée automatiquement à partir de cette image. C’est l’approche la plus simple et la plus étanche, car chaque école garde sa propre base.
- **SaaS multi-tenant** (une seule base partagée) : il faudrait ajouter un identifiant d’établissement sur chaque table et dans chaque requête, un back-office de gestion des écoles clientes, des abonnements et de la facturation : ce sont précisément les éléments listés au chapitre 19.
