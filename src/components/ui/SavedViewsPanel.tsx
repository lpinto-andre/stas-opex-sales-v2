type SavedViewItem = {
  name: string;
  summary: string;
  active?: boolean;
};

type Props = {
  title?: string;
  description?: string;
  saveName: string;
  onSaveNameChange: (next: string) => void;
  onSave: () => void;
  savePlaceholder?: string;
  saveHint?: string;
  saveButtonLabel?: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  items: SavedViewItem[];
  onApply: (name: string) => void;
  onDelete: (name: string) => void;
  collapsedSummary?: string;
  emptyMessage?: string;
  slowHint?: string;
};

export function SavedViewsPanel({
  title = 'Saved Views',
  description = 'Save the current filters, then apply or delete them whenever needed.',
  saveName,
  onSaveNameChange,
  onSave,
  savePlaceholder = 'Name this saved view',
  saveHint = 'Using an existing name overwrites that saved view.',
  saveButtonLabel = 'Save current view',
  collapsed,
  onToggleCollapsed,
  items,
  onApply,
  onDelete,
  collapsedSummary,
  emptyMessage = 'No saved views yet. Save one after setting your filters.',
  slowHint
}: Props) {
  const collapsedText = collapsedSummary ?? `${items.length} saved view${items.length === 1 ? '' : 's'}. Expand to manage them.`;

  return <section className="card p-3 mb-3">
    <div
      role="button"
      tabIndex={0}
      aria-expanded={!collapsed}
      className="flex items-start justify-between gap-3 mb-3 cursor-pointer"
      onClick={onToggleCollapsed}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggleCollapsed();
        }
      }}
    >
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-[var(--text-muted)] mt-1">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        {!!slowHint && <span className="text-xs text-amber-300">{slowHint}</span>}
        <button className="card px-3 py-1.5 text-xs" onClick={(event) => { event.stopPropagation(); onToggleCollapsed(); }}>
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>
    </div>
    {collapsed
      ? <div
        role="button"
        tabIndex={0}
        className="text-xs text-[var(--text-muted)] cursor-pointer"
        onClick={onToggleCollapsed}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggleCollapsed();
          }
        }}
      >{collapsedText}</div>
      : <div className="grid xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] gap-4">
        <div className="card p-3 bg-[var(--surface)]/35">
          <label className="text-xs text-[var(--text-muted)] block">
            Preset name
            <input
              value={saveName}
              onChange={(event) => onSaveNameChange(event.target.value)}
              className="card w-full px-2 py-2 mt-1"
              placeholder={savePlaceholder}
            />
          </label>
          <p className="text-xs text-[var(--text-muted)] mt-2">{saveHint}</p>
          <button className="card px-3 py-2 mt-3 w-full font-medium" onClick={onSave}>
            {saveButtonLabel}
          </button>
        </div>
        <div className="space-y-2">
          {!items.length && <div className="card p-4 text-sm text-[var(--text-muted)]">{emptyMessage}</div>}
          {items.map((item) => <div
            key={item.name}
            role="button"
            tabIndex={0}
            className={`card p-3 cursor-pointer transition-colors ${
              item.active
                ? 'border-[var(--teal)] bg-[var(--surface)]/45 ring-1 ring-[var(--teal)]/40'
                : 'bg-[var(--surface)]/20 hover:bg-[var(--surface)]/35'
            }`}
            onClick={() => onApply(item.name)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onApply(item.name);
              }
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{item.name}</div>
                <div className="text-xs text-[var(--text-muted)] mt-1 break-words">{item.summary}</div>
                {item.active && <div className="text-[11px] text-[var(--teal)] mt-2 font-medium">Active view</div>}
              </div>
              <div className="flex items-center gap-2">
                <button className="card px-3 py-1.5 text-xs" onClick={(event) => { event.stopPropagation(); onApply(item.name); }}>
                  Apply
                </button>
                <button className="card px-3 py-1.5 text-xs border-red-400/40 text-red-300" onClick={(event) => { event.stopPropagation(); onDelete(item.name); }}>
                  Delete
                </button>
              </div>
            </div>
          </div>)}
        </div>
      </div>}
  </section>;
}
