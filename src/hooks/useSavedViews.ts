import { useCallback, useEffect, useMemo, useState } from 'react';

export type NamedSavedView<T> = {
  name: string;
  snapshot: T;
};

type Options<T> = {
  storageKey: string;
  currentSnapshot: T;
  initialCollapsed?: boolean;
  isSameSnapshot?: (left: T, right: T) => boolean;
};

const defaultCompare = <T,>(left: T, right: T) => JSON.stringify(left) === JSON.stringify(right);

export function useSavedViews<T>({
  storageKey,
  currentSnapshot,
  initialCollapsed = true,
  isSameSnapshot
}: Options<T>) {
  const [saveName, setSaveName] = useState('');
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [savedViews, setSavedViews] = useState<NamedSavedView<T>[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem(storageKey) ?? '[]') as NamedSavedView<T>[];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(savedViews));
  }, [savedViews, storageKey]);

  const compare = isSameSnapshot ?? defaultCompare<T>;
  const activeViewName = useMemo(
    () => savedViews.find((view) => compare(view.snapshot, currentSnapshot))?.name ?? null,
    [compare, currentSnapshot, savedViews]
  );

  const saveCurrentView = useCallback(() => {
    const nextName = saveName.trim();
    if (!nextName) return false;
    setSavedViews((previous) => [...previous.filter((view) => view.name !== nextName), { name: nextName, snapshot: currentSnapshot }]
      .sort((left, right) => left.name.localeCompare(right.name)));
    setSaveName('');
    return true;
  }, [currentSnapshot, saveName]);

  const deleteSavedView = useCallback((name: string) => {
    setSavedViews((previous) => previous.filter((view) => view.name !== name));
  }, []);

  return {
    activeViewName,
    collapsed,
    deleteSavedView,
    saveCurrentView,
    saveName,
    savedViews,
    setCollapsed,
    setSaveName
  };
}
