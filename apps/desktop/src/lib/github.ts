import { openUrl } from "@tauri-apps/plugin-opener";
import { create } from "zustand";
import * as api from "./api";
import type { GithubAccountDto } from "./api";
import { useWorkspaceStore } from "./workspace";

interface GithubState {
  accounts: GithubAccountDto[];
  loaded: boolean;
  connecting: boolean;
  disconnectingId: string | null;
  error: string | null;
}

interface GithubActions {
  refresh: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: (accountId: string) => Promise<void>;
  finishConnect: (error?: string | null) => Promise<void>;
  cancelConnect: () => void;
  clearError: () => void;
  reset: () => void;
}

let refreshSeq = 0;
let stopFocusListener: (() => void) | null = null;

function detachFocusListener() {
  stopFocusListener?.();
  stopFocusListener = null;
}

export const useGithubStore = create<GithubState & GithubActions>()((set, get) => ({
  accounts: [],
  loaded: false,
  connecting: false,
  disconnectingId: null,
  error: null,

  refresh: async () => {
    const seq = ++refreshSeq;
    try {
      const accounts = await api.listGithubAccounts();
      if (seq !== refreshSeq) return;
      detachFocusListener();
      set({ accounts, loaded: true, connecting: false });
    } catch (e) {
      if (seq !== refreshSeq) return;
      set({ loaded: true, error: api.errorMessage(e) });
    }
  },

  connect: async () => {
    if (get().connecting) return;
    set({ connecting: true, error: null });
    detachFocusListener();
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

  disconnect: async (accountId: string) => {
    if (get().disconnectingId) return;
    set({ disconnectingId: accountId, error: null });
    try {
      await api.disconnectGithubAccount(accountId);
      set({ disconnectingId: null });
      await Promise.all([
        get().refresh(),
        useWorkspaceStore.getState().syncCloudProjects().catch(() => undefined),
      ]);
    } catch (e) {
      set({ disconnectingId: null, error: api.errorMessage(e) });
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
      accounts: [],
      loaded: false,
      connecting: false,
      disconnectingId: null,
      error: null,
    });
  },
}));
