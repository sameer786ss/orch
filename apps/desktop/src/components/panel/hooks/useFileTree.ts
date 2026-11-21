import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import * as api from "../../../lib/api";
import { useArtifactsStore } from "../../../lib/artifacts";

export const ROOT = "";

export interface TreeRow {
  entry: api.TreeEntry;
  depth: number;
  parent: string;
}

function without(set: ReadonlySet<string>, ...paths: string[]): Set<string> {
  const next = new Set(set);
  paths.forEach((p) => next.delete(p));
  return next;
}

export function useFileTree() {
  const treeVersion = useArtifactsStore((s) => s.treeVersion);
  const [listings, setListings] = useState<Record<string, api.DirListing>>({});
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  const listingsRef = useRef(listings);
  const expandedRef = useRef(expanded);
  listingsRef.current = listings;
  expandedRef.current = expanded;
  const firstRun = useRef(true);

  const refresh = useCallback(async () => {
    const paths = [ROOT, ...expandedRef.current];
    const results = await Promise.allSettled(paths.map((path) => api.listWorkspaceDir(path)));
    const next: Record<string, api.DirListing> = {};
    const gone: string[] = [];
    let rootError: string | null = null;
    results.forEach((result, i) => {
      if (result.status === "fulfilled") next[paths[i]] = result.value;
      else if (paths[i] === ROOT) rootError = api.errorMessage(result.reason);
      else gone.push(paths[i]);
    });
    setListings(next);
    setError(rootError);
    if (gone.length) setExpanded((prev) => without(prev, ...gone));
  }, []);

  const refreshSoon = useDebouncedCallback(refresh, 300);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      void refresh();
      return;
    }
    refreshSoon();
    return () => refreshSoon.cancel();
  }, [treeVersion, refresh, refreshSoon]);

  const expand = useCallback(async (path: string) => {
    if (expandedRef.current.has(path)) return;
    setExpanded((prev) => new Set(prev).add(path));
    if (listingsRef.current[path]) return;
    try {
      const listing = await api.listWorkspaceDir(path);
      setListings((prev) => ({ ...prev, [path]: listing }));
    } catch (e) {
      setExpanded((prev) => without(prev, path));
      setError(api.errorMessage(e));
    }
  }, []);

  const collapse = useCallback((path: string) => {
    setExpanded((prev) => without(prev, path));
  }, []);

  const rows = useMemo(() => {
    const out: TreeRow[] = [];
    const walk = (dir: string, depth: number) => {
      for (const entry of listings[dir]?.entries ?? []) {
        out.push({ entry, depth, parent: dir });
        if (entry.isDir && expanded.has(entry.path)) walk(entry.path, depth + 1);
      }
    };
    walk(ROOT, 0);
    return out;
  }, [listings, expanded]);

  const truncated = Object.values(listings).some((l) => l.truncated);
  const loading = !listings[ROOT] && !error;

  return { rows, expanded, error, loading, truncated, expand, collapse };
}
