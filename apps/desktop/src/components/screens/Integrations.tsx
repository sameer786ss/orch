import { useCallback, useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { LuX } from "react-icons/lu";
import { disconnectConnector, errorMessage, getConnectorAuthUrl, type ConnectorDto } from "../../lib/api";
import { useConnectorsStore } from "../../lib/connectors";
import { ConnectorIcon } from "../common/ConnectorIcon";
import { Button, IconButton } from "../ui/Button";

type Pending = { id: string; kind: "connect" | "disconnect" };

const CONNECT_WAIT_MS = 120_000;

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function ConnectorCard({
  connector,
  pending,
  onConnect,
  onDisconnect,
}: {
  connector: ConnectorDto;
  pending: Pending | null;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
}) {
  const own = pending?.id === connector.id ? pending.kind : null;
  return (
    <article className="card">
      <div className="card-head">
        <span className="card-icon">
          <ConnectorIcon id={connector.id} iconUrl={connector.iconUrl} />
        </span>
        <span className="row-body">
          <span className="truncate">{connector.name}</span>
          <span className="truncate">
            {[
              connector.category ? titleCase(connector.category) : "",
              connector.toolCount > 0 ? `${connector.toolCount} tools` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        {connector.connected && (
          <span className="badge" data-tone="ok">
            Connected
          </span>
        )}
      </div>
      <p className="card-text">{connector.description}</p>
      {connector.connected ? (
        <Button size="sm" variant="subtle" disabled={pending !== null} onClick={() => onDisconnect(connector.id)}>
          {own === "disconnect" ? "Disconnecting…" : "Disconnect"}
        </Button>
      ) : (
        <Button size="sm" variant="primary" disabled={pending !== null} onClick={() => onConnect(connector.id)}>
          {own === "connect" ? "Waiting for sign-in…" : "Connect"}
        </Button>
      )}
    </article>
  );
}

export function Integrations() {
  const connectors = useConnectorsStore((s) => s.connectors);
  const loaded = useConnectorsStore((s) => s.loaded);
  const error = useConnectorsStore((s) => s.error);
  const refresh = useConnectorsStore((s) => s.refresh);
  const setError = useConnectorsStore((s) => s.setError);
  const [pending, setPending] = useState<Pending | null>(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (pending?.kind !== "connect") return;
    let focusTimer = 0;
    const onFocus = () => {
      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => void refresh(), 300);
    };
    const timeout = window.setTimeout(() => setPending(null), CONNECT_WAIT_MS);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearTimeout(focusTimer);
      window.clearTimeout(timeout);
    };
  }, [pending, refresh]);

  useEffect(() => {
    if (pending?.kind === "connect" && (error || connectors.some((c) => c.id === pending.id && c.connected))) {
      setPending(null);
    }
  }, [connectors, error, pending]);

  const connect = useCallback(
    async (id: string) => {
      setPending({ id, kind: "connect" });
      setError(null);
      try {
        await openUrl(await getConnectorAuthUrl(id));
      } catch (e) {
        setError(errorMessage(e));
        setPending(null);
      }
    },
    [setError]
  );

  const disconnect = useCallback(
    async (id: string) => {
      setPending({ id, kind: "disconnect" });
      setError(null);
      try {
        await disconnectConnector(id);
        await refresh();
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setPending(null);
      }
    },
    [refresh, setError]
  );

  const filters = useMemo(() => {
    const categories = Array.from(new Set(connectors.map((c) => c.category))).sort();
    return [
      { id: "all", label: "All", count: connectors.length },
      { id: "connected", label: "Connected", count: connectors.filter((c) => c.connected).length },
      ...categories.map((id) => ({ id, label: titleCase(id), count: connectors.filter((c) => c.category === id).length })),
    ];
  }, [connectors]);
  const visible = useMemo(
    () =>
      filter === "all"
        ? connectors
        : filter === "connected"
          ? connectors.filter((c) => c.connected)
          : connectors.filter((c) => c.category === filter),
    [connectors, filter]
  );

  if (!loaded) {
    return (
      <div className="center">
        <span className="spinner" data-size="lg" role="status" aria-label="Loading integrations" />
      </div>
    );
  }

  return (
    <>
      <div className="toolbar integrations-bar">
        <div className="tabs" role="tablist" aria-label="Filter integrations">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              className="tab"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <span className="badge">{f.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="list" data-grid="">
        {error && (
          <div className="alert" role="alert">
            <span>{error}</span>
            <IconButton label="Dismiss" size="sm" onClick={() => setError(null)}>
              <LuX />
            </IconButton>
          </div>
        )}
        {visible.map((c) => (
          <ConnectorCard key={c.id} connector={c} pending={pending} onConnect={connect} onDisconnect={disconnect} />
        ))}
        {visible.length === 0 && <p className="empty">No integrations in this category</p>}
      </div>
      <div className="foot integrations-foot">
        Connect your accounts, then pick which apps the agent can use in each conversation from the + menu.
      </div>
    </>
  );
}
