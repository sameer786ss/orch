import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import * as api from "../../../lib/api";
import { useArtifactsStore } from "../../../lib/artifacts";
import { useWorkspaceStore } from "../../../lib/workspace";

export const ROOT = "";

export interface TreeRow {
  entry: api.TreeEntry;
  depth: number;
  parent: string;
}

interface TreeCache {
  workspacePath: string;
  treeVersion: number;
  listings: Record<string, api.DirListing>;
  expanded: ReadonlySet<string>;
}

let treeCache: TreeCache | null = null;

function without(set: ReadonlySet<string>, ...paths: string[]): Set<string> {
  const next = new Set(set);
  paths.forEach((p) => next.delete(p));
  return next;
}

export function useFileTree() {
  const treeVersion = useArtifactsStore((s) => s.treeVersion);
  const workspacePath = useWorkspaceStore((s) => s.current?.path ?? "");
  const initialHit =
    treeCache && treeCache.workspacePath === workspacePath && treeCache.treeVersion === treeVersion
      ? treeCache
      : null;

  const [listings, setListings] = useState<Record<string, api.DirListing>>(() => initialHit?.listings ?? {});
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => initialHit?.expanded ?? new Set());
  const [error, setError] = useState<string | null>(null);

  const listingsRef = useRef(listings);
  const expandedRef = useRef(expanded);
  listingsRef.current = listings;
  expandedRef.current = expanded;
  const reqSeqRef = useRef(0);
  const firstRun = useRef(true);

  const refresh = useCallback(async () => {
    if (!workspacePath) {
      setListings({});
      setExpanded(new Set());
      setError(null);
      treeCache = null;
      return;
    }
    const seq = ++reqSeqRef.current;
    const paths = [ROOT, ...expandedRef.current];
    const results = await Promise.allSettled(paths.map((path) => api.listWorkspaceDir(path)));
    if (seq !== reqSeqRef.current) return;

    const next: Record<string, api.DirListing> = {};
    const gone: string[] = [];
    let rootError: string | null = null;
    results.forEach((result, i) => {
      if (result.status === "fulfilled") next[paths[i]] = result.value;
      else if (paths[i] === ROOT) rootError = api.errorMessage(result.reason);
      else gone.push(paths[i]);
    });

    const nextExpanded = gone.length ? without(expandedRef.current, ...gone) : expandedRef.current;
    setListings(next);
    setError(rootError);
    if (gone.length) setExpanded(nextExpanded);
    if (!rootError) {
      treeCache = { workspacePath, treeVersion, listings: next, expanded: nextExpanded };
    }
  }, [workspacePath, treeVersion]);

  const refreshSoon = useDebouncedCallback(refresh, 300);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      if (initialHit) return;
      void refresh();
      return;
    }
    if (treeCache && treeCache.workspacePath !== workspacePath) {
      setListings({});
      setExpanded(new Set());
      void refresh();
      return;
    }
    refreshSoon();
    return () => refreshSoon.cancel();
  }, [workspacePath, treeVersion, refresh, refreshSoon, initialHit]);

  const expand = useCallback(
    async (path: string) => {
      if (expandedRef.current.has(path)) return;
      const nextExpanded = new Set(expandedRef.current).add(path);
      setExpanded(nextExpanded);
      if (listingsRef.current[path]) {
        if (treeCache && treeCache.workspacePath === workspacePath) {
          treeCache = { ...treeCache, expanded: nextExpanded };
        }
        return;
      }
      const seq = reqSeqRef.current;
      try {
        const listing = await api.listWorkspaceDir(path);
        if (seq !== reqSeqRef.current) return;
        setListings((prev) => {
          const nextListings = { ...prev, [path]: listing };
          if (workspacePath) {
            treeCache = { workspacePath, treeVersion, listings: nextListings, expanded: expandedRef.current };
          }
          return nextListings;
        });
      } catch (e) {
        if (seq !== reqSeqRef.current) return;
        setExpanded((prev) => without(prev, path));
        setError(api.errorMessage(e));
      }
    },
    [workspacePath, treeVersion]
  );

  const collapse = useCallback(
    (path: string) => {
      setExpanded((prev) => {
        const next = without(prev, path);
        if (treeCache && treeCache.workspacePath === workspacePath) {
          treeCache = { ...treeCache, expanded: next };
        }
        return next;
      });
    },
    [workspacePath]
  );

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
