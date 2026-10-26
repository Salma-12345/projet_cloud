import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { AuthProvider, useAuth } from './contexte/Auth.jsx';
import { RetoursProvider } from './contexte/Retours.jsx';
import Layout from './composants/Layout.jsx';
import { Chargement, LienBouton, Vide } from './composants/ui.jsx';
import Connexion from './pages/Connexion.jsx';

const Preinscription = lazy(() => import('./pages/Preinscription.jsx'));
const TableauDeBord = lazy(() => import('./pages/TableauDeBord.jsx'));
const Eleves = lazy(() => import('./pages/Eleves.jsx'));
const DossierEleve = lazy(() => import('./pages/DossierEleve.jsx'));
const Preinscriptions = lazy(() => import('./pages/Preinscriptions.jsx'));
const Classes = lazy(() => import('./pages/Classes.jsx'));
const ClasseDetail = lazy(() => import('./pages/ClasseDetail.jsx'));
const Referentiels = lazy(() => import('./pages/Referentiels.jsx'));
const Personnes = lazy(() => import('./pages/Personnes.jsx'));
const EmploiDuTemps = lazy(() => import('./pages/EmploiDuTemps.jsx'));
const Evaluations = lazy(() => import('./pages/Evaluations.jsx'));
const SaisieNotes = lazy(() => import('./pages/SaisieNotes.jsx'));
const Bulletins = lazy(() => import('./pages/Bulletins.jsx'));
const Absences = lazy(() => import('./pages/Absences.jsx'));
const Finances = lazy(() => import('./pages/Finances.jsx'));
const Devoirs = lazy(() => import('./pages/Devoirs.jsx'));
const DevoirDetail = lazy(() => import('./pages/DevoirDetail.jsx'));
const Messagerie = lazy(() => import('./pages/Messagerie.jsx'));
const Annonces = lazy(() => import('./pages/Annonces.jsx'));
const Journal = lazy(() => import('./pages/Journal.jsx'));
const Parametres = lazy(() => import('./pages/Parametres.jsx'));
const Profil = lazy(() => import('./pages/Profil.jsx'));
const Enfant = lazy(() => import('./pages/Enfant.jsx'));
const MesNotes = lazy(() => import('./pages/MesNotes.jsx'));

function Protegee({ children }) {
  const { utilisateur } = useAuth();
  const lieu = useLocation();
  if (utilisateur === undefined) return <Chargement texte="Ouverture de votre espace…" />;
  if (!utilisateur) return <Navigate to="/connexion" replace state={{ depuis: lieu.pathname + lieu.search }} />;
  return children;
}

function Role({ roles, children }) {
  const { role } = useAuth();
  if (!roles.includes(role)) {
    return (
      <Vide
        icone={ShieldCheck}
        titre="Accès réservé"
        texte="Cette page n’est pas accessible avec votre profil. Si vous pensez qu’il s’agit d’une erreur, contactez l’administration."
        action={<LienBouton to="/">Retour à l’accueil</LienBouton>}
      />
    );
  }
  return children;
}

function Introuvable() {
  return <Vide titre="Page introuvable" texte="L’adresse demandée n’existe pas ou a été déplacée." action={<LienBouton to="/">Retour à l’accueil</LienBouton>} />;
}

const ADMIN = ['admin'];
const ADMINISTRATION = ['admin', 'comptable'];
const PERSONNEL = ['admin', 'comptable', 'enseignant'];
const PEDAGOGIE = ['admin', 'enseignant'];

function Routes_() {
  return (
    <Suspense fallback={<Chargement />}>
      <Routes>
        <Route path="/connexion" element={<Connexion />} />
        <Route path="/preinscription" element={<Preinscription />} />
        <Route
          path="/"
          element={
            <Protegee>
              <Layout />
            </Protegee>
          }
        >
          <Route index element={<TableauDeBord />} />
          <Route path="eleves" element={<Role roles={PERSONNEL}><Eleves /></Role>} />
          <Route path="eleves/:id" element={<Role roles={PERSONNEL}><DossierEleve /></Role>} />
          <Route path="preinscriptions" element={<Role roles={ADMINISTRATION}><Preinscriptions /></Role>} />
          <Route path="classes" element={<Role roles={PEDAGOGIE}><Classes /></Role>} />
          <Route path="classes/:id" element={<Role roles={PERSONNEL}><ClasseDetail /></Role>} />
          <Route path="matieres" element={<Role roles={ADMIN}><Referentiels type="matieres" /></Role>} />
          <Route path="salles" element={<Role roles={ADMIN}><Referentiels type="salles" /></Role>} />
          <Route path="enseignants" element={<Role roles={ADMIN}><Personnes role="enseignant" /></Role>} />
          <Route path="parents" element={<Role roles={ADMINISTRATION}><Personnes role="parent" /></Role>} />
          <Route path="comptes" element={<Role roles={ADMIN}><Personnes role="personnel" /></Role>} />
          <Route path="emploi-du-temps" element={<EmploiDuTemps />} />
          <Route path="evaluations" element={<Role roles={PEDAGOGIE}><Evaluations /></Role>} />
          <Route path="evaluations/:id" element={<Role roles={PEDAGOGIE}><SaisieNotes /></Role>} />
          <Route path="bulletins" element={<Role roles={PEDAGOGIE}><Bulletins /></Role>} />
          <Route path="absences" element={<Role roles={PEDAGOGIE}><Absences /></Role>} />
          <Route path="paiements" element={<Role roles={ADMINISTRATION}><Finances vue="paiements" /></Role>} />
          <Route path="impayes" element={<Role roles={ADMINISTRATION}><Finances vue="impayes" /></Role>} />
          <Route path="tarifs" element={<Role roles={ADMINISTRATION}><Finances vue="tarifs" /></Role>} />
          <Route path="devoirs" element={<Devoirs />} />
          <Route path="devoirs/:id" element={<DevoirDetail />} />
          <Route path="messagerie" element={<Messagerie />} />
          <Route path="messagerie/:id" element={<Messagerie />} />
          <Route path="annonces" element={<Annonces />} />
          <Route path="journal" element={<Role roles={ADMIN}><Journal /></Role>} />
          <Route path="parametres" element={<Role roles={ADMIN}><Parametres /></Role>} />
          <Route path="profil" element={<Profil />} />
          <Route path="enfants/:id" element={<Role roles={['parent']}><Enfant /></Role>} />
          <Route path="mes-notes" element={<Role roles={['eleve']}><MesNotes /></Role>} />
          <Route path="*" element={<Introuvable />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RetoursProvider>
          <Routes_ />
        </RetoursProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
