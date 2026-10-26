import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileDown, FileText } from 'lucide-react';
import { qs } from '../api.js';
import { useAuth } from '../contexte/Auth.jsx';
import { useDonnees } from '../utils/useDonnees.js';
import { Champ, Etat, Feuille, NoteManuscrite, PageTete, Vide } from '../composants/ui.jsx';
import { nombre } from '../utils/format.js';
import { trimestreCourant } from '../composants/Eleve.jsx';

export default function Bulletins() {
  const { annee, anneeCourante } = useAuth();
  const [params, setParams] = useSearchParams();
  const { donnees: classes } = useDonnees(`/classes${qs({ annee })}`);
  const classeId = params.get('classe_id') || '';
  const trimestre = params.get('trimestre') || String(annee === anneeCourante ? trimestreCourant() : 3);

  useEffect(() => {
    if (!classeId && classes && classes.length) setParams({ classe_id: String(classes[0].id), trimestre }, { replace: true });
  }, [classeId, classes, trimestre, setParams]);

  const { donnees, chargement, erreur, recharger } = useDonnees(classeId ? `/bulletins/classe/${classeId}?trimestre=${trimestre}` : null);
  const [tri, setTri] = useState('rang');

  return (
    <>
      <PageTete
        titre="Résultats et bulletins"
        texte="Moyennes par matière et moyenne générale pondérée par les coefficients. Chaque bulletin est téléchargeable en PDF."
      />
      <Feuille serre>
        <div className="filtres">
          <Champ label="Classe">
            {(id) => (
              <select id={id} value={classeId} onChange={(e) => setParams({ classe_id: e.target.value, trimestre }, { replace: true })}>
                {(classes || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            )}
          </Champ>
          <Champ label="Trimestre">
            {(id) => (
              <select id={id} value={trimestre} onChange={(e) => setParams({ classe_id: classeId, trimestre: e.target.value }, { replace: true })}>
                {[1, 2, 3].map((t) => (
                  <option key={t} value={t}>
                    Trimestre {t}
                  </option>
                ))}
              </select>
            )}
          </Champ>
          <Champ label="Trier par">
            {(id) => (
              <select id={id} value={tri} onChange={(e) => setTri(e.target.value)}>
                <option value="rang">Rang</option>
                <option value="nom">Nom</option>
              </select>
            )}
          </Champ>
        </div>
        <Etat chargement={chargement} erreur={erreur} donnees={donnees} onReessayer={recharger}>
          {(r) => {
            const lignes = [...r.lignes].sort((a, b) =>
              tri === 'nom' ? a.eleve.nom.localeCompare(b.eleve.nom) : (a.rang ?? 999) - (b.rang ?? 999) || a.eleve.nom.localeCompare(b.eleve.nom)
            );
            if (!lignes.length) return <Vide icone={FileText} texte="Aucun élève dans cette classe." />;
            return (
              <>
                <div className="chiffres" style={{ borderBottom: '1px solid var(--ligne)' }}>
                  <div className="chiffre">
                    <span className="chiffre__valeur">
                      <NoteManuscrite valeur={r.stats_generale.moyenne} />
                    </span>
                    <span className="chiffre__libelle">moyenne de la classe</span>
                  </div>
                  <div className="chiffre">
                    <span className="chiffre__valeur">{nombre(r.stats_generale.max)}</span>
                    <span className="chiffre__libelle">meilleure moyenne</span>
                  </div>
                  <div className="chiffre">
                    <span className="chiffre__valeur">{nombre(r.stats_generale.min)}</span>
                    <span className="chiffre__libelle">plus faible moyenne</span>
                  </div>
                  <div className="chiffre">
                    <span className="chiffre__valeur">{r.lignes.filter((l) => l.moyenne_generale !== null && l.moyenne_generale < 10).length}</span>
                    <span className="chiffre__libelle">élève(s) sous 10/20</span>
                  </div>
                </div>
                <div className="tableau-conteneur">
                  <table className="tableau tableau--compact">
                    <thead>
                      <tr>
                        <th scope="col">Rang</th>
                        <th scope="col">Élève</th>
                        {r.matieres.map((m) => (
                          <th key={m.id} scope="col" className="num" title={`${m.nom}, coefficient ${nombre(m.coefficient)}`}>
                            {m.nom.length > 12 ? `${m.nom.slice(0, 11)}.` : m.nom}
                            <span className="muet" style={{ display: 'block', fontWeight: 500 }}>
                              coef. {nombre(m.coefficient)}
                            </span>
                          </th>
                        ))}
                        <th scope="col" className="num">
                          Moyenne
                        </th>
                        <th scope="col">Bulletin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lignes.map((l) => (
                        <tr key={l.eleve.id}>
                          <td className="gras">{l.rang ? `${l.rang}${l.rang === 1 ? 'er' : 'e'}` : '—'}</td>
                          <td>
                            <Link to={`/eleves/${l.eleve.id}?onglet=notes`} className="gras nowrap">
                              {l.eleve.nom} {l.eleve.prenom}
                            </Link>
                          </td>
                          {r.matieres.map((m) => (
                            <td key={m.id} className="num" style={{ color: l.moyennes[m.id] !== null && l.moyennes[m.id] < 10 ? 'var(--stylo-rouge)' : undefined }}>
                              {nombre(l.moyennes[m.id])}
                            </td>
                          ))}
                          <td className="num">
                            <strong style={{ color: l.moyenne_generale !== null && l.moyenne_generale < 10 ? 'var(--stylo-rouge)' : 'var(--stylo-vert)' }}>
                              {nombre(l.moyenne_generale)}
                            </strong>
                          </td>
                          <td>
                            <a className="btn btn--secondaire btn--petit" href={`/api/bulletins/eleve/${l.eleve.id}/pdf${qs({ annee: r.classe.annee_scolaire, trimestre })}`} target="_blank" rel="noreferrer">
                              <FileDown size={15} aria-hidden="true" /> PDF
                            </a>
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td />
                        <td className="muet gras">Moyenne de la classe</td>
                        {r.matieres.map((m) => (
                          <td key={m.id} className="num muet">
                            {nombre(r.stats[m.id].moyenne)}
                          </td>
                        ))}
                        <td className="num muet gras">{nombre(r.stats_generale.moyenne)}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            );
          }}
        </Etat>
      </Feuille>
    </>
  );
}
