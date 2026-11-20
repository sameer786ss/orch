import { useEffect } from "react";
import { useChatStore } from "./store";
import { useWorkspaceStore } from "./workspace";

const MIN_GAP_MS = 15_000;

export function useCrossDeviceSync() {
  useEffect(() => {
    let last = 0;
    const refresh = () => {
      const now = Date.now();
      if (now - last < MIN_GAP_MS) return;
      last = now;
      const workspace = useWorkspaceStore.getState();
      void workspace.syncCloudProjects();
      if (workspace.mode === "cloud") void useChatStore.getState().refreshSessions();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
}
