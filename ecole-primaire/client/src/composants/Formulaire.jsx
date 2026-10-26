// Formulaires génériques pilotés par une configuration de champs.
import { useId, useState } from 'react';
import { Champ, Encart, Modale } from './ui.jsx';

function valeurChamp(c, v) {
  if (v === null || v === undefined) return c.type === 'checkbox' ? false : '';
  return v;
}

export function ChampsFormulaire({ champs, valeurs, onChange, erreurs = {} }) {
  const maj = (nom, v) => onChange({ ...valeurs, [nom]: v });
  return (
    <div className="grille-form">
      {champs
        .filter((c) => !c.visible || c.visible(valeurs))
        .map((c) => {
          const options = typeof c.options === 'function' ? c.options(valeurs) : c.options;
          const v = valeurChamp(c, valeurs[c.nom]);
          if (c.type === 'checkbox') {
            return (
              <div key={c.nom} className={`champ${c.plein ? ' plein' : ''}`}>
                <label className="case">
                  <input type="checkbox" checked={Boolean(v)} onChange={(e) => maj(c.nom, e.target.checked)} disabled={c.desactive} />
                  <span>
                    {c.label}
                    {c.aide && <span className="champ__aide" style={{ display: 'block' }}>{c.aide}</span>}
                  </span>
                </label>
              </div>
            );
          }
          if (c.type === 'rendu') return <div key={c.nom} className={c.plein ? 'plein' : ''}>{c.rendu(valeurs, maj)}</div>;
          return (
            <Champ key={c.nom} label={c.label} requis={c.requis} aide={c.aide} erreur={erreurs[c.nom]} plein={c.plein}>
              {(id) =>
                c.type === 'select' ? (
                  <select id={id} value={v} onChange={(e) => maj(c.nom, e.target.value)} required={c.requis} disabled={c.desactive}>
                    {!c.requis || c.videAutorise ? <option value="">{c.placeholder || '—'}</option> : <option value="" disabled>{c.placeholder || 'Choisir…'}</option>}
                    {(options || []).map((o) => (
                      <option key={o.valeur} value={o.valeur}>
                        {o.libelle}
                      </option>
                    ))}
                  </select>
                ) : c.type === 'textarea' ? (
                  <textarea id={id} value={v} onChange={(e) => maj(c.nom, e.target.value)} required={c.requis} placeholder={c.placeholder} rows={c.lignes || 5} />
                ) : (
                  <input
                    id={id}
                    type={c.type || 'text'}
                    value={v}
                    onChange={(e) => maj(c.nom, e.target.value)}
                    required={c.requis}
                    min={c.min}
                    max={c.max}
                    step={c.step}
                    placeholder={c.placeholder}
                    autoComplete={c.autoComplete || 'off'}
                    disabled={c.desactive}
                    inputMode={c.inputMode}
                  />
                )
              }
            </Champ>
          );
        })}
    </div>
  );
}

export function ModaleFormulaire({ titre, sousTitre, champs, initial, onFermer, onEnvoyer, libelle = 'Enregistrer', large, avant, apres }) {
  const [valeurs, setValeurs] = useState(initial || {});
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const idForm = useId();

  const soumettre = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await onEnvoyer(valeurs);
    } catch (err) {
      setErreur(err);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modale
      titre={titre}
      sousTitre={sousTitre}
      onFermer={onFermer}
      large={large}
      pied={
        <>
          <button type="button" className="btn btn--secondaire" onClick={onFermer}>
            Annuler
          </button>
          <button type="submit" form={idForm} className="btn btn--primaire" disabled={envoi}>
            {envoi ? 'Enregistrement…' : libelle}
          </button>
        </>
      }
    >
      <form id={idForm} onSubmit={soumettre} noValidate={false}>
        {avant}
        {erreur && (
          <div style={{ marginBottom: 16 }}>
            <Encart ton="alerte">{erreur.message}</Encart>
          </div>
        )}
        <ChampsFormulaire champs={champs} valeurs={valeurs} onChange={setValeurs} erreurs={(erreur && erreur.donnees && erreur.donnees.erreurs) || {}} />
        {apres && apres(valeurs, setValeurs)}
      </form>
    </Modale>
  );
}
