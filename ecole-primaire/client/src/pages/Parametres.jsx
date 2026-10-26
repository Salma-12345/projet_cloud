import { useEffect, useState } from 'react';
import { CalendarDays, Save } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../contexte/Auth.jsx';
import { useRetours } from '../contexte/Retours.jsx';
import { useDonnees } from '../utils/useDonnees.js';
import { Bouton, Encart, Etat, Feuille, PageTete } from '../composants/ui.jsx';
import { ChampsFormulaire } from '../composants/Formulaire.jsx';

export default function Parametres() {
  const { recharger: rechargerAuth, anneeCourante, utilisateur } = useAuth();
  const { succes, erreur: toastErreur, confirmer } = useRetours();
  const { donnees, chargement, erreur, recharger } = useDonnees('/parametres');
  const [v, setV] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [bilan, setBilan] = useState(null);

  useEffect(() => {
    if (donnees) setV(donnees);
  }, [donnees]);

  const enregistrer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    try {
      await api.put('/parametres', v);
      succes('Paramètres enregistrés.');
      await rechargerAuth();
      recharger();
    } catch (err) {
      toastErreur(err);
    } finally {
      setEnvoi(false);
    }
  };

  const passage = async () => {
    const [a, b] = anneeCourante.split('-').map(Number);
    const suivante = `${a + 1}-${b + 1}`;
    const ok = await confirmer({
      titre: `Passer à l’année ${suivante} ?`,
      message:
        `Les classes et la grille tarifaire de ${anneeCourante} seront recopiées pour ${suivante}. Chaque élève passe au niveau supérieur dans la même section ; les élèves de CM2 sont marqués « sortis ».\n\n` +
        `Toutes les données de ${anneeCourante} (notes, paiements, absences) restent consultables dans l’historique.`,
      libelle: `Passer à ${suivante}`,
      danger: true,
    });
    if (!ok) return;
    try {
      setBilan(await api.post('/annees/passage'));
      await rechargerAuth();
      recharger();
    } catch (err) {
      toastErreur(err);
    }
  };

  return (
    <>
      <PageTete titre="Paramètres" texte="Informations de l’établissement (reçus, bulletins, e-mails) et gestion des années scolaires." />
      <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
        {() =>
          v && (
            <div className="grille-principale">
              <Feuille titre="Établissement">
                <form onSubmit={enregistrer} style={{ display: 'grid', gap: 18 }}>
                  <ChampsFormulaire
                    valeurs={v}
                    onChange={setV}
                    champs={[
                      { nom: 'nom_ecole', label: 'Nom de l’école', requis: true, plein: true },
                      { nom: 'adresse_ecole', label: 'Adresse', plein: true },
                      { nom: 'telephone_ecole', label: 'Téléphone' },
                      { nom: 'email_ecole', label: 'E-mail', type: 'email' },
                      { nom: 'devise', label: 'Devise', aide: 'Affichée sur les montants et les reçus.' },
                      { nom: 'annee_courante', label: 'Année scolaire courante', requis: true, aide: 'Format AAAA-AAAA. Utilisez plutôt le passage à l’année suivante.' },
                    ]}
                  />
                  <div>
                    <Bouton type="submit" variante="primaire" icone={Save} chargement={envoi}>
                      Enregistrer
                    </Bouton>
                  </div>
                </form>
              </Feuille>
              <div className="pile">
                <Feuille titre="Année scolaire">
                  <p style={{ marginBottom: 14 }}>
                    Année en cours : <strong>{anneeCourante}</strong>. Toutes les tables métier portent l’année scolaire : l’historique des
                    années précédentes reste consultable avec le sélecteur d’année en haut de l’écran.
                  </p>
                  <Bouton icone={CalendarDays} onClick={passage}>
                    Passer à l’année suivante
                  </Bouton>
                  {bilan && (
                    <div style={{ marginTop: 14 }}>
                      <Encart ton="succes">
                        Année {bilan.nouvelle} ouverte : {bilan.classes} classe(s) recopiée(s), {bilan.eleves_passes} élève(s) passé(s) au niveau supérieur,{' '}
                        {bilan.eleves_sortis} élève(s) de CM2 sorti(s).
                      </Encart>
                    </div>
                  )}
                </Feuille>
                <Feuille titre="Notifications">
                  <dl className="definitions petit">
                    <dt>Messagerie interne</dt>
                    <dd>Active</dd>
                    <dt>Notifications push</dt>
                    <dd>Actives (chaque utilisateur les autorise depuis son compte)</dd>
                    <dt>E-mails</dt>
                    <dd>{utilisateur.email_actif ? 'Serveur SMTP configuré' : 'Simulés : contenu visible dans le journal des envois. Configurez SMTP_HOST (ex. SendGrid) pour les envoyer réellement.'}</dd>
                  </dl>
                </Feuille>
              </div>
            </div>
          )
        }
      </Etat>
    </>
  );
}
