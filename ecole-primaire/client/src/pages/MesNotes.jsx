// Notes de l'élève connecté.
import { useAuth } from '../contexte/Auth.jsx';
import { useDonnees } from '../utils/useDonnees.js';
import { Etat, PageTete, Vide } from '../composants/ui.jsx';
import { BulletinEleve } from '../composants/Eleve.jsx';

export default function MesNotes() {
  const { utilisateur } = useAuth();
  const eleve = utilisateur.eleve;
  const { donnees, chargement, erreur, recharger } = useDonnees(eleve ? `/eleves/${eleve.id}` : null);
  if (!eleve) return <Vide titre="Compte non relié" texte="Ce compte n’est relié à aucun dossier d’élève. Contacte le secrétariat." />;
  return (
    <>
      <PageTete titre="Mes notes" texte={`${eleve.classe || ''}. Tes moyennes par matière et ta moyenne générale, trimestre par trimestre.`} />
      <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
        {(e) => <BulletinEleve eleveId={e.id} annees={e.inscriptions.map((i) => i.annee_scolaire)} />}
      </Etat>
    </>
  );
}
