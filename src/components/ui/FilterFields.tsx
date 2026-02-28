import { MultiPickFilter } from '@/components/ui/MultiPickFilter';

type Option = { value: string; label: string };

type FilterSearchInputProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
};

type SearchMultiPickFilterProps = {
  searchValue: string;
  onSearchChange: (next: string) => void;
  searchPlaceholder: string;
  label: string;
  options: Option[];
  values: string[];
  onChange: (next: string[]) => void;
  heightClass?: string;
  emptyLabel?: string;
};

export function FilterSearchInput({ value, onChange, placeholder }: FilterSearchInputProps) {
  return <input
    value={value}
    onChange={(event) => onChange(event.target.value)}
    placeholder={placeholder}
    className="card w-full px-2 py-1 text-xs"
  />;
}

export function SearchMultiPickFilter({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  label,
  options,
  values,
  onChange,
  heightClass,
  emptyLabel
}: SearchMultiPickFilterProps) {
  return <div className="space-y-2">
    <FilterSearchInput value={searchValue} onChange={onSearchChange} placeholder={searchPlaceholder} />
    <MultiPickFilter
      label={label}
      options={options}
      values={values}
      onChange={onChange}
      heightClass={heightClass}
      emptyLabel={emptyLabel}
    />
  </div>;
}
