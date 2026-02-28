import { useEffect, useState } from 'react';
import { getCustomerOptions, getDistinctOptions } from '@/data/queries';

export type FilterOption = { value: string; label: string };

export function useCustomerOptions(search: string, limit = 150) {
  const [options, setOptions] = useState<FilterOption[]>([]);

  useEffect(() => {
    let active = true;
    getCustomerOptions(search, limit).then((rows) => {
      if (!active) return;
      setOptions(rows.map((row) => ({ value: row.value, label: row.label })));
    }).catch(() => {
      if (!active) return;
      setOptions([]);
    });
    return () => { active = false; };
  }, [search, limit]);

  return options;
}

export function useDistinctFilterOptions(column: string, search: string, limit = 150) {
  const [options, setOptions] = useState<FilterOption[]>([]);

  useEffect(() => {
    let active = true;
    getDistinctOptions(column, search, limit).then((rows) => {
      if (!active) return;
      setOptions(rows.map((row) => ({ value: row.value, label: row.value })));
    }).catch(() => {
      if (!active) return;
      setOptions([]);
    });
    return () => { active = false; };
  }, [column, search, limit]);

  return options;
}
