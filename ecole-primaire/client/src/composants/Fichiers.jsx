// Liste de fichiers joints et sélection de nouveaux fichiers.
import { Paperclip, X } from 'lucide-react';
import { urlFichier } from '../api.js';
import { taille } from '../utils/format.js';

export function ListeFichiers({ fichiers, onRetirer, vide = null }) {
  if (!fichiers || !fichiers.length) return vide;
  return (
    <div>
      {fichiers.map((f) => (
        <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
          <a className="pj" href={urlFichier(f.id)} target="_blank" rel="noreferrer" title={`${f.nom_original} (${taille(f.taille)})`}>
            <Paperclip size={14} aria-hidden="true" />
            {f.nom_original}
          </a>
          {onRetirer && (
            <button type="button" className="btn btn--fantome btn--icone btn--petit" style={{ marginTop: 8 }} onClick={() => onRetirer(f)} aria-label={`Retirer ${f.nom_original}`}>
              <X size={14} />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

export function SelecteurFichiers({
  id,
  fichiers,
  onChange,
  label = 'Joindre des fichiers',
  aide = 'PDF, images ou documents (10 Mo maximum par fichier, 5 fichiers).',
  accept = '.pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.odt,.txt,.xls,.xlsx,.ppt,.pptx',
  multiple = true,
  compact = false,
}) {
  const choix = (
    <div className="groupe-btn">
      <input
        id={id}
        type="file"
        className="visuellement-cache fichier-cache"
        multiple={multiple}
        accept={accept}
        onChange={(e) => {
          onChange([...e.target.files].slice(0, multiple ? 5 : 1));
          e.target.value = '';
        }}
      />
      <label htmlFor={id} className="btn btn--secondaire btn--petit" style={{ cursor: 'pointer' }}>
        <Paperclip size={15} aria-hidden="true" />
        {fichiers.length ? (multiple ? 'Changer les fichiers' : 'Changer de fichier') : multiple ? 'Choisir des fichiers' : 'Choisir un fichier'}
      </label>
      <span className="petit muet">
        {fichiers.length ? fichiers.map((f) => `${f.name} (${taille(f.size)})`).join(', ') : multiple ? 'Aucun fichier choisi' : 'Aucun fichier choisi'}
      </span>
    </div>
  );
  if (compact) return choix;
  return (
    <div className="depot">
      <span className="gras petit">{label}</span>
      {choix}
      {aide && <span className="champ__aide">{aide}</span>}
    </div>
  );
}
