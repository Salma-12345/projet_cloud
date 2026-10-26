// Emploi du temps : grille hebdomadaire (ordinateur) ou liste par jour (téléphone).
import { useEffect, useState } from 'react';
import { CalendarDays, LayoutGrid, List } from 'lucide-react';
import { JOURS, teinteMatiere } from '../utils/format.js';
import { Bouton, Vide } from './ui.jsx';

const DEBUT = 8 * 60;
const FIN = 17 * 60;
const ligne = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return 2 + Math.round((Math.min(Math.max(h * 60 + m, DEBUT), FIN) - DEBUT) / 15);
};

function jourActuel() {
  const j = new Date().getDay();
  return j === 0 ? 1 : j;
}

function detail(c, mode) {
  const parts = [];
  if (mode !== 'classe') parts.push(c.classe);
  if (mode !== 'enseignant') parts.push(c.enseignant);
  if (mode !== 'salle' && c.salle) parts.push(c.salle);
  return parts.join(', ');
}

export default function Edt({ creneaux, mode = 'classe', onCreneau, onVide }) {
  const [vue, setVue] = useState(() => (window.innerWidth < 760 ? 'jour' : 'semaine'));
  const [jour, setJour] = useState(jourActuel());
  const aujourdhui = new Date().getDay();

  useEffect(() => {
    const maj = () => window.innerWidth < 760 && setVue('jour');
    window.addEventListener('resize', maj);
    return () => window.removeEventListener('resize', maj);
  }, []);

  const heures = [];
  for (let h = 8; h <= 17; h++) heures.push(h);

  return (
    <div>
      <div className="filtres" style={{ justifyContent: 'space-between' }}>
        <div className="groupe-btn" role="group" aria-label="Affichage">
          <Bouton petit variante={vue === 'semaine' ? 'primaire' : 'secondaire'} icone={LayoutGrid} onClick={() => setVue('semaine')} aria-pressed={vue === 'semaine'}>
            Semaine
          </Bouton>
          <Bouton petit variante={vue === 'jour' ? 'primaire' : 'secondaire'} icone={List} onClick={() => setVue('jour')} aria-pressed={vue === 'jour'}>
            Jour
          </Bouton>
        </div>
        {vue === 'jour' && (
          <div className="groupe-btn" role="group" aria-label="Jour affiché">
            {JOURS.slice(1).map((j, i) => (
              <Bouton key={j} petit variante={jour === i + 1 ? 'primaire' : 'fantome'} onClick={() => setJour(i + 1)} aria-pressed={jour === i + 1}>
                {j.slice(0, 3)}.
              </Bouton>
            ))}
          </div>
        )}
      </div>

      {vue === 'semaine' ? (
        <div className="edt">
          <div className="edt__grille">
            {JOURS.slice(1).map((j, i) => (
              <div key={j} className={`edt__jour${aujourdhui === i + 1 ? ' edt__jour--aujourdhui' : ''}`} style={{ gridColumn: i + 2 }}>
                {j}
              </div>
            ))}
            {heures.map((h) => (
              <div key={`h${h}`} className="edt__heure" style={{ gridRow: 2 + (h - 8) * 4 }}>
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
            {heures.slice(0, -1).map((h) => (
              <div key={`l${h}`} className="edt__ligne" style={{ gridRow: `${2 + (h - 8) * 4} / span 2` }} />
            ))}
            {heures.slice(0, -1).map((h) => (
              <div key={`d${h}`} className="edt__ligne edt__ligne--demi" style={{ gridRow: `${4 + (h - 8) * 4} / span 2` }} />
            ))}
            {JOURS.slice(1).map((j, i) => (
              <div
                key={`c${j}`}
                className={`edt__colonne${onVide ? ' edt__colonne--cliquable' : ''}`}
                style={{ gridColumn: i + 2 }}
                onClick={
                  onVide
                    ? (e) => {
                        const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                        const h = Math.min(16, 8 + Math.floor(y / 60));
                        onVide(i + 1, `${String(h).padStart(2, '0')}:00`);
                      }
                    : undefined
                }
                title={onVide ? 'Cliquer pour ajouter un créneau' : undefined}
              />
            ))}
            {creneaux.map((c) => {
              const Balise = onCreneau ? 'button' : 'div';
              return (
                <Balise
                  key={c.id}
                  type={onCreneau ? 'button' : undefined}
                  className={`cours ${teinteMatiere(c.matiere)}`}
                  style={{ gridColumn: c.jour + 1, gridRow: `${ligne(c.heure_debut)} / ${ligne(c.heure_fin)}` }}
                  onClick={onCreneau ? () => onCreneau(c) : undefined}
                  aria-label={`${JOURS[c.jour]} ${c.heure_debut}–${c.heure_fin} : ${c.matiere}, ${detail(c, mode)}`}
                >
                  <span className="cours__matiere">{c.matiere}</span>
                  <span className="cours__detail">
                    {c.heure_debut}–{c.heure_fin}
                  </span>
                  <span className="cours__detail">{detail(c, mode)}</span>
                </Balise>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="edt-jour">
          {creneaux.filter((c) => c.jour === jour).length === 0 ? (
            <Vide icone={CalendarDays} texte={`Pas de cours le ${JOURS[jour].toLowerCase()}.`} />
          ) : (
            creneaux
              .filter((c) => c.jour === jour)
              .sort((a, b) => a.heure_debut.localeCompare(b.heure_debut))
              .map((c) => {
                const Balise = onCreneau ? 'button' : 'div';
                return (
                  <Balise key={c.id} type={onCreneau ? 'button' : undefined} className={`cours ${teinteMatiere(c.matiere)}`} onClick={onCreneau ? () => onCreneau(c) : undefined}>
                    <span className="gras" style={{ minWidth: 104, color: 'var(--graphite)' }}>
                      {c.heure_debut}–{c.heure_fin}
                    </span>
                    <span>
                      <span className="cours__matiere">{c.matiere}</span>
                      <span className="cours__detail" style={{ whiteSpace: 'normal' }}>
                        {detail(c, mode)}
                      </span>
                    </span>
                  </Balise>
                );
              })
          )}
        </div>
      )}
    </div>
  );
}
