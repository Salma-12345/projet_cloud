// Coquille de l'application : navigation par rôle, en-tête, notifications, menu utilisateur.
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  BookOpen,
  CalendarDays,
  CalendarX2,
  ClipboardList,
  DoorOpen,
  FileText,
  GraduationCap,
  History,
  House,
  KeyRound,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  NotebookPen,
  Receipt,
  School,
  Settings,
  UserCog,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../contexte/Auth.jsx';
import { Avatar, Chargement } from './ui.jsx';
import { LIBELLES, relatif } from '../utils/format.js';

function navigation(utilisateur) {
  const r = utilisateur.role;
  const accueil = { to: '/', libelle: 'Tableau de bord', icone: House, fin: true };
  const comm = {
    titre: 'Communication',
    liens: [
      { to: '/messagerie', libelle: 'Messagerie', icone: MessageSquare, compteur: 'messages' },
      { to: '/annonces', libelle: 'Annonces', icone: Megaphone },
    ],
  };
  if (r === 'admin') {
    return [
      { liens: [accueil] },
      {
        titre: 'Scolarité',
        liens: [
          { to: '/eleves', libelle: 'Élèves', icone: GraduationCap },
          { to: '/preinscriptions', libelle: 'Pré-inscriptions', icone: UserPlus },
          { to: '/classes', libelle: 'Classes', icone: School },
          { to: '/absences', libelle: 'Absences', icone: CalendarX2 },
        ],
      },
      {
        titre: 'Pédagogie',
        liens: [
          { to: '/emploi-du-temps', libelle: 'Emploi du temps', icone: CalendarDays },
          { to: '/evaluations', libelle: 'Évaluations et notes', icone: ClipboardList },
          { to: '/bulletins', libelle: 'Bulletins', icone: FileText },
          { to: '/devoirs', libelle: 'Devoirs', icone: NotebookPen },
          { to: '/matieres', libelle: 'Matières', icone: BookOpen },
          { to: '/salles', libelle: 'Salles', icone: DoorOpen },
        ],
      },
      {
        titre: 'Personnes',
        liens: [
          { to: '/enseignants', libelle: 'Enseignants', icone: Users },
          { to: '/parents', libelle: 'Parents', icone: Users },
          { to: '/comptes', libelle: 'Personnel administratif', icone: UserCog },
        ],
      },
      {
        titre: 'Finances',
        liens: [
          { to: '/paiements', libelle: 'Paiements', icone: Wallet },
          { to: '/impayes', libelle: 'Impayés et relances', icone: AlertTriangle },
          { to: '/tarifs', libelle: 'Grille tarifaire', icone: Receipt },
        ],
      },
      comm,
      {
        titre: 'Administration',
        liens: [
          { to: '/journal', libelle: 'Journal d’activité', icone: History },
          { to: '/parametres', libelle: 'Paramètres', icone: Settings },
        ],
      },
    ];
  }
  if (r === 'comptable') {
    return [
      { liens: [accueil] },
      {
        titre: 'Finances',
        liens: [
          { to: '/paiements', libelle: 'Paiements', icone: Wallet },
          { to: '/impayes', libelle: 'Impayés et relances', icone: AlertTriangle },
          { to: '/tarifs', libelle: 'Grille tarifaire', icone: Receipt },
        ],
      },
      {
        titre: 'Inscriptions',
        liens: [
          { to: '/eleves', libelle: 'Élèves', icone: GraduationCap },
          { to: '/preinscriptions', libelle: 'Pré-inscriptions', icone: UserPlus },
          { to: '/parents', libelle: 'Parents', icone: Users },
        ],
      },
      comm,
    ];
  }
  if (r === 'enseignant') {
    return [
      { liens: [accueil] },
      {
        titre: 'Ma classe',
        liens: [
          { to: '/classes', libelle: 'Mes classes', icone: School },
          { to: '/emploi-du-temps', libelle: 'Emploi du temps', icone: CalendarDays },
          { to: '/evaluations', libelle: 'Évaluations et notes', icone: ClipboardList },
          { to: '/bulletins', libelle: 'Bulletins', icone: FileText },
          { to: '/devoirs', libelle: 'Devoirs', icone: NotebookPen },
          { to: '/absences', libelle: 'Absences', icone: CalendarX2 },
        ],
      },
      comm,
    ];
  }
  if (r === 'parent') {
    return [
      { liens: [{ ...accueil, libelle: 'Accueil' }] },
      {
        titre: 'Mes enfants',
        liens: (utilisateur.enfants || []).map((e) => ({ to: `/enfants/${e.id}`, libelle: `${e.prenom}${e.classe ? ` (${e.classe})` : ''}`, icone: GraduationCap })),
      },
      { titre: 'Suivi', liens: [{ to: '/devoirs', libelle: 'Devoirs', icone: NotebookPen }] },
      comm,
    ];
  }
  return [
    { liens: [{ ...accueil, libelle: 'Accueil' }] },
    {
      titre: 'Ma scolarité',
      liens: [
        { to: '/emploi-du-temps', libelle: 'Emploi du temps', icone: CalendarDays },
        { to: '/devoirs', libelle: 'Mes devoirs', icone: NotebookPen },
        { to: '/mes-notes', libelle: 'Mes notes', icone: ClipboardList },
      ],
    },
    comm,
  ];
}

