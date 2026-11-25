import { useEffect, useRef, useState } from "react";
import { open as pickDirDialog } from "@tauri-apps/plugin-dialog";
import { BsGithub } from "react-icons/bs";
import { useDebouncedCallback } from "use-debounce";
import { create } from "zustand";
import { LuFolder, LuFolderOpen, LuFolderPlus, LuGlobe, LuLock, LuPlus } from "react-icons/lu";
import { errorMessage, listGithubRepos, type GithubRepoDto } from "../../lib/api";
import { useGithubStore } from "../../lib/github";
import { useWorkspaceStore } from "../../lib/workspace";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

export type ProjectDialogMode = "mode" | "local" | "cloud";

export const useNewProjectDialog = create<{
  open: boolean;
  mode: ProjectDialogMode;
  setOpen: (open: boolean, mode?: ProjectDialogMode) => void;
}>((set) => ({
  open: false,
  mode: "mode",
  setOpen: (open, mode) =>
    set((prev) => ({
      open,
      mode: mode ?? (open ? prev.mode : "mode"),
    })),
}));

function useGithubReposSearch(enabled: boolean, query: string) {
  const [repos, setRepos] = useState<GithubRepoDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);

  const fetchRepos = async (q: string) => {
    const seq = ++seqRef.current;
    setRepos(null);
    setError(null);
    try {
      const list = await listGithubRepos(q.trim());
      if (seq === seqRef.current) setRepos(list);
    } catch (e) {
      if (seq === seqRef.current) {
        setError(errorMessage(e));
        setRepos([]);
      }
    }
  };

  const debouncedFetch = useDebouncedCallback((q: string) => {
    void fetchRepos(q);
  }, 250);

  useEffect(() => {
    if (!enabled) {
      debouncedFetch.cancel();
      seqRef.current += 1;
      return;
    }
    if (query) {
      debouncedFetch(query);
    } else {
      debouncedFetch.cancel();
      void fetchRepos("");
    }
    return () => debouncedFetch.cancel();
  }, [enabled, query, debouncedFetch]);

  return { repos, error };
}

function ModeChooser({ onSelect }: { onSelect: (mode: "local" | "cloud") => void }) {
  return (
    <div className="mode-grid">
      <button type="button" className="card" onClick={() => onSelect("local")}>
        <LuFolderOpen />
        <strong>Local folder</strong>
        <span className="card-text">Open or create a folder on this computer</span>
      </button>
      <button type="button" className="card" onClick={() => onSelect("cloud")}>
        <BsGithub />
        <strong>Cloud repository</strong>
        <span className="card-text">Open or create a GitHub repository in E2B cloud</span>
      </button>
    </div>
  );
}

function LocalView({ onDone }: { onDone: () => void }) {
  const pickAndOpen = useWorkspaceStore((s) => s.pickAndOpen);
  const createLocalFolder = useWorkspaceStore((s) => s.createLocalFolder);
  const busy = useWorkspaceStore((s) => s.busy);
  const workspaceError = useWorkspaceStore((s) => s.error);
  const dismissError = useWorkspaceStore((s) => s.dismissError);
  const [tab, setTab] = useState<"open" | "create">("open");
  const [parentDir, setParentDir] = useState("");
  const [folderName, setFolderName] = useState("");
  const [initGit, setInitGit] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  const chooseParent = async () => {
    const selected = await pickDirDialog({ directory: true, multiple: false });
    if (typeof selected === "string") {
      setParentDir(selected);
      setLocalError(null);
    }
  };

  const handleOpenExisting = async () => {
    dismissError();
    if (await pickAndOpen()) onDone();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanParent = parentDir.trim();
    const cleanName = folderName.trim();
    if (!cleanParent) {
      setLocalError("Choose a parent location first.");
      return;
    }
    if (!cleanName) {
      setLocalError("Enter a folder name.");
      return;
    }
    setLocalError(null);
    dismissError();
    if (await createLocalFolder(cleanParent, cleanName, initGit)) {
      onDone();
    }
  };

  const shownError = localError || workspaceError;

  return (
    <>
      <div className="dialog-bar">
        <div className="segmented" role="tablist">
          <button
            type="button"
            role="tab"
            className="seg-btn"
            data-active={tab === "open"}
            onClick={() => setTab("open")}
          >
            <LuFolder />
            <span>Open folder</span>
          </button>
          <button
            type="button"
            role="tab"
            className="seg-btn"
            data-active={tab === "create"}
            onClick={() => setTab("create")}
          >
            <LuFolderPlus />
            <span>Create folder</span>
          </button>
        </div>
      </div>

      {tab === "open" ? (
        <div className="connect">
          <LuFolderOpen />
          <p>Select an existing project directory on this computer.</p>
          <Button variant="primary" size="lg" disabled={busy} onClick={() => void handleOpenExisting()}>
            {busy && <span className="spinner" />}
            <span>Choose folder…</span>
          </Button>
          {shownError && <div className="alert">{shownError}</div>}
        </div>
      ) : (
        <form className="form-stack" onSubmit={(e) => void handleCreate(e)}>
          {shownError && <div className="alert">{shownError}</div>}
          <label className="form-field">
            <span className="form-label">Location</span>
            <div className="form-path">
              <input
                className="field"
                value={parentDir}
                readOnly
                placeholder="Choose parent directory"
                onClick={() => void chooseParent()}
              />
              <Button variant="subtle" size="lg" disabled={busy} onClick={() => void chooseParent()}>
                Browse…
              </Button>
            </div>
          </label>
          <label className="form-field">
            <span className="form-label">Folder name</span>
            <input
              className="field"
              value={folderName}
              onChange={(e) => {
                setFolderName(e.target.value);
                setLocalError(null);
              }}
              placeholder="my-project"
              spellCheck={false}
              autoFocus
            />
          </label>
          <label className="form-check">
            <input
              type="checkbox"
              checked={initGit}
              onChange={(e) => setInitGit(e.target.checked)}
            />
            <span>Initialize Git repository</span>
          </label>
          <div className="form-actions">
            <Button type="submit" variant="primary" size="lg" disabled={busy || !parentDir || !folderName.trim()}>
              {busy && <span className="spinner" />}
              <span>Create &amp; open</span>
            </Button>
          </div>
        </form>
      )}
    </>
  );
}

