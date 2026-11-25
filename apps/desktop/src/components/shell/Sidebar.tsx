import { memo, useEffect, useState } from "react";
import { LuBlocks, LuEllipsis, LuPlus, LuTrash2, LuTriangleAlert, LuX } from "react-icons/lu";
import { formatRelativeTime, type SessionSummary } from "../../lib/api";
import { useAuthStore } from "../../lib/auth";
import { useGithubStore } from "../../lib/github";
import { useChatStore } from "../../lib/store";
import { formatUsd } from "../../lib/utils";
import { useWorkspaceStore, workspaceMode, type WorkspaceMeta } from "../../lib/workspace";
import { Avatar } from "../common/Avatar";
import { Button, IconButton } from "../ui/Button";
import { ConfirmDialog } from "../ui/Dialog";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../ui/Menu";
import { Tooltip } from "../ui/Tooltip";
import { useAccountDialog } from "../projects/AccountDialog";
import { useNewProjectDialog } from "../projects/NewProjectDialog";
import { ProjectIcon } from "../projects/ProjectMenu";
import { useShell } from "./shellStore";

const showChat = () => useShell.getState().setView("chat");

function useMinuteTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);
}

const SessionRow = memo(function SessionRow({
  session,
  active,
  locked,
  onRequestDelete,
}: {
  session: SessionSummary;
  active: boolean;
  locked: boolean;
  onRequestDelete: (session: SessionSummary) => void;
}) {
  const selectSession = useChatStore((s) => s.selectSession);
  const title = session.title || "New conversation";

  return (
    <Tooltip content={locked ? "Stop the agent to switch conversations" : undefined} side="right">
      <div className="row" data-depth="1" data-active={active}>
        <button
          type="button"
          className="row-main"
          title={title}
          disabled={locked}
          aria-current={active ? "page" : undefined}
          onClick={() => {
            void selectSession(session.id);
            showChat();
          }}
        >
          <span className="row-label">{title}</span>
        </button>
        <span className="row-meta">{formatRelativeTime(session.updatedAt)}</span>
        <span className="row-actions">
          <Menu>
            <MenuTrigger asChild>
              <Button icon size="sm" aria-label="Conversation options">
                <LuEllipsis />
              </Button>
            </MenuTrigger>
            <MenuContent align="start" side="right">
              <MenuItem data-danger="" onSelect={() => onRequestDelete(session)}>
                <LuTrash2 />
                <span className="row-label">
                  Delete conversation
                  <span className="menu-hint">This can't be undone</span>
                </span>
              </MenuItem>
            </MenuContent>
          </Menu>
        </span>
      </div>
    </Tooltip>
  );
});

function ProjectRow({
  project,
  current,
  locked,
  onRequestRemove,
}: {
  project: WorkspaceMeta;
  current: boolean;
  locked: boolean;
  onRequestRemove: (project: WorkspaceMeta) => void;
}) {
  const switchTo = useWorkspaceStore((s) => s.switchTo);
  const busy = useWorkspaceStore((s) => s.busy);
  const cloudProject = project.kind === "cloud" ? project.project : null;
  const reconnectNeeded = cloudProject !== null && !cloudProject.accountConnected;

  return (
    <div className="row" data-current={current || undefined}>
      <button
        type="button"
        className="row-main"
        title={
          reconnectNeeded
            ? `${project.path} — GitHub account @${cloudProject.accountLogin} is disconnected`
            : project.path
        }
        disabled={locked && !current}
        onClick={() => {
          if (!current) void switchTo(project.id);
          showChat();
        }}
      >
        <ProjectIcon project={project} open={current} />
        <span className="row-label">{project.name}</span>
        {reconnectNeeded && <LuTriangleAlert />}
      </button>
      <span className="row-actions">
        <Menu>
          <MenuTrigger asChild>
            <Button icon size="sm" aria-label={`${project.name} options`} disabled={busy}>
              <LuEllipsis />
            </Button>
          </MenuTrigger>
          <MenuContent align="start" side="right">
            <MenuItem data-danger="" onSelect={() => onRequestRemove(project)}>
              <LuTrash2 />
              <span className="row-label">
                {workspaceMode(project) === "cloud" ? "Delete project" : "Remove project"}
                <span className="menu-hint">
                  {workspaceMode(project) === "cloud"
                    ? "Removes sandbox and all project chats"
                    : "Clears local chats; files stay on disk"}
                </span>
              </span>
            </MenuItem>
          </MenuContent>
        </Menu>
      </span>
    </div>
  );
}

