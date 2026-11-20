import { useEffect, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { reportError } from "./lib/api";
import { useAuthStore } from "./lib/auth";
import { useChatStore } from "./lib/store";
import { useUpdaterStore } from "./lib/updater";
import { useWorkspaceStore } from "./lib/workspace";
import { Button } from "./components/ui/Button";
import { TooltipProvider } from "./components/ui/Tooltip";
import { RepoDialog } from "./components/projects/RepoDialog";
import { Frame } from "./components/shell/Frame";
import { TitleBar } from "./components/shell/TitleBar";
import { ProjectPicker } from "./components/screens/ProjectPicker";
import { SignIn } from "./components/screens/SignIn";

function Shell() {
  return (
    <div className="app">
      <Frame />
      <RepoDialog />
    </div>
  );
}

function Loading() {
  return (
    <div className="center">
      <span className="spinner" data-size="lg" role="status" aria-label="Loading" />
    </div>
  );
}

function Fatal({ error, resetErrorBoundary }: FallbackProps) {
  const err = error instanceof Error ? error : new Error(String(error));
  useEffect(() => {
    void getCurrentWindow().show();
    if (import.meta.env.PROD) void reportError(err.stack || err.message).catch(() => {});
  }, [err]);

  return (
    <Window>
      <div className="center">
        <div className="fatal" role="alert">
          <h2>Something went wrong</h2>
          <p>{err.message}</p>
          <Button variant="subtle" onClick={resetErrorBoundary}>
            Try again
          </Button>
        </div>
      </div>
    </Window>
  );
}

function Window({ shell = false, children }: { shell?: boolean; children: ReactNode }) {
  return (
    <div className="window">
      <TitleBar shell={shell} />
      <div className="window-body">{children}</div>
    </div>
  );
}

function Root() {
  const authStatus = useAuthStore((s) => s.status);
  const initializeAuth = useAuthStore((s) => s.initialize);
  const initializeChat = useChatStore((s) => s.initialize);
  const startUpdater = useUpdaterStore((s) => s.start);
  const workspaceStatus = useWorkspaceStore((s) => s.status);

  useEffect(() => {
    const win = getCurrentWindow();
    void win.show().then(() => win.setFocus());
    void initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    if (authStatus !== "loading" && import.meta.env.PROD) void startUpdater();
  }, [authStatus, startUpdater]);

  useEffect(() => {
    if (workspaceStatus === "ready") void initializeChat();
  }, [workspaceStatus, initializeChat]);

  if (authStatus === "loading") return <Window><Loading /></Window>;
  if (authStatus === "signedOut") return <Window><SignIn /></Window>;
  if (workspaceStatus === "loading" || workspaceStatus === "idle") return <Window><Loading /></Window>;
  if (workspaceStatus === "needs_pick" || workspaceStatus === "error") return <Window><ProjectPicker /></Window>;
  return (
    <Window shell>
      <Shell />
    </Window>
  );
}

export default function App() {
  return (
    <ErrorBoundary FallbackComponent={Fatal}>
      <TooltipProvider delayDuration={400} skipDelayDuration={150} disableHoverableContent>
        <Root />
      </TooltipProvider>
    </ErrorBoundary>
  );
}
