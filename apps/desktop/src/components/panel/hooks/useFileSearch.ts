import { useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import * as api from "../../../lib/api";

const SEARCH_LIMIT = 200;

export function useFileSearch(query: string) {
  const text = query.trim();
  const [hits, setHits] = useState<api.FileEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const run = useDebouncedCallback(async (value: string) => {
    const id = ++requestRef.current;
    try {
      const result = await api.listWorkspaceFiles(value, SEARCH_LIMIT);
      if (id !== requestRef.current) return;
      setHits(result);
      setError(null);
    } catch (e) {
      if (id !== requestRef.current) return;
      setHits([]);
      setError(api.errorMessage(e));
    } finally {
      if (id === requestRef.current) setSearching(false);
    }
  }, 120);

  useEffect(() => {
    if (!text) {
      run.cancel();
      requestRef.current += 1;
      setHits([]);
      setSearching(false);
      setError(null);
      return;
    }
    setSearching(true);
    void run(text);
    return () => run.cancel();
  }, [text, run]);

  return { active: text !== "", hits, searching, error };
}