function Projects() {
  const sessions = useChatStore((s) => s.sessions);
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const streaming = useChatStore((s) => s.streaming);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const view = useShell((s) => s.view);
  const current = useWorkspaceStore((s) => s.current);
  const all = useWorkspaceStore((s) => s.all);
  const busy = useWorkspaceStore((s) => s.busy);
  const error = useWorkspaceStore((s) => s.error);
  const dismissError = useWorkspaceStore((s) => s.dismissError);
  const removeProject = useWorkspaceStore((s) => s.remove);
  const openProjectDialog = useNewProjectDialog((s) => s.setOpen);
  const [pendingSession, setPendingSession] = useState<SessionSummary | null>(null);
  const [pendingProject, setPendingProject] = useState<WorkspaceMeta | null>(null);
  const [deleting, setDeleting] = useState(false);

  const locked = streaming || busy;
  useMinuteTick();

  const confirmDeleteSession = async () => {
    if (!pendingSession) return;
    setDeleting(true);
    try {
      await deleteSession(pendingSession.id);
      setPendingSession(null);
    } finally {
      setDeleting(false);
    }
  };

  const confirmRemoveProject = async () => {
    if (!pendingProject) return;
    setDeleting(true);
    try {
      await removeProject(pendingProject.id);
      setPendingProject(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="side-section">
        <span>Projects</span>
        <IconButton
          label="New project"
          side="right"
          size="sm"
          disabled={locked}
          onClick={() => openProjectDialog(true, "mode")}
        >
          <LuPlus />
        </IconButton>
      </div>
      {error && (
        <div className="alert" role="alert">
          <span>{error}</span>
          <IconButton label="Dismiss" size="sm" onClick={dismissError}>
            <LuX />
          </IconButton>
        </div>
      )}
      <nav className="side-list" aria-label="Projects and conversations">
        {all.map((project) => {
          const isCurrent = project.id === current?.id;
          return (
            <div key={project.id}>
              <ProjectRow
                project={project}
                current={isCurrent}
                locked={locked}
                onRequestRemove={setPendingProject}
              />
              {isCurrent && sessions.length === 0 && <p className="side-empty">No conversations yet</p>}
              {isCurrent &&
                sessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    active={view === "chat" && session.id === currentSessionId}
                    locked={streaming && session.id !== currentSessionId}
                    onRequestDelete={setPendingSession}
                  />
                ))}
            </div>
          );
        })}
      </nav>

      <ConfirmDialog
        open={pendingSession !== null}
        onOpenChange={(next) => !next && setPendingSession(null)}
        title="Delete conversation?"
        description="This permanently deletes this conversation and its history. This action can't be undone."
        confirmLabel="Delete"
        pending={deleting}
        onConfirm={confirmDeleteSession}
      />

      <ConfirmDialog
        open={pendingProject !== null}
        onOpenChange={(next) => !next && setPendingProject(null)}
        title={pendingProject && workspaceMode(pendingProject) === "cloud" ? "Delete cloud project?" : "Remove local project?"}
        description={
          pendingProject
            ? workspaceMode(pendingProject) === "cloud"
              ? `This deletes ${pendingProject.name} from Orch across all devices, destroys its E2B cloud sandbox, and permanently deletes all conversations for this project. Your GitHub repository itself is untouched.`
              : `This removes ${pendingProject.name} from Orch and clears its local conversation history. Your files on disk stay untouched.`
            : ""
        }
        confirmLabel={pendingProject && workspaceMode(pendingProject) === "cloud" ? "Delete project" : "Remove project"}
        pending={deleting}
        onConfirm={confirmRemoveProject}
      />
    </>
  );
}

function Usage() {
  const budget = useChatStore((s) => s.budget);
  if (!budget) return null;
  const pct = budget.limitUsd > 0 ? Math.min(100, Math.max(0, (budget.costUsd / budget.limitUsd) * 100)) : 0;
  const level = pct >= 90 ? "danger" : pct >= 75 ? "warn" : undefined;
  return (
    <Tooltip
      content={`${formatUsd(budget.costUsd)} spent of ${formatUsd(budget.limitUsd)} (${Math.round(pct)}%)`}
      side="top"
    >
      <div className="usage" data-level={level}>
        <div className="usage-top">
          <span>Usage this {budget.period}</span>
          <span>
            {budget.limitUsd > 0 ? `${formatUsd(budget.costUsd)} / ${formatUsd(budget.limitUsd)}` : formatUsd(budget.costUsd)}
          </span>
        </div>
        <div className="usage-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
          <div className="usage-fill" style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        {!budget.allowed && <span className="usage-blocked">Usage limit reached</span>}
      </div>
    </Tooltip>
  );
}

function Account() {
  const user = useAuthStore((s) => s.user);
  const accounts = useGithubStore((s) => s.accounts);
  const openAccount = useAccountDialog((s) => s.setOpen);
  const subtitle =
    accounts.length === 0
      ? user?.email ?? "Signed in"
      : accounts.length === 1
        ? `GitHub · @${accounts[0].login}`
        : `GitHub · ${accounts.length} accounts`;

  return (
    <button
      type="button"
      className="account account-clickable"
      onClick={() => openAccount(true)}
      aria-label="Account and GitHub connections"
    >
      <Avatar src={user?.avatarUrl} fallback={user?.initial ?? "?"} />
      <span className="account-text">
        <span className="account-name truncate">{user?.displayName ?? "You"}</span>
        <span className="account-mail truncate">{subtitle}</span>
      </span>
    </button>
  );
}

export function Sidebar() {
  const view = useShell((s) => s.view);
  const sidebarOpen = useShell((s) => s.sidebarOpen);
  const setView = useShell((s) => s.setView);
  const streaming = useChatStore((s) => s.streaming);
  const newChat = useChatStore((s) => s.newChat);

  useEffect(() => {
    void useGithubStore.getState().refresh();
  }, []);

  return (
    <aside className="side" hidden={!sidebarOpen}>
      <div className="side-body">
        <Button
          variant="subtle"
          size="lg"
          block
          disabled={streaming}
          onClick={() => {
            newChat();
            setView("chat");
          }}
        >
          <LuPlus />
          <span>New conversation</span>
        </Button>
        <nav className="side-nav" aria-label="Views">
          <button
            type="button"
            className="row"
            data-active={view === "integrations"}
            onClick={() => setView(view === "integrations" ? "chat" : "integrations")}
          >
            <LuBlocks />
            <span className="row-label">Integrations</span>
          </button>
        </nav>
        <Projects />
        <div className="side-foot">
          <Usage />
          <Account />
        </div>
      </div>
    </aside>
  );
}
