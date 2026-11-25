import { LuDownload, LuRotateCw, LuTriangleAlert } from "react-icons/lu";
import { useUpdaterStore } from "../../lib/updater";
import { Button } from "../ui/Button";
import { Tooltip } from "../ui/Tooltip";

export function UpdateBadge() {
  const status = useUpdaterStore((s) => s.status);
  const version = useUpdaterStore((s) => s.version);
  const percent = useUpdaterStore((s) => s.percent);
  const error = useUpdaterStore((s) => s.error);
  const apply = useUpdaterStore((s) => s.apply);
  const start = useUpdaterStore((s) => s.start);

  if (status === "downloading" || status === "installing") {
    const label =
      status === "installing" ? "Restarting…" : percent > 0 && percent < 100 ? `Updating ${percent}%` : "Updating…";
    return (
      <Tooltip content={`Downloading v${version}`} side="bottom">
        <Button size="sm" disabled>
          <span className="spinner" />
          <span>{label}</span>
        </Button>
      </Tooltip>
    );
  }

  if (status === "readyToRestart") {
    return (
      <Tooltip content={`v${version} is ready. Restart to apply.`} side="bottom">
        <Button size="sm" variant="subtle" onClick={() => void apply()}>
          <LuRotateCw />
          <span>Restart to update</span>
        </Button>
      </Tooltip>
    );
  }

  if (status === "manualAvailable") {
    return (
      <Tooltip content={`v${version} is available. Download the latest release.`} side="bottom">
        <Button size="sm" variant="subtle" onClick={() => void apply()}>
          <LuDownload />
          <span>Update v{version}</span>
        </Button>
      </Tooltip>
    );
  }

  if (status === "failed") {
    return (
      <Tooltip content={`Update failed: ${error || "Unknown error"}. Click to retry.`} side="bottom">
        <Button size="sm" variant="danger" onClick={() => void start()}>
          <LuTriangleAlert />
          <span>Update failed</span>
        </Button>
      </Tooltip>
    );
  }

  return null;
}
