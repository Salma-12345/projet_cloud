// Page CRUD générique : liste filtrable + ajout / modification (modale) + suppression contrôlée.
import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useDonnees } from '../utils/useDonnees.js';
import { useRetours, useSuppression } from '../contexte/Retours.jsx';
import { Bouton, Etat, Feuille, PageTete, Recherche, Tableau, Vide } from './ui.jsx';
import { ModaleFormulaire } from './Formulaire.jsx';

export default function CrudPage({
  titre,
  description,
  endpoint,
  requete = '',
  colonnes,
  champs,
  singulier,
  icone,
  initial = {},
  versFormulaire = (l) => l,
  versApi = (v) => v,
  peutCreer = true,
  peutModifier = true,
  peutSupprimer = true,
  messageSuppression = () => 'Cette suppression est enregistrée dans le journal.',
  libelleSuppression,
  rechercheSur = [],
  actionsEntete,
  actionsLigne,
  apresCreation,
  avantFormulaire,
  filtres,
  titreFeuille,
}) {
  const { donnees, chargement, erreur, recharger } = useDonnees(`${endpoint}${requete}`);
  const [edition, setEdition] = useState(null); // null | {} (nouveau) | ligne
  const [texte, setTexte] = useState('');
  const { succes } = useRetours();
  const supprimer = useSuppression();
  // « une salle » -> « Salle ajoutée. », « Aucune salle pour le moment »
  const feminin = /^une\s/i.test(singulier);
  const nom = singulier.replace(/^une?\s+/i, '');
  const Nom = nom.charAt(0).toUpperCase() + nom.slice(1);
  const accord = (participe) => `${participe}${feminin ? 'e' : ''}`;

  const lignes = useMemo(() => {
    if (!donnees) return [];
    const q = texte.trim().toLowerCase();
    if (!q || !rechercheSur.length) return donnees;
    return donnees.filter((l) => rechercheSur.some((k) => String(typeof k === 'function' ? k(l) : l[k] ?? '').toLowerCase().includes(q)));
  }, [donnees, texte, rechercheSur]);

  const enregistrer = async (valeurs) => {
    const corps = versApi(valeurs);
    let resultat;
    if (edition && edition.id) {
      resultat = await api.put(`${endpoint}/${edition.id}`, corps);
      succes(`${Nom} ${accord('modifié')}.`);
    } else {
      resultat = await api.post(endpoint, corps);
      succes(`${Nom} ${accord('ajouté')}.`);
      if (apresCreation) apresCreation(resultat);
    }
    setEdition(null);
    recharger();
  };

  const colonnesCompletes = [
    ...colonnes,
    ...(peutModifier || peutSupprimer || actionsLigne
      ? [
          {
            titre: 'Actions',
            classe: 'actions',
            rendu: (l) => (
              <>
                {actionsLigne && actionsLigne(l, recharger)}
                {peutModifier && (typeof peutModifier !== 'function' || peutModifier(l)) && (
                  <Bouton petit variante="fantome" icone={Pencil} onClick={() => setEdition(l)} aria-label={`Modifier ${libelleSuppression ? libelleSuppression(l) : ''}`} title="Modifier" />
                )}
                {peutSupprimer && (typeof peutSupprimer !== 'function' || peutSupprimer(l)) && (
                  <Bouton
                    petit
                    variante="fantome"
                    icone={Trash2}
                    title="Supprimer"
                    aria-label={`Supprimer ${libelleSuppression ? libelleSuppression(l) : ''}`}
                    onClick={async () => {
                      const ok = await supprimer(`${endpoint}/${l.id}`, {
                        titre: `Supprimer ${libelleSuppression ? libelleSuppression(l) : singulier} ?`,
                        message: messageSuppression(l),
                      });
                      if (ok) recharger();
                    }}
                  />
                )}
              </>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageTete
        titre={titre}
        texte={description}
        actions={
          <>
            {actionsEntete && actionsEntete(recharger)}
            {peutCreer && (
              <Bouton variante="primaire" icone={Plus} onClick={() => setEdition({})}>
                Ajouter {singulier}
              </Bouton>
            )}
          </>
        }
      />
      <Feuille serre titre={titreFeuille} actions={rechercheSur.length ? <Recherche valeur={texte} onChange={setTexte} /> : null}>
        {filtres}
        <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
          {() => (
            <Tableau
              colonnes={colonnesCompletes}
              lignes={lignes}
              vide={
                <Vide
                  icone={icone}
                  titre={texte ? 'Aucun résultat' : `${feminin ? 'Aucune' : 'Aucun'} ${nom} pour le moment`}
                  texte={texte ? 'Essayez un autre terme de recherche.' : peutCreer ? `Ajoutez ${singulier} avec le bouton « Ajouter ${singulier} ».` : null}
                />
              }
            />
          )}
        </Etat>
      </Feuille>
      {edition && (
        <ModaleFormulaire
          titre={edition.id ? `Modifier ${singulier}` : `Ajouter ${singulier}`}
          champs={typeof champs === 'function' ? champs(edition) : champs}
          initial={edition.id ? versFormulaire(edition) : { ...initial }}
          onFermer={() => setEdition(null)}
          onEnvoyer={enregistrer}
          libelle={edition.id ? 'Enregistrer les modifications' : `Ajouter ${singulier}`}
          avant={avantFormulaire ? avantFormulaire(edition) : null}
        />
      )}
    </>
  );
}
