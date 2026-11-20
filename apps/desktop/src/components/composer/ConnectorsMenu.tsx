import { useMemo } from "react";
import { LuPlug } from "react-icons/lu";
import { selectActiveConnectors, useChatStore } from "../../lib/store";
import { GITHUB_ID, useConnectorsStore } from "../../lib/connectors";
import { useWorkspaceStore } from "../../lib/workspace";
import { ConnectorIcon } from "../common/ConnectorIcon";
import { MenuCheckboxItem, MenuItem, MenuSub, MenuSubContent, MenuSubTrigger } from "../ui/Menu";

export function ConnectorsMenu() {
  const connectors = useConnectorsStore((s) => s.connectors);
  const github = useConnectorsStore((s) => s.github);
  const loaded = useConnectorsStore((s) => s.loaded);
  const loadFailed = useConnectorsStore((s) => s.loadFailed);
  const cloud = useWorkspaceStore((s) => s.mode) === "cloud";
  const active = useChatStore(selectActiveConnectors);
  const toggle = useChatStore((s) => s.toggleConnector);
  const available = useMemo(() => connectors.filter((c) => c.connected && c.id !== GITHUB_ID), [connectors]);
  const showGithub = cloud && Boolean(github?.connected);
  const empty = loadFailed
    ? "Couldn't load connectors"
    : loaded
      ? github?.connected
        ? "No other connected apps"
        : "No connected apps"
      : "Loading…";

  return (
    <MenuSub>
      <MenuSubTrigger meta={active.length > 0 ? <span className="badge">{active.length}</span> : undefined}>
        <LuPlug />
        <span className="row-label">Connectors</span>
      </MenuSubTrigger>
      <MenuSubContent>
        {showGithub && (
          <MenuItem selected onSelect={(e) => e.preventDefault()}>
            <ConnectorIcon id={GITHUB_ID} />
            <span className="row-label">
              GitHub
              <span className="menu-hint">Used by this workspace</span>
            </span>
          </MenuItem>
        )}
        {available.length === 0
          ? !showGithub && <MenuItem disabled>{empty}</MenuItem>
          : available.map((c) => (
              <MenuCheckboxItem
                key={c.id}
                checked={active.includes(c.id)}
                onCheckedChange={() => toggle(c.id)}
                onSelect={(e) => e.preventDefault()}
              >
                <ConnectorIcon id={c.id} />
                <span className="row-label">{c.name}</span>
              </MenuCheckboxItem>
            ))}
      </MenuSubContent>
    </MenuSub>
  );
}
