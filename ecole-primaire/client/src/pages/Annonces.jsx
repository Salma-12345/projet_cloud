import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Lock, Megaphone, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../contexte/Auth.jsx';
import { useRetours, useSuppression } from '../contexte/Retours.jsx';
import { useDonnees } from '../utils/useDonnees.js';
import { Bouton, Encart, Etat, Feuille, PageTete, Pastille, Vide } from '../composants/ui.jsx';
import { ModaleFormulaire } from '../composants/Formulaire.jsx';
import { LIBELLES, dateHeure, relatif } from '../utils/format.js';

export default function Annonces() {
  const { role } = useAuth();
  const { succes, erreur: toastErreur, confirmer } = useRetours();
  const supprimer = useSuppression();
  const { donnees, chargement, erreur, recharger } = useDonnees('/annonces');
  const [edition, setEdition] = useState(null);
  const lieu = useLocation();
  const admin = role === 'admin';

  useEffect(() => {
    if (!donnees || !lieu.hash) return;
    const el = document.getElementById(lieu.hash.slice(1));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [donnees, lieu.hash]);

  const enregistrer = async (v) => {
    const corps = { titre: v.titre, contenu: v.contenu, audience: v.audience, corrige_id: v.corrige_id || null, publier: v.publier };
    const r = edition.id ? await api.put(`/annonces/${edition.id}`, corps) : await api.post('/annonces', corps);
    setEdition(null);
    succes(v.publier ? `Annonce publiée : ${r.notifies} personne(s) notifiée(s).` : 'Brouillon enregistré.');
    recharger();
  };

  const publierBrouillon = async (a) => {
    if (!(await confirmer({ titre: 'Publier cette annonce ?', message: 'Une fois publiée, elle ne pourra plus être modifiée ni supprimée (seule une annonce rectificative sera possible).', libelle: 'Publier' }))) return;
    try {
      const r = await api.put(`/annonces/${a.id}`, { titre: a.titre, contenu: a.contenu, audience: a.audience, corrige_id: a.corrige_id, publier: true });
      succes(`Annonce publiée : ${r.notifies} personne(s) notifiée(s).`);
      recharger();
    } catch (e) {
      toastErreur(e);
    }
  };

  return (
    <>
      <PageTete
        titre="Annonces"
        texte="Informations générales de l’école. Une annonce publiée ne peut être ni modifiée ni supprimée : en cas d’erreur, l’administration publie un rectificatif."
        actions={
          admin && (
            <Bouton variante="primaire" icone={Plus} onClick={() => setEdition({ audience: 'tous', publier: true })}>
              Rédiger une annonce
            </Bouton>
          )
        }
      />
      <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
        {(liste) =>
          liste.length === 0 ? (
            <Feuille>
              <Vide icone={Megaphone} titre="Aucune annonce" texte="Les annonces de l’école apparaîtront ici." />
            </Feuille>
          ) : (
            <div className="pile">
              {liste.map((a) => (
                <article key={a.id} id={`annonce-${a.id}`} className="feuille" style={{ scrollMarginTop: 80 }}>
                  <div className="feuille__tete">
                    <div>
                      <h2>{a.titre}</h2>
                      <p>
                        {a.statut === 'publiee' ? `Publiée ${relatif(a.publiee_at)}` : `Brouillon modifié ${relatif(a.updated_at)}`}, par {a.auteur}
                      </p>
                    </div>
                    <div className="groupe-btn">
                      {a.corrige_id && <Pastille ton="jaune">Rectificatif</Pastille>}
                      <Pastille ton="bleu">{LIBELLES.audience[a.audience]}</Pastille>
                      {a.statut === 'brouillon' ? (
                        <Pastille ton="jaune">Brouillon</Pastille>
                      ) : (
                        admin && (
                          <span className="petit muet" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }} title="Une annonce publiée est immuable">
                            <Lock size={13} aria-hidden="true" /> Immuable
                          </span>
                        )
                      )}
                    </div>
                  </div>
                  <div className="feuille__corps" style={{ display: 'grid', gap: 12 }}>
                    {a.corrige_id && (
                      <p className="petit muet">
                        Rectifie l’annonce « <a href={`#annonce-${a.corrige_id}`}>{a.corrige_titre}</a> ».
                      </p>
                    )}
                    <p className="pre" style={{ maxWidth: '72ch' }}>
                      {a.contenu}
                    </p>
                    {a.corrections && a.corrections.length > 0 && (
                      <Encart ton="attention">
                        Cette annonce a été rectifiée{' '}
                        {a.corrections.map((c) => (
                          <span key={c.id}>
                            le {dateHeure(c.publiee_at)} : <a href={`#annonce-${c.id}`}>{c.titre}</a>.{' '}
                          </span>
                        ))}
                      </Encart>
                    )}
                  </div>
                  {admin && (
                    <div className="feuille__pied groupe-btn groupe-btn--fin">
                      {a.statut === 'brouillon' ? (
                        <>
                          <Bouton
                            petit
                            variante="danger"
                            icone={Trash2}
                            onClick={async () => {
                              if (await supprimer(`/annonces/${a.id}`, { titre: 'Supprimer ce brouillon ?', message: a.titre })) recharger();
                            }}
                          >
                            Supprimer
                          </Bouton>
                          <Bouton petit icone={Pencil} onClick={() => setEdition({ ...a, publier: false })}>
                            Modifier
                          </Bouton>
                          <Bouton petit variante="primaire" icone={Send} onClick={() => publierBrouillon(a)}>
                            Publier
                          </Bouton>
                        </>
                      ) : (
                        <Bouton
                          petit
                          icone={Pencil}
                          onClick={() =>
                            setEdition({
                              titre: `Rectificatif : ${a.titre.replace(/^Rectificatif : /, '')}`,
                              contenu: a.contenu,
                              audience: a.audience,
                              corrige_id: a.id,
                              publier: true,
                            })
                          }
                        >
                          Publier un rectificatif
                        </Bouton>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )
        }
      </Etat>
      {edition && (
        <ModaleFormulaire
          titre={edition.id ? 'Modifier le brouillon' : edition.corrige_id ? 'Annonce rectificative' : 'Nouvelle annonce'}
          sousTitre={edition.corrige_id && !edition.id ? 'L’annonce d’origine reste visible, accompagnée d’un lien vers ce rectificatif.' : undefined}
          initial={edition}
          onFermer={() => setEdition(null)}
          onEnvoyer={enregistrer}
          libelle="Enregistrer"
          champs={[
            { nom: 'titre', label: 'Titre', requis: true, plein: true },
            { nom: 'audience', label: 'Destinataires', type: 'select', requis: true, options: Object.entries(LIBELLES.audience).map(([k, l]) => ({ valeur: k, libelle: l })) },
            { nom: 'contenu', label: 'Texte de l’annonce', type: 'textarea', requis: true, plein: true, lignes: 7 },
            { nom: 'publier', label: 'Publier maintenant (notification et e-mail aux destinataires). Sinon, enregistrer comme brouillon.', type: 'checkbox', plein: true },
          ]}
        />
      )}
    </>
  );
}
