import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { open } from "@tauri-apps/plugin-dialog";
import { getBasename } from "./utils";
import { clearImageCache } from "./images";
import {
  getUserPref,
  setUserPref,
  errorMessage,
  newId,
  setWorkspace,
  createLocalWorkspace,
  activateCloudProject,
  listCloudProjects,
  openCloudProject,
  createCloudProject,
  deleteCloudProject,
  deleteLocalWorkspace,
  type CloudProjectDto,
} from "./api";

export type WorkspaceMode = "computer" | "cloud";

export interface LocalWorkspaceMeta {
  kind: "computer";
  id: string;
  name: string;
  path: string;
  createdAt: number;
}

export interface CloudWorkspaceMeta {
  kind: "cloud";
  id: string;
  name: string;
  path: string;
  createdAt: number;
  project: CloudProjectDto;
}

export type WorkspaceMeta = LocalWorkspaceMeta | CloudWorkspaceMeta;

export function workspaceMode(meta: WorkspaceMeta): WorkspaceMode {
  return meta.kind;
}

type WorkspacePickStatus =
  | "idle"
  | "loading"
  | "needs_pick"
  | "ready"
  | "error";

interface WorkspaceState {
  current: WorkspaceMeta | null;
  all: WorkspaceMeta[];
  mode: WorkspaceMode;
  status: WorkspacePickStatus;
  busy: boolean;
  error: string | null;
}

interface WorkspaceActions {
  initialize: () => Promise<void>;
  pickAndOpen: () => Promise<boolean>;
  createLocalFolder: (parentDir: string, folderName: string, initGit: boolean) => Promise<boolean>;
  openCloudRepo: (repoUrl: string, accountId: string) => Promise<boolean>;
  createCloudRepo: (accountId: string, name: string, description: string | null, privateRepo: boolean) => Promise<boolean>;
  switchTo: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  syncCloudProjects: () => Promise<void>;
  dismissError: () => void;
  reset: () => void;
}

type WorkspaceStore = WorkspaceState & WorkspaceActions;

const PREF_LAST_WORKSPACE = "lastWorkspaceId";
const PREF_LOCAL_WORKSPACES = "localWorkspaces";

const INITIAL_STATE: WorkspaceState = {
  current: null,
  all: [],
  mode: "computer",
  status: "idle",
  busy: false,
  error: null,
};

function fromCloudDto(dto: CloudProjectDto): CloudWorkspaceMeta {
  return {
    kind: "cloud",
    id: dto.id,
    name: dto.name,
    path: dto.workspace,
    createdAt: dto.updatedAt,
    project: dto,
  };
}

function parseLocalList(raw: string | null): LocalWorkspaceMeta[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: LocalWorkspaceMeta[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== "string" || typeof rec.name !== "string" || typeof rec.path !== "string") continue;
    out.push({
      kind: "computer",
      id: rec.id,
      name: rec.name,
      path: rec.path,
      createdAt: Number(rec.createdAt) || 0,
    });
  }
  return out;
}

async function loadLocal(): Promise<LocalWorkspaceMeta[]> {
  const scoped = await getUserPref(PREF_LOCAL_WORKSPACES, true);
  return parseLocalList(scoped);
}

async function saveLocal(list: WorkspaceMeta[]): Promise<void> {
  const localOnly = list.filter((w): w is LocalWorkspaceMeta => w.kind === "computer");
  await setUserPref(PREF_LOCAL_WORKSPACES, JSON.stringify(localOnly), true);
}

async function loadLastId(): Promise<string | null> {
  return (await getUserPref(PREF_LAST_WORKSPACE, true)) ?? null;
}

async function saveLastId(id: string): Promise<void> {
  await setUserPref(PREF_LAST_WORKSPACE, id, true);
}

async function activateWorkspace(meta: WorkspaceMeta): Promise<WorkspaceMeta> {
  if (meta.kind === "cloud") {
    await activateCloudProject(meta.project);
    return meta;
  }
  const canonical = await setWorkspace(meta.path);
  return canonical === meta.path ? meta : { ...meta, path: canonical };
}

