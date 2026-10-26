# Guide d’utilisation

Ce guide explique, rôle par rôle, comment utiliser l’application de gestion de l’école. Il correspond au livrable « Documentation utilisateur (guide admin, guide enseignant, guide parent) » du cahier des charges, complété par les guides élève et comptable.

- [Pour tout le monde](#pour-tout-le-monde)
- [Guide administration (direction)](#guide-administration-direction)
- [Guide enseignant](#guide-enseignant)
- [Guide parent](#guide-parent)
- [Guide élève](#guide-élève)
- [Guide comptable et secrétariat](#guide-comptable-et-secrétariat)

---

## Pour tout le monde

### Se connecter

1. Ouvrez l’adresse de l’école dans un navigateur (ordinateur, tablette ou smartphone).
2. Saisissez l’adresse e-mail et le mot de passe remis par l’école, puis **Se connecter**.
3. À la première connexion, un bandeau indique que le mot de passe est provisoire : cliquez sur **Choisir mon mot de passe** et choisissez-en un personnel (8 caractères minimum).

**Mot de passe oublié ?** L’administration ou le secrétariat génère un nouveau mot de passe provisoire (icône clé dans les listes Enseignants, Parents et Personnel administratif, ou bouton *Réinitialiser le mot de passe* dans le dossier d’un élève).

### Se repérer

- Le **menu de gauche** donne accès aux pages autorisées pour votre rôle. Sur téléphone, il s’ouvre avec le bouton ☰ en haut à gauche.
- La **cloche** en haut à droite affiche vos notifications (nouveau message, note publiée, paiement, devoir, absence…). Un clic sur une notification ouvre la page concernée ; *Tout marquer comme lu* les vide.
- Le **menu du compte** (votre nom, en haut à droite) donne accès à **Mon compte** et à **Se déconnecter**.

### Mon compte

- **Changer de mot de passe.**
- **Notifications sur cet appareil** : *Activer les notifications* pour recevoir les alertes même quand l’application est fermée (à faire sur chaque appareil, le site doit être en HTTPS).
- **Installer l’application** : *Installer sur cet appareil* ajoute l’école à l’écran d’accueil comme une application. Sur iPhone : bouton Partager puis *Sur l’écran d’accueil*.

### Messagerie

- **Nouveau message** : choisissez un ou plusieurs destinataires (la liste ne propose que les personnes que votre rôle autorise à contacter), un objet, le texte, éventuellement l’élève concerné et des pièces jointes, puis **Envoyer**. Cochez *Message important* pour prévenir aussi les destinataires par e-mail.
- **Enregistrer le brouillon** garde un message non envoyé : il reste modifiable ou supprimable dans l’onglet *Brouillons*.
- **Un message envoyé ne peut plus être modifié ni supprimé** : c’est une règle de l’école pour garantir la traçabilité des échanges. Le destinataire peut seulement le **retirer de sa boîte**, sans effacer la copie de l’expéditeur.
- Pour répondre, ouvrez la conversation et écrivez en bas, puis **Répondre**.

### Annonces

Le menu **Annonces** regroupe les informations générales publiées par la direction (réunions, sorties, calendrier…). Une annonce publiée ne change plus : en cas d’erreur, la direction publie un *rectificatif*, signalé sur l’annonce d’origine.

---

## Guide administration (direction)

### 1. Préparer l’année scolaire

1. **Paramètres** : nom, adresse et coordonnées de l’école (repris sur les reçus et bulletins), devise, année scolaire courante.
2. **Classes** → *Ajouter une classe* : niveau (CP à CM2), section (A, B…), capacité maximale, enseignant titulaire.
3. **Matières** → *Ajouter une matière* : nom, coefficient, niveau concerné (vide = tous les niveaux).
4. **Salles** → *Ajouter une salle* : nom, capacité, disponibilité. Une salle indisponible ne peut pas recevoir de cours.
5. **Enseignants** → *Ajouter un enseignant* : ses identifiants s’affichent (et partent par e-mail si l’envoi est configuré). Transmettez-les à l’enseignant.
6. Dans la fiche de chaque classe (**Classes** → nom de la classe), section *Matières et enseignants* → **Affecter** : indiquez quel enseignant enseigne quelle matière dans cette classe.
7. **Emploi du temps** → choisissez une classe → *Ajouter un créneau* : matière, enseignant (proposé selon l’affectation), salle, jour, heures de début et de fin. Si l’enseignant, la salle ou la classe est déjà occupé sur ce créneau, l’enregistrement est refusé et le conflit est expliqué.
8. **Grille tarifaire** : frais d’inscription, tranches de scolarité et autres frais, par niveau, avec leur date d’échéance.

### 2. Inscrire les élèves

- **Élèves** → *Inscrire un élève* : identité, date de naissance, sexe, informations médicales, puis le responsable légal (*Nouveau parent*, *Parent déjà inscrit* pour une fratrie, ou *Plus tard*). Laissez cochée l’affectation automatique : l’élève rejoint la classe de son âge la moins chargée. Les identifiants du parent (et de l’élève si demandé) s’affichent à la fin.
- **Pré-inscriptions** : les demandes envoyées par les familles depuis la page de connexion. *Valider* crée le dossier, le compte du parent et l’affectation (automatique ou classe choisie) ; *Refuser* permet d’indiquer un motif.
- **Import d’une liste** : **Élèves** → *Importer*, à partir du modèle Excel ou CSV téléchargeable dans la même fenêtre. Le rapport liste les lignes refusées et les identifiants des parents créés.

### 3. Tenir les dossiers à jour

Dans le dossier d’un élève (**Élèves** → nom de l’élève) :

- *Modifier* l’identité, changer la photo, consulter la scolarité et l’historique des classes ;
- *Affecter* à une autre classe (les effectifs maximums sont contrôlés) ;
- *Rattacher* un responsable supplémentaire ;
- *Créer le compte* de l’élève ou *Réinitialiser le mot de passe* ;
- *Écrire aux parents* ;
- **Données personnelles (RGPD)** : *Exporter les données (portabilité)* ou *Anonymiser (droit à l’effacement)*. L’anonymisation efface définitivement le nom, l’adresse, la photo, les informations médicales et le compte, en conservant les notes et paiements sans données personnelles ;
- *Supprimer le dossier* : retiré des listes, l’historique est conservé.

Les suppressions sont contrôlées partout : une classe qui contient des élèves, une matière qui a des notes, un enseignant encore affecté ne peuvent pas être supprimés sans réaffectation ou confirmation explicite.

### 4. Suivre la vie de l’école

- **Tableau de bord** : effectifs par classe, pré-inscriptions à traiter, absences du jour, justificatifs à valider, taux de recouvrement des frais, derniers paiements, activité récente.
- **Absences** : *Suivi des absences* par classe et par statut ; *Accepter* ou *Refuser* les justificatifs envoyés par les parents.
- **Bulletins** : résultats par classe et par trimestre, bulletin PDF de chaque élève.
- **Évaluations et notes**, **Devoirs** : mêmes écrans que les enseignants, pour toutes les classes.

### 5. Communiquer

- **Annonces** → *Rédiger une annonce* : titre, destinataires (toute l’école, parents, enseignants, élèves ou personnel), texte. Cochez *Publier maintenant* pour l’envoyer tout de suite (notification et e-mail) ; sinon, elle reste en brouillon, modifiable. Sur une annonce publiée, *Publier un rectificatif*.
- **Messagerie** : vous pouvez écrire à tous les parents, enseignants et élèves.

### 6. Contrôler et retrouver

- **Journal d’activité** :
  - *Modifications* : chaque ajout, modification ou suppression, avec l’auteur, la date, les anciennes et les nouvelles valeurs ;
  - *Envois* : chaque message automatique, e-mail et notification push, avec son destinataire et son statut (envoyé, simulé, échec) ;
  - *Consultations* : qui a consulté quel historique de conversation, et quand.
- **Sélecteur d’année** (en haut) : affiche les classes, notes, absences et paiements d’une année précédente. Un bandeau rappelle que vous consultez l’historique.

---

## Guide enseignant

### Ma journée

Le **tableau de bord** affiche vos cours du jour (ou du prochain jour de classe), vos classes, les évaluations dont les notes restent à saisir, vos devoirs récents et les dernières annonces. **Mes classes** donne la liste des élèves de chaque classe ; **Emploi du temps** votre semaine (sur téléphone, la vue par jour).

### Saisir des notes

1. **Évaluations et notes** → *Ajouter une évaluation* : titre, classe, matière (seulement celles qui vous sont confiées), type (contrôle continu ou examen), trimestre, date, barème (« Noté sur »).
2. Sur la ligne de l’évaluation → *Saisir les notes*.
3. Tapez les notes (virgule ou point acceptés). **Entrée** passe à l’élève suivant. Laissez la case vide pour un élève absent ou non évalué ; un commentaire est possible pour chaque élève.
4. **Enregistrer les notes**. Le bilan (moyenne de la classe, plus haute, plus basse, élèves sous la moyenne) se met à jour, ainsi que les moyennes et les bulletins.

Une note se corrige en revenant sur la même page ; vider la case la retire. Les notes hors barème sont refusées. **Bulletins** donne les résultats de vos classes par trimestre et le bulletin PDF de chaque élève.

### Faire l’appel

**Absences** → *Feuille d’appel* : choisissez la classe, la date et la demi-journée, marquez les élèves *Absent* (tous sont *Présent* par défaut), puis **Enregistrer l’appel**. Les parents sont prévenus aussitôt et peuvent envoyer un justificatif, que vous pouvez *Accepter* ou *Refuser* dans *Suivi des absences*.

### Donner un devoir

1. **Devoirs** → *Publier un devoir* : titre, classe, matière, date et heure de remise, barème, consignes, fichiers joints (énoncé, fiche…). Élèves et parents reçoivent une notification.
2. Ouvrez le devoir pour suivre les dépôts : rendu, non rendu, en retard, avec la date de dépôt. Vous êtes notifié à chaque dépôt.
3. Notez chaque travail (note et commentaire), puis cliquez sur **Publier … note(s)** : élèves et parents voient la note et le commentaire, et sont notifiés.
4. Section *Correction* → **Déposer** le corrigé : il devient visible pour les élèves et les parents après la date de remise.

Un devoir se modifie (consignes, date, fichiers) à tout moment ; sa suppression demande une confirmation si des travaux ont déjà été déposés.

### Échanger avec les familles

**Messagerie** → *Nouveau message* : vous pouvez écrire aux parents de vos élèves et à l’administration. Indiquez l’*élève concerné* : la conversation est rangée dans le fil de cet élève.

---

## Guide parent

### L’accueil

Pour chacun de vos enfants : moyenne du trimestre et rang, absences non justifiées, reste à payer sur l’année et devoirs à venir. **Voir le suivi complet** ouvre la fiche de l’enfant (également accessible depuis le menu *Mes enfants*).

### La fiche de votre enfant

- **Notes et bulletins** : notes de chaque matière, moyennes, appréciations, rang ; bouton **Bulletin PDF** pour télécharger le bulletin du trimestre. Les années précédentes restent consultables.
- **Emploi du temps** de la classe.
- **Devoirs** : à faire, rendus, notés ; la note, le commentaire de l’enseignant et la correction quand elle est publiée. **Marquer comme vu** indique à l’enseignant que vous avez pris connaissance du devoir.
- **Absences** : **Justifier** une absence avec un motif et, si besoin, un justificatif (photo ou PDF). Le statut passe à « Justificatif à valider », puis « Justifiée » ou « Justificatif refusé ».
- **Paiements** : échéancier de l’année, paiements effectués et **reçus PDF** à télécharger.
- **Écrire à l’école** ouvre un nouveau message ; **Mes données (RGPD)** télécharge toutes les données de votre enfant.

### Paiements

Chaque paiement enregistré par l’école vous est confirmé automatiquement par un message (montant, date, mode de paiement, nouveau solde, lien du reçu), par une notification et par e-mail. En cas de retard, une relance vous est envoyée.

### Rester informé

Activez les notifications dans **Mon compte** et installez l’application sur votre téléphone : vous serez prévenu des nouveaux messages, notes, devoirs, absences et annonces.

---

## Guide élève

- **Accueil** : tes devoirs (à faire, rendus, notés), tes cours du jour et les dernières annonces.
- **Emploi du temps** : ta semaine de cours.
- **Mes devoirs** : ouvre un devoir pour lire les consignes et télécharger l’énoncé. Dans *Déposer mon travail*, choisis un ou plusieurs fichiers (photo, PDF ou document), ajoute un mot pour ton enseignant si tu veux, puis **Déposer mon travail**. Tu peux **Remplacer ton dépôt** tant que la date de remise n’est pas passée. Après, ton travail est marqué « en retard ». Quand l’enseignant a corrigé, tu vois ta note, son commentaire et la correction.
- **Mes notes** : tes notes et tes moyennes par matière.
- **Messagerie** : tu peux écrire à la direction et au secrétariat, et lire leurs messages. **Annonces** : les informations de l’école.

---

## Guide comptable et secrétariat

### Grille tarifaire

**Grille tarifaire** → *Ajouter un tarif* : libellé, type (inscription, tranche de scolarité, autres frais), montant, niveau concerné (vide = tous), date d’échéance. Le total annuel par niveau est calculé en bas de page. Les échéances servent au calcul des retards et aux relances.

### Enregistrer un paiement

1. **Paiements** → *Enregistrer un paiement* (ou depuis l’onglet Paiements du dossier d’un élève).
2. Choisissez l’élève : sa situation s’affiche (total de l’année, déjà payé, reste, retard) et la prochaine échéance non réglée est proposée avec son montant.
3. Vérifiez le montant, la date et le mode (espèces, virement, chèque, mobile money), ajoutez la référence du virement ou du chèque si besoin.
4. **Enregistrer le paiement** : un reçu PDF numéroté est créé et classé dans le dossier de l’élève, le solde est mis à jour, et les parents reçoivent automatiquement un message (messagerie, notification et e-mail). *Ouvrir le reçu* permet de l’imprimer.

Un paiement se modifie (crayon) ou se supprime (corbeille) : le reçu est régénéré, le solde recalculé et l’opération reste tracée dans le journal. La liste se filtre par élève, numéro de reçu, mode et période.

**Export comptable** : boutons *Export comptable* (Excel) et *CSV* en haut de la page Paiements.

### Impayés et relances

**Impayés et relances** liste les familles dont le solde n’est pas réglé (frais de l’année, payé, en retard, solde, dernière relance). Les relances automatiques partent chaque matin pour les échéances dépassées ; **Relancer maintenant** les envoie immédiatement. L’historique des relances envoyées est affiché sous la liste.

### Inscriptions

Le secrétariat a aussi accès à **Élèves**, **Pré-inscriptions** et **Parents** pour inscrire les élèves, valider les demandes en ligne et tenir à jour les coordonnées des familles (voir le guide administration, section 2).