function GithubConnectView() {
  const connecting = useGithubStore((s) => s.connecting);
  const error = useGithubStore((s) => s.error);
  const connect = useGithubStore((s) => s.connect);

  return (
    <div className="connect">
      <BsGithub />
      <p>Connect your GitHub account to browse repositories, create new ones, and work in cloud sandboxes.</p>
      <Button variant="primary" size="lg" disabled={connecting} onClick={() => void connect()}>
        {connecting && <span className="spinner" />}
        <span>{connecting ? "Waiting for GitHub…" : error ? "Retry connecting" : "Connect GitHub"}</span>
      </Button>
      {error && <div className="alert">{error}</div>}
    </div>
  );
}

function CloudView({ onDone }: { onDone: () => void }) {
  const account = useGithubStore((s) => s.account);
  const loaded = useGithubStore((s) => s.loaded);
  const githubError = useGithubStore((s) => s.error);

  const openCloudRepo = useWorkspaceStore((s) => s.openCloudRepo);
  const createCloudRepo = useWorkspaceStore((s) => s.createCloudRepo);
  const busy = useWorkspaceStore((s) => s.busy);
  const workspaceError = useWorkspaceStore((s) => s.error);
  const dismissError = useWorkspaceStore((s) => s.dismissError);

  const [tab, setTab] = useState<"existing" | "create">("existing");
  const [query, setQuery] = useState("");
  const [repoName, setRepoName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);

  const { repos, error: repoError } = useGithubReposSearch(
    loaded && account !== null && tab === "existing",
    query
  );

  useEffect(() => {
    if (account !== null && tab === "existing") {
      searchRef.current?.focus();
    }
  }, [account, tab]);

  if (!loaded) {
    return (
      <div className="empty">
        <span className="spinner" />
      </div>
    );
  }

  if (!account) {
    return <GithubConnectView />;
  }

  const openRepo = async (repo: GithubRepoDto) => {
    if (busy) return;
    dismissError();
    if (await openCloudRepo(repo.url)) onDone();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !repoName.trim()) return;
    dismissError();
    if (await createCloudRepo(repoName.trim(), description.trim() || null, isPrivate)) {
      onDone();
    }
  };

  const combinedError = workspaceError || githubError || repoError;

  return (
    <>
      <div className="dialog-bar">
        <div className="segmented" role="tablist">
          <button
            type="button"
            role="tab"
            className="seg-btn"
            data-active={tab === "existing"}
            onClick={() => setTab("existing")}
          >
            <BsGithub />
            <span>Existing repos</span>
          </button>
          <button
            type="button"
            role="tab"
            className="seg-btn"
            data-active={tab === "create"}
            onClick={() => setTab("create")}
          >
            <LuPlus />
            <span>Create new</span>
          </button>
        </div>

        <span className="badge">@{account.login}</span>
      </div>

      {tab === "existing" ? (
        <>
          <div className="dialog-search">
            <input
              ref={searchRef}
              className="field"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search repositories"
              aria-label="Search repositories"
              spellCheck={false}
            />
          </div>
          {combinedError && (
            <div className="dialog-search">
              <div className="alert">{combinedError}</div>
            </div>
          )}
          <div className="list" aria-busy={repos === null}>
            {repos === null && (
              <div className="empty">
                <span className="spinner" />
              </div>
            )}
            {repos?.length === 0 && !combinedError && (
              <div className="empty">
                <span>No repositories found</span>
                <Button variant="primary" size="sm" onClick={() => setTab("create")}>
                  <LuPlus />
                  <span>Create new repository</span>
                </Button>
              </div>
            )}
            {repos?.map((repo) => (
              <button
                key={repo.fullName}
                type="button"
                className="row"
                disabled={busy}
                onClick={() => void openRepo(repo)}
              >
                {repo.private ? <LuLock /> : <LuGlobe />}
                <span className="row-body">
                  <span className="truncate">{repo.fullName}</span>
                  {repo.description && <span className="truncate">{repo.description}</span>}
                </span>
                <span className="repo-meta">
                  <span className="badge">{repo.private ? "Private" : "Public"}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="foot">
            {busy ? (
              <>
                <span className="spinner" />
                <span>Opening cloud workspace…</span>
              </>
            ) : (
              <span>Runs inside a shared E2B cloud sandbox per repository across Desktop and Mobile.</span>
            )}
          </div>
        </>
      ) : (
        <form className="form-stack" onSubmit={(e) => void handleCreate(e)}>
          {combinedError && <div className="alert">{combinedError}</div>}
          <label className="form-field">
            <span className="form-label">Repository name</span>
            <input
              className="field"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              placeholder="my-app"
              spellCheck={false}
              autoFocus
            />
          </label>
          <label className="form-field">
            <span className="form-label">Description (optional)</span>
            <input
              className="field"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary"
            />
          </label>
          <div className="form-field">
            <span className="form-label">Visibility</span>
            <div className="segmented">
              <button
                type="button"
                className="seg-btn"
                data-active={isPrivate}
                onClick={() => setIsPrivate(true)}
              >
                <LuLock />
                <span>Private</span>
              </button>
              <button
                type="button"
                className="seg-btn"
                data-active={!isPrivate}
                onClick={() => setIsPrivate(false)}
              >
                <LuGlobe />
                <span>Public</span>
              </button>
            </div>
          </div>
          <div className="form-actions">
            <Button type="submit" variant="primary" size="lg" disabled={busy || !repoName.trim()}>
              {busy && <span className="spinner" />}
              <span>Create &amp; open</span>
            </Button>
          </div>
        </form>
      )}
    </>
  );
}

export function NewProjectDialog() {
  const open = useNewProjectDialog((s) => s.open);
  const mode = useNewProjectDialog((s) => s.mode);
  const setOpen = useNewProjectDialog((s) => s.setOpen);
  const refreshAccounts = useGithubStore((s) => s.refresh);
  const dismissWorkspaceError = useWorkspaceStore((s) => s.dismissError);

  useEffect(() => {
    if (open) {
      dismissWorkspaceError();
      if (mode !== "local") void refreshAccounts();
    }
  }, [open, mode, dismissWorkspaceError, refreshAccounts]);

  const title =
    mode === "mode"
      ? "New project"
      : mode === "local"
        ? "Local folder project"
        : "GitHub cloud project";

  return (
    <Dialog open={open} onOpenChange={(next) => setOpen(next)} title={title}>
      {mode !== "mode" && (
        <div className="dialog-bar">
          <div className="segmented">
            <button
              type="button"
              className="seg-btn"
              data-active={mode === "local"}
              onClick={() => setOpen(true, "local")}
            >
              <LuFolder />
              <span>Local</span>
            </button>
            <button
              type="button"
              className="seg-btn"
              data-active={mode === "cloud"}
              onClick={() => setOpen(true, "cloud")}
            >
              <BsGithub />
              <span>Cloud (GitHub)</span>
            </button>
          </div>
        </div>
      )}
      {mode === "mode" && <ModeChooser onSelect={(selected) => setOpen(true, selected)} />}
      {mode === "local" && <LocalView onDone={() => setOpen(false)} />}
      {mode === "cloud" && <CloudView onDone={() => setOpen(false)} />}
    </Dialog>
  );
}