function mergeAll(localList: LocalWorkspaceMeta[], cloudList: CloudWorkspaceMeta[]): WorkspaceMeta[] {
  const map = new Map<string, WorkspaceMeta>();
  for (const w of cloudList) map.set(w.path, w);
  for (const w of localList) map.set(w.path, w);
  return Array.from(map.values());
}

function upsert(list: WorkspaceMeta[], meta: WorkspaceMeta): WorkspaceMeta[] {
  const index = list.findIndex((w) => w.id === meta.id || w.path === meta.path);
  if (index === -1) return [meta, ...list];
  const next = [...list];
  next[index] = meta;
  return next;
}

function failureStatus(current: WorkspaceMeta | null): WorkspacePickStatus {
  return current ? "ready" : "error";
}

export const useWorkspaceStore = create(
  immer<WorkspaceStore>((set, get) => {
    let inProgress = false;
    let initializeEpoch = 0;

    const exclusive = async <T,>(task: () => Promise<T>): Promise<T | undefined> => {
      if (inProgress || get().busy) return undefined;
      inProgress = true;
      set((s) => {
        s.busy = true;
      });
      try {
        return await task();
      } catch (e) {
        set((s) => {
          s.error = errorMessage(e);
          s.status = failureStatus(s.current);
        });
        return undefined;
      } finally {
        inProgress = false;
        set((s) => {
          s.busy = false;
        });
      }
    };

    const commit = async (meta: WorkspaceMeta, list: WorkspaceMeta[]) => {
      await saveLocal(list);
      await saveLastId(meta.id);
      set((s) => {
        s.all = list;
        s.current = meta;
        s.mode = workspaceMode(meta);
        s.status = "ready";
        s.error = null;
      });
      clearImageCache();
    };

    return {
      ...INITIAL_STATE,

      initialize: async () => {
        const epoch = ++initializeEpoch;
        set((s) => {
          s.status = "loading";
          s.error = null;
        });

        const [localSettled, cloudSettled, lastSettled] = await Promise.allSettled([
          loadLocal(),
          listCloudProjects(),
          loadLastId(),
        ]);
        if (epoch !== initializeEpoch) return;

        if (localSettled.status === "rejected") {
          set((s) => {
            s.status = "error";
            s.error = `Could not load saved local projects: ${errorMessage(localSettled.reason)}`;
          });
          return;
        }

        const localList = localSettled.value;
        const cloudError = cloudSettled.status === "rejected" ? errorMessage(cloudSettled.reason) : null;
        const cloudList = cloudSettled.status === "fulfilled" ? cloudSettled.value.map(fromCloudDto) : [];
        const lastId = lastSettled.status === "fulfilled" ? lastSettled.value : null;

        const all = mergeAll(localList, cloudList);
        set((s) => {
          s.all = all;
        });

        if (all.length === 0) {
          set((s) => {
            s.status = cloudError ? "error" : "needs_pick";
            s.error = cloudError ? `Could not load cloud projects: ${cloudError}` : null;
          });
          return;
        }

        const last = all.find((w) => w.id === lastId) ?? all[0];

        try {
          const active = await activateWorkspace(last);
          if (epoch !== initializeEpoch) return;
          const next = upsert(all, active);
          if (active !== last) {
            await saveLocal(next);
            if (epoch !== initializeEpoch) return;
          }
          set((s) => {
            s.all = next;
            s.current = active;
            s.mode = workspaceMode(active);
            s.status = "ready";
            s.error = cloudError ? `Cloud projects unavailable: ${cloudError}` : null;
          });
          clearImageCache();
        } catch (e) {
          if (epoch !== initializeEpoch) return;
          set((s) => {
            s.status = "needs_pick";
            s.error = `Last workspace "${last.name}" could not be opened: ${errorMessage(e)}`;
          });
        }
      },

      pickAndOpen: async () => {
        const result = await exclusive(async () => {
          const selected = await open({ directory: true, multiple: false });
          if (typeof selected !== "string") return false;
          const canonical = await setWorkspace(selected);
          const name = getBasename(canonical) || canonical;
          const existing = get().all.find((w) => w.path === canonical);
          const meta: LocalWorkspaceMeta = {
            kind: "computer",
            id: existing?.id ?? newId(),
            name,
            path: canonical,
            createdAt: existing?.createdAt ?? Date.now(),
          };
          await commit(meta, upsert(get().all, meta));
          return true;
        });
        return Boolean(result);
      },

      createLocalFolder: async (parentDir: string, folderName: string, initGit: boolean) => {
        const result = await exclusive(async () => {
          const canonical = await createLocalWorkspace(parentDir, folderName, initGit);
          const meta: LocalWorkspaceMeta = {
            kind: "computer",
            id: newId(),
            name: getBasename(canonical) || canonical,
            path: canonical,
            createdAt: Date.now(),
          };
          await commit(meta, upsert(get().all, meta));
          return true;
        });
        return Boolean(result);
      },

      openCloudRepo: async (repoUrl: string, accountId: string) => {
        const result = await exclusive(async () => {
          const trimmed = repoUrl.trim();
          if (!trimmed) return false;
          const dto = await openCloudProject(trimmed, accountId);
          const meta = fromCloudDto(dto);
          await commit(meta, upsert(get().all, meta));
          return true;
        });
        return Boolean(result);
      },

      createCloudRepo: async (
        accountId: string,
        name: string,
        description: string | null,
        privateRepo: boolean
      ) => {
        const result = await exclusive(async () => {
          const dto = await createCloudProject(accountId, name.trim(), description, privateRepo);
          const meta = fromCloudDto(dto);
          await commit(meta, upsert(get().all, meta));
          return true;
        });
        return Boolean(result);
      },

      switchTo: async (id: string) => {
        await exclusive(async () => {
          const meta = get().all.find((w) => w.id === id);
          if (!meta) return;
          const active = await activateWorkspace(meta);
          await commit(active, upsert(get().all, active));
        });
      },

      remove: async (id: string) => {
        await exclusive(async () => {
          const target = get().all.find((w) => w.id === id);
          if (!target) return;
          if (target.kind === "cloud") {
            await deleteCloudProject(target.id, target.path);
          } else {
            await deleteLocalWorkspace(target.path);
          }
          const next = get().all.filter((w) => w.id !== id);
          await saveLocal(next);
          const wasCurrent = get().current?.id === id;
          if (wasCurrent) {
            if (next.length > 0) {
              const active = await activateWorkspace(next[0]);
              await saveLastId(active.id);
              set((s) => {
                s.all = next;
                s.current = active;
                s.mode = workspaceMode(active);
                s.status = "ready";
                s.error = null;
              });
            } else {
              await setUserPref(PREF_LAST_WORKSPACE, "", true);
              set((s) => {
                s.all = next;
                s.current = null;
                s.status = "needs_pick";
                s.error = null;
              });
            }
            clearImageCache();
          } else {
            set((s) => {
              s.all = next;
              s.error = null;
            });
          }
        });
      },

      syncCloudProjects: async () => {
        if (get().status !== "ready") return;
        const cloudDtos = await listCloudProjects();
        if (get().status !== "ready") return;
        const cloudList = cloudDtos.map(fromCloudDto);
        let removedCurrent = false;
        set((s) => {
          const localList = s.all.filter((w): w is LocalWorkspaceMeta => w.kind === "computer");
          const merged = mergeAll(localList, cloudList);
          s.all = merged;
          if (s.current?.kind === "cloud") {
            const refreshedCurrent = cloudList.find((w) => w.id === s.current?.id || w.path === s.current?.path);
            if (refreshedCurrent) {
              s.current = refreshedCurrent;
            } else {
              s.current = null;
              s.status = "needs_pick";
              removedCurrent = true;
            }
          }
        });
        if (removedCurrent) {
          clearImageCache();
          void setUserPref(PREF_LAST_WORKSPACE, "", true).catch(() => undefined);
        }
      },

      dismissError: () => {
        set((s) => {
          s.error = null;
        });
      },

      reset: () => {
        initializeEpoch += 1;
        set((s) => {
          Object.assign(s, INITIAL_STATE);
        });
      },
    };
  })
);
