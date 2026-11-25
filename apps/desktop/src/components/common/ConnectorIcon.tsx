import { useConnectorsStore } from "../../lib/connectors";

export function ConnectorIcon({ id, iconUrl }: { id: string; iconUrl?: string | null }) {
  const storeIconUrl = useConnectorsStore((s) => s.connectors.find((c) => c.id === id)?.iconUrl);
  const src = iconUrl ?? storeIconUrl ?? null;

  if (!src) return null;

  return <img src={src} alt="" className="file-icon" referrerPolicy="no-referrer" />;
}