function Cloche({ compteur, onLu }) {
  const [ouvert, setOuvert] = useState(false);
  const [liste, setListe] = useState(null);
  const ref = useRef(null);
  const naviguer = useNavigate();

  useEffect(() => {
    if (!ouvert) return undefined;
    api.get('/notifications?limite=30').then(setListe).catch(() => setListe([]));
    const dehors = (e) => ref.current && !ref.current.contains(e.target) && setOuvert(false);
    document.addEventListener('mousedown', dehors);
    return () => document.removeEventListener('mousedown', dehors);
  }, [ouvert]);

  const ouvrir = async (n) => {
    setOuvert(false);
    if (!n.lu_at) await api.post(`/notifications/${n.id}/lu`).catch(() => {});
    onLu();
    if (n.lien) naviguer(n.lien);
  };

  return (
    <div className="cloche" ref={ref}>
      <button className="btn btn--fantome btn--icone" onClick={() => setOuvert((o) => !o)} aria-label={`Notifications${compteur ? ` (${compteur} non lues)` : ''}`} aria-expanded={ouvert}>
        <Bell size={20} />
        {compteur > 0 && <span className="cloche__point">{compteur > 99 ? '99+' : compteur}</span>}
      </button>
      {ouvert && (
        <div className="panneau-notifs" role="dialog" aria-label="Notifications">
          <div className="feuille__tete" style={{ padding: '12px 16px' }}>
            <h2 style={{ fontSize: 'var(--t-base)' }}>Notifications</h2>
            {compteur > 0 && (
              <button
                className="btn btn--fantome btn--petit"
                onClick={async () => {
                  await api.post('/notifications/tout-lu');
                  setListe((l) => (l || []).map((n) => ({ ...n, lu_at: n.lu_at || new Date().toISOString() })));
                  onLu();
                }}
              >
                Tout marquer comme lu
              </button>
            )}
          </div>
          {!liste ? (
            <p className="muet petit" style={{ padding: 16 }}>
              Chargement…
            </p>
          ) : liste.length === 0 ? (
            <p className="muet petit" style={{ padding: 16 }}>
              Aucune notification pour l’instant.
            </p>
          ) : (
            liste.map((n) => (
              <a
                key={n.id}
                href={n.lien || '#'}
                className={`notif${n.lu_at ? '' : ' notif--non-lue'}`}
                onClick={(e) => {
                  e.preventDefault();
                  ouvrir(n);
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="notif__titre">{n.titre}</div>
                  {n.contenu && <div className="notif__texte">{n.contenu}</div>}
                  <div className="tres-petit muet" style={{ marginTop: 2 }}>
                    {relatif(n.created_at)}
                  </div>
                </div>
              </a>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function MenuUtilisateur() {
  const { utilisateur, deconnexion } = useAuth();
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => ref.current && !ref.current.contains(e.target) && setOuvert(false);
    document.addEventListener('mousedown', dehors);
    return () => document.removeEventListener('mousedown', dehors);
  }, [ouvert]);
  return (
    <div className="menu-utilisateur" ref={ref}>
      <button className="menu-utilisateur__bouton" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} aria-label="Menu du compte">
        <Avatar prenom={utilisateur.prenom} nom={utilisateur.nom} taille="petit" />
        <span className="petit" style={{ textAlign: 'left', lineHeight: 1.2 }}>
          <span className="gras" style={{ display: 'block' }}>
            {utilisateur.prenom} {utilisateur.nom}
          </span>
          <span className="muet tres-petit">{LIBELLES.role[utilisateur.role]}</span>
        </span>
      </button>
      {ouvert && (
        <div className="menu-deroulant" role="menu">
          <Link to="/profil" role="menuitem" onClick={() => setOuvert(false)}>
            <KeyRound size={17} /> Mon compte et notifications
          </Link>
          <button role="menuitem" onClick={deconnexion}>
            <LogOut size={17} /> Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { utilisateur, annee, anneeCourante, estAnneeCourante, choisirAnnee, ecole } = useAuth();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [compteurs, setCompteurs] = useState({ notifications: 0, messages: 0 });
  const [annees, setAnnees] = useState([]);
  const lieu = useLocation();
  const personnel = ['admin', 'comptable', 'enseignant'].includes(utilisateur.role);

  const actualiser = useCallback(() => {
    api.get('/notifications/compteur').then(setCompteurs).catch(() => {});
  }, []);

  useEffect(() => {
    actualiser();
    const t = setInterval(actualiser, 30000);
    const visible = () => document.visibilityState === 'visible' && actualiser();
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [actualiser]);

  useEffect(() => {
    setMenuOuvert(false);
    actualiser();
  }, [lieu.pathname, actualiser]);

  useEffect(() => {
    if (personnel) api.get('/annees').then((r) => setAnnees(r.annees)).catch(() => {});
  }, [personnel]);

  const groupes = navigation(utilisateur);

  return (
    <div className={`app${menuOuvert ? ' app--menu-ouvert' : ''}`}>
      <a href="#contenu" className="lien-evitement">
        Aller au contenu
      </a>
      <aside className="laterale" aria-label="Navigation principale">
        <Link to="/" className="marque">
          <span className="marque__logo" aria-hidden="true">
            é
          </span>
          <span className="marque__nom">
            {(ecole && ecole.nom_ecole) || 'École primaire'}
            <span className="marque__sous">Année {anneeCourante}</span>
          </span>
        </Link>
        <nav className="nav">
          {groupes.map((g, i) => (
            <div key={i} className={g.titre ? 'nav__groupe' : ''}>
              {g.titre && <div className="nav__titre">{g.titre}</div>}
              {g.liens.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.fin} className="nav__lien">
                  <l.icone size={18} aria-hidden="true" />
                  <span>{l.libelle}</span>
                  {l.compteur && compteurs[l.compteur] > 0 && <span className="nav__compteur">{compteurs[l.compteur]}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="voile" onClick={() => setMenuOuvert(false)} aria-hidden="true" />
      <div className="principal">
        <header className="entete">
          <button className="btn btn--fantome btn--icone entete__menu" onClick={() => setMenuOuvert(true)} aria-label="Ouvrir le menu">
            <Menu size={22} />
          </button>
          <span className="entete__titre-mobile">{(ecole && ecole.nom_ecole) || 'École'}</span>
          <div className="entete__espace" />
          {personnel && annees.length > 1 && (
            <label>
              <span className="visuellement-cache">Année scolaire affichée</span>
              <select className="select-annee" value={annee} onChange={(e) => choisirAnnee(e.target.value)}>
                {annees.map((a) => (
                  <option key={a} value={a}>
                    {a}
                    {a === anneeCourante ? ' (en cours)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Cloche compteur={compteurs.notifications} onLu={actualiser} />
          <MenuUtilisateur />
        </header>
        {!estAnneeCourante && (
          <div className="bandeau-annee" role="status">
            <History size={17} aria-hidden="true" />
            Vous consultez l’historique de l’année {annee}.
            <button className="btn btn--secondaire btn--petit" onClick={() => choisirAnnee(null)}>
              Revenir à {anneeCourante}
            </button>
          </div>
        )}
        {utilisateur.doit_changer_mdp && lieu.pathname !== '/profil' && (
          <div className="bandeau-mdp" role="status">
            <KeyRound size={17} aria-hidden="true" />
            Vous utilisez un mot de passe provisoire.
            <Link to="/profil" className="btn btn--primaire btn--petit">
              Choisir mon mot de passe
            </Link>
          </div>
        )}
        <main id="contenu" className="contenu" tabIndex={-1}>
          <Suspense fallback={<Chargement />}>
            <Outlet context={{ actualiserCompteurs: actualiser }} />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
