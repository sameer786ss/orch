import { create } from "zustand";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import * as api from "./api";
import { IS_MAC } from "./utils";

const RELEASES_LATEST_URL = "https://github.com/sameer786ss/orch/releases/latest";

function parseSemver(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, "")
    .split("-")[0]
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}

function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseSemver(candidate);
  const b = parseSemver(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av > bv;
  }
  return false;
}

type UpdateStatus =
  | "idle"
  | "checking"
  | "none"
  | "manualAvailable"
  | "downloading"
  | "readyToRestart"
  | "installing"
  | "failed";

interface UpdaterState {
  status: UpdateStatus;
  version: string;
  percent: number;
  error: string | null;
  pendingUpdate: Update | null;
}

interface UpdaterActions {
  start: () => Promise<void>;
  apply: () => Promise<void>;
}

type UpdaterStore = UpdaterState & UpdaterActions;

export const useUpdaterStore = create<UpdaterStore>((set, get) => ({
  status: "idle",
  version: "",
  percent: 0,
  error: null,
  pendingUpdate: null,

  start: async () => {
    const currentStatus = get().status;
    if (currentStatus === "checking" || currentStatus === "downloading" || currentStatus === "installing") {
      return;
    }
    set({ status: "checking", error: null, percent: 0, pendingUpdate: null });

    if (IS_MAC) {
      try {
        const [currentVersion, latest] = await Promise.all([getVersion(), api.checkLatestRelease()]);
        const cleanVersion = latest.version.trim().replace(/^v/i, "");
        if (cleanVersion && isNewerVersion(cleanVersion, currentVersion)) {
          set({ status: "manualAvailable", version: cleanVersion });
        } else {
          set({ status: "none" });
        }
      } catch (e) {
        set({ status: "failed", error: api.errorMessage(e) });
      }
      return;
    }

    let update: Update | null = null;
    try {
      update = await check();
    } catch (e) {
      set({ status: "failed", error: api.errorMessage(e), pendingUpdate: null });
      return;
    }

    if (!update?.available) {
      set({ status: "none", pendingUpdate: null });
      return;
    }

    set({ status: "downloading", version: update.version, percent: 0, pendingUpdate: update });

    let contentLength = 0;
    let received = 0;
    try {
      await update.download((event) => {
        if (event.event === "Started") {
          contentLength = event.data.contentLength ?? 0;
          received = 0;
          set({ percent: 0 });
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          if (contentLength > 0) {
            const nextPercent = Math.min(99, Math.round((received / contentLength) * 100));
            if (nextPercent !== get().percent) {
              set({ percent: nextPercent });
            }
          }
        } else if (event.event === "Finished") {
          set({ percent: 100 });
        }
      });
      set({ status: "readyToRestart" });
    } catch (e) {
      set({ status: "failed", error: api.errorMessage(e), pendingUpdate: null });
    }
  },

  apply: async () => {
    const { status, pendingUpdate } = get();
    if (status === "manualAvailable") {
      try {
        await openUrl(RELEASES_LATEST_URL);
      } catch (e) {
        set({ error: api.errorMessage(e) });
      }
      return;
    }
    if (status !== "readyToRestart" || !pendingUpdate) return;
    set({ status: "installing", error: null });
    try {
      await pendingUpdate.install();
      await relaunch();
    } catch (e) {
      set({ status: "readyToRestart", error: api.errorMessage(e) });
    }
  },
}));
