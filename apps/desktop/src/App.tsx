import { useEffect, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { reportError } from "./lib/api";
import { useAuthStore } from "./lib/auth";
import { useChatStore } from "./lib/store";
import { useCrossDeviceSync } from "./lib/sync";
import { useUpdaterStore } from "./lib/updater";
import { useWorkspaceStore } from "./lib/workspace";
import { Button } from "./components/ui/Button";
import { TooltipProvider } from "./components/ui/Tooltip";
import { FileFinder } from "./components/panel/FileFinder";
import { AccountDialog } from "./components/projects/AccountDialog";
import { NewProjectDialog } from "./components/projects/NewProjectDialog";
import { Frame } from "./components/shell/Frame";
import { TitleBar } from "./components/shell/TitleBar";
import { ProjectPicker } from "./components/screens/ProjectPicker";
import { SignIn } from "./components/screens/SignIn";

function Shell() {
  useCrossDeviceSync();
  return (
    <div className="app">
      <Frame />
      <FileFinder />
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

  let screen: ReactNode;
  if (authStatus === "loading") screen = <Window><Loading /></Window>;
  else if (authStatus === "signedOut") screen = <Window><SignIn /></Window>;
  else if (workspaceStatus === "loading" || workspaceStatus === "idle") screen = <Window><Loading /></Window>;
  else if (workspaceStatus === "needs_pick" || workspaceStatus === "error") screen = <Window><ProjectPicker /></Window>;
  else
    screen = (
      <Window shell>
        <Shell />
      </Window>
    );

  return (
    <>
      {screen}
      <NewProjectDialog />
      <AccountDialog />
    </>
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
