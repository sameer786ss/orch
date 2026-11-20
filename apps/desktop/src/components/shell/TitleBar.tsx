import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LuPanelLeftClose, LuPanelLeftOpen, LuPanelRightClose, LuPanelRightOpen } from "react-icons/lu";
import { VscChromeClose, VscChromeMaximize, VscChromeMinimize, VscChromeRestore } from "react-icons/vsc";
import { useArtifactsStore } from "../../lib/artifacts";
import { IS_MAC, IS_WIN } from "../../lib/utils";
import { useWorkspaceStore } from "../../lib/workspace";
import { IconButton } from "../ui/Button";
import { TrafficSpacer } from "../ui/TrafficSpacer";
import { useShell } from "./shellStore";
import { UpdateBadge } from "./UpdateBadge";

function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const sync = () => void win.isMaximized().then((value) => !disposed && setMaximized(value));
    sync();
    void win.onResized(sync).then((fn) => (disposed ? fn() : (unlisten = fn)));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const win = getCurrentWindow();
  return (
    <div className="winctl">
      <button type="button" className="winctl-btn" aria-label="Minimize" onClick={() => void win.minimize()}>
        <VscChromeMinimize />
      </button>
      <button
        type="button"
        className="winctl-btn"
        aria-label={maximized ? "Restore" : "Maximize"}
        onClick={() => void win.toggleMaximize()}
      >
        {maximized ? <VscChromeRestore /> : <VscChromeMaximize />}
      </button>
      <button type="button" className="winctl-btn" data-kind="close" aria-label="Close" onClick={() => void win.close()}>
        <VscChromeClose />
      </button>
    </div>
  );
}

function Title() {
  const project = useWorkspaceStore((s) => s.current?.name);
  return <div className="titlebar-title">{project ?? "Orch"}</div>;
}

function SidebarToggle() {
  const sidebarOpen = useShell((s) => s.sidebarOpen);
  const toggleSidebar = useShell((s) => s.toggleSidebar);
  return (
    <IconButton label={sidebarOpen ? "Hide sidebar" : "Show sidebar"} onClick={toggleSidebar}>
      {sidebarOpen ? <LuPanelLeftClose /> : <LuPanelLeftOpen />}
    </IconButton>
  );
}

function PanelToggle() {
  const view = useShell((s) => s.view);
  const panelOpen = useArtifactsStore((s) => s.panelOpen);
  const setPanelOpen = useArtifactsStore((s) => s.setPanelOpen);
  if (view !== "chat") return null;
  return (
    <IconButton
      label={panelOpen ? "Hide panel" : "Show panel"}
      tip={panelOpen ? "Hide panel" : "Files, browser and terminal"}
      onClick={() => setPanelOpen(!panelOpen)}
    >
      {panelOpen ? <LuPanelRightClose /> : <LuPanelRightOpen />}
    </IconButton>
  );
}

export function TitleBar({ shell = false }: { shell?: boolean }) {
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-side" data-tauri-drag-region>
        <TrafficSpacer />
        {!IS_MAC && <img src="/icon.png" alt="" className="titlebar-icon" data-tauri-drag-region />}
        {shell && <SidebarToggle />}
      </div>
      <div className="titlebar-center" data-tauri-drag-region>
        {shell && <Title />}
      </div>
      <div className="titlebar-side titlebar-end" data-tauri-drag-region>
        {shell && <UpdateBadge />}
        {shell && <PanelToggle />}
        {IS_WIN && <WindowControls />}
      </div>
    </header>
  );
}
