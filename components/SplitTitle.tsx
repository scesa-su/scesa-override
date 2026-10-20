import type { ElementType } from "react";

/**
 * Renders "MAIN // SUBTITLE" as a bold main line plus a smaller, framed
 * subtitle tag instead of a raw double slash. Text without " // " renders as-is.
 */
export default function SplitTitle({
  text,
  as: Tag = "span",
  className,
  id,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  id?: string;
}) {
  const at = text.indexOf(" // ");
  if (at === -1) {
    return (
      <Tag id={id} className={className}>
        {text}
      </Tag>
    );
  }
  return (
    <Tag id={id} className={`split-title ${className ?? ""}`}>
      <span className="split-main">{text.slice(0, at)}</span>
      <span className="split-sub">
        <span aria-hidden="true">▸ </span>
        {text.slice(at + 4)}
      </span>
    </Tag>
  );
}
