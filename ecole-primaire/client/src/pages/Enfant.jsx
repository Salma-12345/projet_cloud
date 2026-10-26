// Suivi d'un enfant (vue parent).
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Download, MessageSquare, NotebookPen } from 'lucide-react';
import { useDonnees } from '../utils/useDonnees.js';
import { Avatar, Etat, Feuille, NoteManuscrite, Onglets, Pastille, Vide } from '../composants/ui.jsx';
import { AbsencesEleve, BulletinEleve, PaiementsEleve } from '../composants/Eleve.jsx';
import Edt from '../composants/Edt.jsx';
import { LIBELLES, TONS_SOUMISSION, dateHeure } from '../utils/format.js';

function EdtEnfant({ classeId }) {
  const { donnees, chargement, erreur, recharger } = useDonnees(classeId ? `/creneaux?classe_id=${classeId}` : null);
  if (!classeId) return <Feuille><Vide texte="Votre enfant n’a pas de classe cette année." /></Feuille>;
  return (
    <Feuille serre titre="Emploi du temps">
      <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
        {(liste) => <Edt creneaux={liste} mode="classe" />}
      </Etat>
    </Feuille>
  );
}

function DevoirsEnfant({ eleveId }) {
  const { donnees, chargement, erreur, recharger } = useDonnees(`/devoirs?eleve_id=${eleveId}`);
  return (
    <Feuille serre titre="Devoirs">
      <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
        {(liste) =>
          liste.length ? (
            <ul className="liste-reglee">
              {liste.map((d) => (
                <li key={d.id}>
                  <Link to={`/devoirs/${d.id}?eleve_id=${eleveId}`} className="liste-reglee__lien">
                    <NotebookPen size={18} color="var(--encre)" aria-hidden="true" />
                    <span className="liste-reglee__principal">
                      <span className="liste-reglee__titre" style={{ display: 'block' }}>
                        {d.titre}
                      </span>
                      <span className="liste-reglee__meta">
                        {d.matiere}, à rendre le {dateHeure(d.date_remise)}
                        {d.correction_disponible ? ', correction disponible' : ''}
                      </span>
                    </span>
                    {d.soumission.note !== null && d.soumission.note !== undefined ? (
                      <NoteManuscrite valeur={d.soumission.note} sur={d.bareme} />
                    ) : (
                      <Pastille ton={TONS_SOUMISSION[d.soumission.statut]}>{LIBELLES.soumission[d.soumission.statut]}</Pastille>
                    )}
                    {d.vu_at ? <Pastille>Vu</Pastille> : <Pastille ton="jaune">Nouveau</Pastille>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Vide icone={NotebookPen} texte="Aucun devoir pour le moment." />
          )
        }
      </Etat>
    </Feuille>
  );
}

export default function Enfant() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const onglet = params.get('onglet') || 'notes';
  const { donnees, chargement, erreur, recharger } = useDonnees(`/eleves/${id}`);
  return (
    <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
      {(e) => (
        <>
          <div className="page-tete">
            <div className="fiche">
              <Avatar prenom={e.prenom} nom={e.nom} photoId={e.photo_id} taille="grand" />
              <div className="page-tete__texte">
                <h1>
                  {e.prenom} {e.nom}
                </h1>
                <p>
                  {e.classe ? `${e.classe.classe}${e.classe.titulaire ? `, titulaire : ${e.classe.titulaire}` : ''}` : 'Sans classe cette année'}
                </p>
              </div>
            </div>
            <div className="page-tete__actions">
              <Link className="btn btn--secondaire" to={`/messagerie?nouveau=1`}>
                <MessageSquare size={17} aria-hidden="true" /> Écrire à l’école
              </Link>
              <a className="btn btn--secondaire" href={`/api/eleves/${e.id}/rgpd`} download>
                <Download size={17} aria-hidden="true" /> Mes données (RGPD)
              </a>
            </div>
          </div>
          <Onglets
            actif={onglet}
            onChange={(o) => setParams({ onglet: o }, { replace: true })}
            onglets={[
              { cle: 'notes', libelle: 'Notes et bulletins' },
              { cle: 'edt', libelle: 'Emploi du temps' },
              { cle: 'devoirs', libelle: 'Devoirs' },
              { cle: 'absences', libelle: 'Absences' },
              { cle: 'paiements', libelle: 'Paiements' },
            ]}
          />
          {onglet === 'notes' && <BulletinEleve eleveId={e.id} annees={e.inscriptions.map((i) => i.annee_scolaire)} />}
          {onglet === 'edt' && <EdtEnfant classeId={e.classe ? e.classe.classe_id : null} />}
          {onglet === 'devoirs' && <DevoirsEnfant eleveId={e.id} />}
          {onglet === 'absences' && <AbsencesEleve eleveId={e.id} prenom={e.prenom} />}
          {onglet === 'paiements' && <PaiementsEleve eleve={e} />}
        </>
      )}
    </Etat>
  );
}
