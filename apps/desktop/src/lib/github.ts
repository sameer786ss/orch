import { openUrl } from "@tauri-apps/plugin-opener";
import { create } from "zustand";
import * as api from "./api";
import type { GithubAccountDto } from "./api";
import { useWorkspaceStore } from "./workspace";

interface GithubState {
  account: GithubAccountDto | null;
  loaded: boolean;
  connecting: boolean;
  disconnecting: boolean;
  error: string | null;
}

interface GithubActions {
  refresh: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  finishConnect: (error?: string | null) => Promise<void>;
  cancelConnect: () => void;
  clearError: () => void;
  reset: () => void;
}

let refreshSeq = 0;
let stopFocusListener: (() => void) | null = null;
let preConnectUpdatedAt: number | null = null;

function detachFocusListener() {
  stopFocusListener?.();
  stopFocusListener = null;
  preConnectUpdatedAt = null;
}

export const useGithubStore = create<GithubState & GithubActions>()((set, get) => ({
  account: null,
  loaded: false,
  connecting: false,
  disconnecting: false,
  error: null,

  refresh: async () => {
    const seq = ++refreshSeq;
    try {
      const account = await api.getGithubAccount();
      if (seq !== refreshSeq) return;
      const connectedNewAccount =
        preConnectUpdatedAt !== null && account !== null && account.updatedAt !== preConnectUpdatedAt;
      if (connectedNewAccount) {
        detachFocusListener();
        set({ account, loaded: true, connecting: false });
      } else {
        set({ account, loaded: true });
      }
    } catch (e) {
      if (seq !== refreshSeq) return;
      set({ loaded: true, error: api.errorMessage(e) });
    }
  },

  connect: async () => {
    if (get().connecting) return;
    set({ connecting: true, error: null });
    detachFocusListener();
    preConnectUpdatedAt = get().account?.updatedAt ?? 0;
    const onFocus = () => {
      void get().refresh();
    };
    window.addEventListener("focus", onFocus);
    stopFocusListener = () => window.removeEventListener("focus", onFocus);
    try {
      const url = await api.getGithubConnectUrl();
      await openUrl(url);
    } catch (e) {
      detachFocusListener();
      set({ connecting: false, error: api.errorMessage(e) });
    }
  },

  disconnect: async () => {
    if (get().disconnecting) return;
    set({ disconnecting: true, error: null });
    try {
      await api.disconnectGithubAccount();
      set({ disconnecting: false });
      await Promise.all([
        get().refresh(),
        useWorkspaceStore.getState().syncCloudProjects().catch(() => undefined),
      ]);
    } catch (e) {
      set({ disconnecting: false, error: api.errorMessage(e) });
    }
  },

  finishConnect: async (error?: string | null) => {
    detachFocusListener();
    set({ connecting: false, error: error || null });
    await Promise.all([
      get().refresh(),
      useWorkspaceStore.getState().syncCloudProjects().catch(() => undefined),
    ]);
  },

  cancelConnect: () => {
    detachFocusListener();
    set({ connecting: false });
  },

  clearError: () => set({ error: null }),

  reset: () => {
    detachFocusListener();
    refreshSeq += 1;
    set({
      account: null,
      loaded: false,
      connecting: false,
      disconnecting: false,
      error: null,
    });
  },
}));
