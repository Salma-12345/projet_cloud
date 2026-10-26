// Composants d'interface réutilisables.
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ArrowLeft, CircleAlert, Loader2, RefreshCw, X } from 'lucide-react';
import { initiales, note } from '../utils/format.js';
import { urlFichier } from '../api.js';

export function Bouton({ variante = 'secondaire', petit, icone: Icone, chargement, children, className = '', type = 'button', ...props }) {
  return (
    <button type={type} className={`btn btn--${variante}${petit ? ' btn--petit' : ''}${!children ? ' btn--icone' : ''} ${className}`} disabled={chargement || props.disabled} {...props}>
      {chargement ? <Loader2 size={petit ? 15 : 17} className="tourne" aria-hidden="true" /> : Icone ? <Icone size={petit ? 15 : 17} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function LienBouton({ variante = 'secondaire', petit, icone: Icone, children, className = '', ...props }) {
  return (
    <Link className={`btn btn--${variante}${petit ? ' btn--petit' : ''} ${className}`} {...props}>
      {Icone && <Icone size={petit ? 15 : 17} aria-hidden="true" />}
      {children}
    </Link>
  );
}

export function PageTete({ titre, texte, actions, retour }) {
  return (
    <div className="page-tete">
      <div className="page-tete__texte">
        {retour && (
          <Link to={retour.to} className="fil-ariane">
            <ArrowLeft size={15} aria-hidden="true" /> {retour.libelle}
          </Link>
        )}
        <h1>{titre}</h1>
        {texte && <p>{texte}</p>}
      </div>
      {actions && <div className="page-tete__actions">{actions}</div>}
    </div>
  );
}

export function Feuille({ titre, sousTitre, actions, children, serre, pied, className = '', id }) {
  return (
    <section className={`feuille ${className}`} id={id} aria-label={typeof titre === 'string' ? titre : undefined}>
      {(titre || actions) && (
        <div className="feuille__tete">
          <div>
            {titre && <h2>{titre}</h2>}
            {sousTitre && <p>{sousTitre}</p>}
          </div>
          {actions && <div className="groupe-btn">{actions}</div>}
        </div>
      )}
      <div className={serre ? 'feuille__corps--serre' : 'feuille__corps'}>{children}</div>
      {pied && <div className="feuille__pied">{pied}</div>}
    </section>
  );
}

export function Pastille({ ton = 'gris', children, icone: Icone }) {
  return (
    <span className={`pastille pastille--${ton}`}>
      {Icone && <Icone size={13} aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Avatar({ prenom, nom, photoId, taille = '' }) {
  return (
    <span className={`avatar ${taille ? `avatar--${taille}` : ''}`} aria-hidden="true">
      {photoId ? <img src={urlFichier(photoId)} alt="" loading="lazy" /> : initiales(prenom, nom)}
    </span>
  );
}

/** Note écrite à la main et entourée au stylo (vert si ≥ 10/20, rouge sinon). */
export function NoteManuscrite({ valeur, sur = 20, taille = 'moyenne', anime = false, sansSur = false }) {
  if (valeur === null || valeur === undefined) {
    return <span className={`note-manuscrite note-manuscrite--neutre note-${taille}`}>—</span>;
  }
  const faible = (Number(valeur) / Number(sur)) * 20 < 10;
  return (
    <span
      className={`note-manuscrite note-${taille}${faible ? ' note-manuscrite--faible' : ''}${anime ? ' note-manuscrite--anime' : ''}`}
      aria-label={`${note(valeur)} sur ${sur}`}
      role="img"
    >
      <svg viewBox="0 0 120 60" preserveAspectRatio="none" aria-hidden="true">
        <path pathLength="1" d="M15 35 C 9 17, 43 5, 71 7 C 101 9, 117 22, 112 37 C 107 51, 75 57, 47 53 C 21 50, 5 40, 12 25 C 16 17, 27 11, 38 9" />
      </svg>
      <span aria-hidden="true">
        {note(valeur)}
        {!sansSur && <span className="note-manuscrite__sur">/{note(sur)}</span>}
      </span>
    </span>
  );
}

export function Vide({ icone: Icone, titre, texte, action }) {
  return (
    <div className="vide">
      {Icone && (
        <span className="vide__icone">
          <Icone size={26} aria-hidden="true" />
        </span>
      )}
      {titre && <h3>{titre}</h3>}
      {texte && <p>{texte}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function Chargement({ texte = 'Chargement…' }) {
  return (
    <div className="chargement" role="status">
      <Loader2 size={20} className="tourne" aria-hidden="true" /> {texte}
    </div>
  );
}

export function ErreurChargement({ erreur, onReessayer }) {
  return (
    <div className="vide">
      <span className="vide__icone" style={{ background: 'var(--marge-pale)', color: 'var(--marge-fonce)' }}>
        <CircleAlert size={26} aria-hidden="true" />
      </span>
      <h3>Impossible d’afficher ces informations</h3>
      <p>{erreur ? erreur.message : 'Erreur inconnue.'}</p>
      {onReessayer && (
        <Bouton icone={RefreshCw} onClick={onReessayer}>
          Réessayer
        </Bouton>
      )}
    </div>
  );
}

/** Affiche chargement / erreur / contenu. */
export function Etat({ chargement, erreur, donnees, onReessayer, children }) {
  if (erreur) return <ErreurChargement erreur={erreur} onReessayer={onReessayer} />;
  if (chargement && !donnees) return <Chargement />;
  if (!donnees) return null;
  return children(donnees);
}

export function Encart({ ton = 'info', icone: Icone = CircleAlert, children }) {
  return (
    <div className={`encart ${ton !== 'info' ? `encart--${ton}` : ''}`} role={ton === 'alerte' ? 'alert' : undefined}>
      <Icone size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function Onglets({ onglets, actif, onChange, label = 'Sections' }) {
  return (
    <div className="onglets" role="tablist" aria-label={label}>
      {onglets.map((o) => (
        <button key={o.cle} role="tab" type="button" className="onglet" aria-selected={actif === o.cle} onClick={() => onChange(o.cle)}>
          {o.icone && <o.icone size={16} aria-hidden="true" />}
          {o.libelle}
          {o.compteur ? <Pastille ton={o.tonCompteur || 'bleu'}>{o.compteur}</Pastille> : null}
        </button>
      ))}
    </div>
  );
}

export function Modale({ titre, sousTitre, onFermer, children, pied, large, etroite }) {
  const ref = useRef(null);
  const idTitre = useId();
  useEffect(() => {
    const precedent = document.activeElement;
    const echap = (e) => {
      if (e.key === 'Escape') onFermer();
    };
    document.addEventListener('keydown', echap);
    document.body.style.overflow = 'hidden';
    const premier = ref.current && ref.current.querySelector('input:not([type=hidden]), select, textarea, [autofocus], button:not(.modale__fermer)');
    if (premier) premier.focus();
    return () => {
      document.removeEventListener('keydown', echap);
      document.body.style.overflow = '';
      if (precedent && precedent.focus) precedent.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return createPortal(
    <div className="modale-fond" onMouseDown={(e) => e.target === e.currentTarget && onFermer()}>
      <div className={`modale${large ? ' modale--large' : ''}${etroite ? ' modale--etroite' : ''}`} role="dialog" aria-modal="true" aria-labelledby={idTitre} ref={ref}>
        <div className="modale__tete">
          <div>
            <h2 id={idTitre}>{titre}</h2>
            {sousTitre && <p className="muet petit" style={{ marginTop: 4 }}>{sousTitre}</p>}
          </div>
          <button type="button" className="btn btn--fantome btn--icone btn--petit modale__fermer" onClick={onFermer} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="modale__corps">{children}</div>
        {pied && <div className="modale__pied">{pied}</div>}
      </div>
    </div>,
    document.body
  );
}

/** Tableau responsive : les lignes s'empilent sur mobile avec le titre de chaque colonne. */
export function Tableau({ colonnes, lignes, cle = 'id', vide = null, empile = true, compact = false, classeLigne }) {
  if (!lignes || !lignes.length) return vide;
  return (
    <div className="tableau-conteneur">
      <table className={`tableau${empile ? ' tableau--empile' : ''}${compact ? ' tableau--compact' : ''}`}>
        <thead>
          <tr>
            {colonnes.map((c, i) => (
              <th key={i} className={c.classe} scope="col">
                {c.titre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={l[cle] ?? i} className={classeLigne ? classeLigne(l) : undefined}>
              {colonnes.map((c, j) => (
                <td key={j} className={c.classe} data-label={c.titre}>
                  {c.rendu ? c.rendu(l) : l[c.cle] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pages, total, onPage }) {
  if (pages <= 1) return null;
  return (
    <div className="pagination">
      <span className="muet">
        Page {page} sur {pages}, {total} entrées
      </span>
      <div className="groupe-btn">
        <Bouton petit onClick={() => onPage(page - 1)} disabled={page <= 1}>
          Précédente
        </Bouton>
        <Bouton petit onClick={() => onPage(page + 1)} disabled={page >= pages}>
          Suivante
        </Bouton>
      </div>
    </div>
  );
}

export function Jauge({ valeur, max, libelle }) {
  const pct = max > 0 ? Math.min(100, Math.round((valeur / max) * 100)) : 0;
  return (
    <div className={`jauge${pct >= 100 ? ' jauge--pleine' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={valeur} aria-label={libelle}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Recherche({ valeur, onChange, placeholder = 'Rechercher…' }) {
  return (
    <label className="recherche">
      <span className="visuellement-cache">{placeholder}</span>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input type="search" value={valeur} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

/** Champ de formulaire avec libellé, aide et message d'erreur. */
export function Champ({ label, requis, aide, erreur, plein, children, id: idFourni }) {
  const idAuto = useId();
  const id = idFourni || idAuto;
  const enfant = typeof children === 'function' ? children(id) : children;
  return (
    <div className={`champ${erreur ? ' champ--erreur' : ''}${plein ? ' plein' : ''}`}>
      {label && (
        <label htmlFor={id}>
          {label}
          {requis && (
            <span className="champ__requis" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {enfant}
      {aide && !erreur && <span className="champ__aide">{aide}</span>}
      {erreur && <span className="champ__erreur">{erreur}</span>}
    </div>
  );
}
