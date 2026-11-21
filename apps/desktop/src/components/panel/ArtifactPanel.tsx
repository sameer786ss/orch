import { lazy, Suspense, useRef } from "react";
import { LuFolderTree, LuMaximize2, LuMinimize2, LuPlus, LuTerminal, LuX } from "react-icons/lu";
import { activeTabId, useArtifactsStore, type ArtifactTab } from "../../lib/artifacts";
import { getBasename } from "../../lib/utils";
import { ChromeIcon, FileIcon } from "../common/FileIcon";
import { Button, IconButton } from "../ui/Button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../ui/Menu";
import { Tooltip } from "../ui/Tooltip";
import { BrowserView } from "./BrowserView";
import { useFileFinder } from "./FileFinder";
import { TerminalView } from "./TerminalView";

const FileViewer = lazy(() => import("./FileViewer").then((m) => ({ default: m.FileViewer })));
const PdfViewer = lazy(() => import("./viewers/PdfViewer").then((m) => ({ default: m.PdfViewer })));
const DocxViewer = lazy(() => import("./viewers/DocxViewer").then((m) => ({ default: m.DocxViewer })));
const XlsxViewer = lazy(() => import("./viewers/XlsxViewer").then((m) => ({ default: m.XlsxViewer })));
const PptxViewer = lazy(() => import("./viewers/PptxViewer").then((m) => ({ default: m.PptxViewer })));

const LOADING = (
  <div className="center">
    <span className="spinner" />
  </div>
);

function tabName(tab: ArtifactTab): string {
  if (tab.kind === "browser") return "Browser";
  if (tab.kind === "terminal") return tab.label ?? "Terminal";
  return tab.label ?? (tab.path ? getBasename(tab.path) : tab.kind.toUpperCase());
}

function TabIcon({ tab }: { tab: ArtifactTab }) {
  if (tab.kind === "browser") return <ChromeIcon />;
  if (tab.kind === "terminal") return <LuTerminal />;
  return <FileIcon name={tab.path ? getBasename(tab.path) : `file.${tab.kind}`} />;
}

function Tabs() {
  const tabs = useArtifactsStore((s) => s.tabs);
  const active = useArtifactsStore(activeTabId);
  const setActive = useArtifactsStore((s) => s.setActive);
  const closeTab = useArtifactsStore((s) => s.closeTab);
  const openBrowser = useArtifactsStore((s) => s.openBrowser);
  const openTerminal = useArtifactsStore((s) => s.openTerminal);
  const setFinderOpen = useFileFinder((s) => s.setOpen);

  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => {
        const name = tabName(tab);
        return (
          <div
            key={tab.id}
            className="tab"
            role="tab"
            tabIndex={0}
            title={tab.path ?? name}
            aria-selected={tab.id === active}
            data-preview={tab.preview || undefined}
            onClick={() => setActive(tab.id)}
            onAuxClick={(e) => e.button === 1 && closeTab(tab.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setActive(tab.id);
              }
            }}
          >
            <span className="tab-icon">
              <TabIcon tab={tab} />
              <button
                type="button"
                className="tab-close"
                aria-label={`Close ${name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                <LuX />
              </button>
            </span>
            <span className="truncate tab-name">{name}</span>
          </div>
        );
      })}
      <Menu>
        <Tooltip content="New tab" side="bottom">
          <MenuTrigger asChild>
            <Button icon size="sm" aria-label="New tab">
              <LuPlus />
            </Button>
          </MenuTrigger>
        </Tooltip>
        <MenuContent align="start">
          <MenuItem onSelect={() => openBrowser()}>
            <ChromeIcon />
            <span className="row-label">Browser</span>
          </MenuItem>
          <MenuItem onSelect={openTerminal}>
            <LuTerminal />
            <span className="row-label">Terminal</span>
          </MenuItem>
          <MenuItem onSelect={() => setFinderOpen(true)}>
            <LuFolderTree />
            <span className="row-label">Files</span>
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}

function DocumentViewer({ tab, active }: { tab: ArtifactTab; active: boolean }) {
  const path = tab.path ?? "";
  const version = useArtifactsStore((s) => s.fileVersions[path] ?? 0);
  const key = `${path}:${version}`;
  if (tab.kind === "pdf") return <PdfViewer key={key} path={path} active={active} />;
  if (tab.kind === "docx") return <DocxViewer key={key} path={path} />;
  if (tab.kind === "xlsx") return <XlsxViewer key={key} path={path} />;
  if (tab.kind === "pptx") return <PptxViewer key={key} path={path} active={active} />;
  return <FileViewer path={path} />;
}

function TabBody({ tab, active }: { tab: ArtifactTab; active: boolean }) {
  const rendered = useRef(active);
  if (active) rendered.current = true;
  if (!rendered.current) return null;

  return (
    <div className="panel-tab" hidden={!active}>
      {tab.kind === "terminal" ? (
        <TerminalView id={tab.id} />
      ) : tab.kind === "browser" ? (
        <BrowserView initialUrl={tab.url} active={active} />
      ) : (
        tab.path && (
          <Suspense fallback={LOADING}>
            <DocumentViewer tab={tab} active={active} />
          </Suspense>
        )
      )}
    </div>
  );
}

function Launcher() {
  const openBrowser = useArtifactsStore((s) => s.openBrowser);
  const openTerminal = useArtifactsStore((s) => s.openTerminal);
  const setFinderOpen = useFileFinder((s) => s.setOpen);
  return (
    <div className="launch">
      <div className="launch-grid">
        <button type="button" className="card" data-center="" onClick={() => setFinderOpen(true)}>
          <LuFolderTree />
          Files
        </button>
        <button type="button" className="card" data-center="" onClick={() => openBrowser()}>
          <ChromeIcon />
          Browser
        </button>
        <button type="button" className="card" data-center="" onClick={openTerminal}>
          <LuTerminal />
          Terminal
        </button>
      </div>
      <p>Files the agent edits open here automatically.</p>
    </div>
  );
}

export function ArtifactPanel({ visible }: { visible: boolean }) {
  const tabs = useArtifactsStore((s) => s.tabs);
  const active = useArtifactsStore(activeTabId);
  const maximized = useArtifactsStore((s) => s.maximized);
  const setFinderOpen = useFileFinder((s) => s.setOpen);
  const toggleMaximized = useArtifactsStore((s) => s.toggleMaximized);
  const setPanelOpen = useArtifactsStore((s) => s.setPanelOpen);

  return (
    <>
      <div className="bar">
        <Tabs />
        <IconButton label="Search files" onClick={() => setFinderOpen(true)}>
          <LuFolderTree />
        </IconButton>
        <IconButton label={maximized ? "Restore" : "Maximize"} onClick={toggleMaximized}>
          {maximized ? <LuMinimize2 /> : <LuMaximize2 />}
        </IconButton>
        <IconButton label="Close panel" onClick={() => setPanelOpen(false)}>
          <LuX />
        </IconButton>
      </div>
      <div className="stage">
        <div className="panel-body">
          {tabs.length === 0 ? (
            <Launcher />
          ) : (
            tabs.map((tab) => <TabBody key={tab.id} tab={tab} active={visible && tab.id === active} />)
          )}
        </div>
      </div>
    </>
  );
}
