/**
 * Icono minimalista de archivo: hoja con la esquina doblada y una etiqueta de color con el formato.
 * La hoja usa el color del texto; la etiqueta, los tonos del sitio (coral para PDF, verde para DOCX).
 */
export function FileIcon({ kind }: { kind: "pdf" | "docx" }) {
  return (
    <svg className={`file-icon ${kind}`} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M6 2.75h8.25L19.25 7.75V20a1.25 1.25 0 0 1-1.25 1.25H6A1.25 1.25 0 0 1 4.75 20V4A1.25 1.25 0 0 1 6 2.75Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 3v4.25c0 .41.34.75.75.75H19" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <rect className="file-icon-tag" x="2" y="12" width="15" height="7.5" rx="2" />
      <text className="file-icon-label" x="9.5" y="17.65" textAnchor="middle">
        {kind === "pdf" ? "PDF" : "DOC"}
      </text>
    </svg>
  );
}
