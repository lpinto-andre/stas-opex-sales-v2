import { useState } from 'react';

type Props = {
  previewText: string;
  fullText?: string;
  moreLabel?: string;
  lessLabel?: string;
};

export function ExpandableText({ previewText, fullText, moreLabel = 'More', lessLabel = 'Less' }: Props) {
  const [expanded, setExpanded] = useState(false);
  const fullValue = fullText && fullText.trim() ? fullText : previewText;
  const canExpand = fullValue.length > previewText.length;
  const displayValue = expanded && canExpand ? fullValue : previewText;

  return <div className="group flex items-start gap-2">
    <span className="min-w-0 flex-1 break-words">{displayValue}</span>
    {canExpand && <button
      type="button"
      className="card shrink-0 px-2 py-0.5 text-[10px] opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto"
      onClick={() => setExpanded((value) => !value)}
    >
      {expanded ? lessLabel : moreLabel}
    </button>}
  </div>;
}
