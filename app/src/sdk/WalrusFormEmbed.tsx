export interface WalrusFormEmbedProps {
  formId: string;
  origin?: string;
  title?: string;
  className?: string;
}

export function WalrusFormEmbed({
  formId,
  origin = "https://forms.wal.app",
  title = "Walrus form",
  className,
}: WalrusFormEmbedProps) {
  const src = `${origin.replace(/\/$/, "")}/f/${encodeURIComponent(formId)}`;
  return (
    <iframe
      src={src}
      title={title}
      className={className}
      style={{ width: "100%", minHeight: 720, border: 0, borderRadius: 12 }}
      allow="clipboard-write"
    />
  );
}
