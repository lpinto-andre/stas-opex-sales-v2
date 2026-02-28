type Option = { value: string; label: string };

type Props = {
  label: string;
  options: Option[];
  values: string[];
  onChange: (next: string[]) => void;
  heightClass?: string;
  emptyLabel?: string;
};

export function MultiPickFilter({
  label,
  options,
  values,
  onChange,
  heightClass = 'h-28',
  emptyLabel
}: Props) {
  const toggle = (value: string) => onChange(values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]);

  return <div className="text-xs text-[var(--text-muted)]">
    <div className="mb-1">{label}</div>
    <div className={`card ${heightClass} overflow-auto p-2 space-y-1`}>
      {options.map((option) => <label key={option.value} className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={values.includes(option.value)} onChange={() => toggle(option.value)} />
        <span className="text-xs truncate">{option.label}</span>
      </label>)}
      {options.length === 0 && emptyLabel ? <div className="text-[var(--text-muted)]">{emptyLabel}</div> : null}
    </div>
  </div>;
}
