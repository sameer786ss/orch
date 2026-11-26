import { useEffect } from "react";
import { useChatStore } from "./store";
import { useGithubStore } from "./github";
import { useWorkspaceStore } from "./workspace";

const MIN_GAP_MS = 120_000;

export function useCrossDeviceSync() {
  useEffect(() => {
    let last = 0;
    const refresh = () => {
      const now = Date.now();
      if (now - last < MIN_GAP_MS) return;
      last = now;
      const workspace = useWorkspaceStore.getState();
      void useGithubStore.getState().refresh().catch(() => undefined);
      void workspace.syncCloudProjects().catch(() => undefined);
      if (workspace.mode === "cloud") void useChatStore.getState().refreshSessions();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
}
