import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { create } from "zustand";
import { LuChevronRight, LuX } from "react-icons/lu";
import { activeTabId, useArtifactsStore } from "../../lib/artifacts";
import { getBasename, getDirname, IS_MAC } from "../../lib/utils";
import { FileIcon } from "../common/FileIcon";
import { useShell } from "../shell/shellStore";
import { IconButton } from "../ui/Button";
import { OverlayPresence, useOverlayStore } from "../ui/overlay";
import { useFileSearch } from "./hooks/useFileSearch";
import { ROOT, useFileTree } from "./hooks/useFileTree";

export const useFileFinder = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

interface FinderItem {
  path: string;
  name: string;
  isDir: boolean;
  depth: number;
  parent: string;
  dir?: string;
}

function useFinderShortcut() {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || e.altKey || e.shiftKey) return;
      if (!(IS_MAC ? e.metaKey : e.ctrlKey)) return;
      e.preventDefault();
      const { open, setOpen } = useFileFinder.getState();
      if (!open && useOverlayStore.getState().count > 0) return;
      setOpen(!open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function FinderBody({ onDone }: { onDone: () => void }) {
  const openFile = useArtifactsStore((s) => s.openFile);
  const activePath = useArtifactsStore((s) => s.tabs.find((t) => t.id === activeTabId(s))?.path);
  const setView = useShell((s) => s.setView);
  const [query, setQuery] = useState("");
  const [value, setValue] = useState("");
  const tree = useFileTree();
  const search = useFileSearch(query);

  const items = useMemo<FinderItem[]>(() => {
    if (search.active) {
      return search.hits.map((hit) => ({
        path: hit.path,
        name: getBasename(hit.path) || hit.name,
        isDir: false,
        depth: 0,
        parent: ROOT,
        dir: getDirname(hit.path),
      }));
    }
    return tree.rows.map(({ entry, depth, parent }) => ({
      path: entry.path,
      name: entry.name,
      isDir: entry.isDir,
      depth,
      parent,
    }));
  }, [search.active, search.hits, tree.rows]);

  const busy = search.active ? search.searching && items.length === 0 : tree.loading;
  const message = busy
    ? null
    : search.active
      ? (search.error ?? (items.length ? null : "No files found"))
      : (tree.error ?? (items.length ? null : "This workspace is empty"));

  const activate = (item: FinderItem) => {
    if (item.isDir) {
      if (tree.expanded.has(item.path)) tree.collapse(item.path);
      else void tree.expand(item.path);
      return;
    }
    openFile(item.path);
    setView("chat");
    onDone();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (search.active) return;
    const index = items.findIndex((item) => item.path === value);
    const item = items[index];
    if (!item) return;
    const isOpen = item.isDir && tree.expanded.has(item.path);
    const next = items[index + 1];
    if (event.key === "ArrowRight" && item.isDir && !isOpen) void tree.expand(item.path);
    else if (event.key === "ArrowRight" && isOpen && next?.parent === item.path) setValue(next.path);
    else if (event.key === "ArrowLeft" && isOpen) tree.collapse(item.path);
    else if (event.key === "ArrowLeft" && item.parent !== ROOT) setValue(item.parent);
    else return;
    event.preventDefault();
  };

  return (
    <Command
      className="finder-cmd"
      label="Files"
      shouldFilter={false}
      vimBindings={false}
      loop
      value={value}
      onValueChange={setValue}
      onKeyDown={onKeyDown}
    >
      <div className="dialog-head">
        <Dialog.Title>Files</Dialog.Title>
        <Dialog.Close asChild>
          <IconButton label="Close" size="sm">
            <LuX />
          </IconButton>
        </Dialog.Close>
      </div>
      <div className="dialog-search">
        <Command.Input
          className="field"
          value={query}
          onValueChange={setQuery}
          placeholder="Search files"
          spellCheck={false}
          autoFocus
        />
      </div>
      <Command.List className="tree">
        {busy && (
          <div className="empty">
            <span className="spinner" />
          </div>
        )}
        {message && <div className="empty">{message}</div>}
        {items.map((item) => {
          const isOpen = item.isDir && tree.expanded.has(item.path);
          return (
            <Command.Item
              key={item.path}
              value={item.path}
              className="row"
              data-current={(!item.isDir && item.path === activePath) || undefined}
              style={{ "--depth": item.depth } as CSSProperties}
              onSelect={() => activate(item)}
            >
              {!search.active &&
                (item.isDir ? (
                  <LuChevronRight className="tree-chevron chevron" data-open={isOpen || undefined} />
                ) : (
                  <span className="tree-spacer" />
                ))}
              <FileIcon name={item.name} folder={item.isDir} />
              <span className="row-label">{item.name}</span>
              {item.dir && item.dir !== "." && <span className="row-meta">{item.dir}</span>}
            </Command.Item>
          );
        })}
      </Command.List>
      {!search.active && tree.truncated && <div className="foot">Some folders are too large to list in full.</div>}
    </Command>
  );
}

export function FileFinder() {
  const open = useFileFinder((s) => s.open);
  const setOpen = useFileFinder((s) => s.setOpen);
  useFinderShortcut();

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content
          className="dialog finder"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <OverlayPresence />
          <FinderBody onDone={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
