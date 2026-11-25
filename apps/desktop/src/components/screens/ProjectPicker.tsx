import { BsGithub } from "react-icons/bs";
import { LuFolderOpen, LuX } from "react-icons/lu";
import { useAuthStore } from "../../lib/auth";
import { useWorkspaceStore } from "../../lib/workspace";
import { IconButton } from "../ui/Button";
import { useNewProjectDialog } from "../projects/NewProjectDialog";
import { Screen } from "./Screen";

export function ProjectPicker() {
  const name = useAuthStore((s) => s.user?.displayName?.split(" ")[0]);
  const busy = useWorkspaceStore((s) => s.busy);
  const error = useWorkspaceStore((s) => s.error);
  const dismissError = useWorkspaceStore((s) => s.dismissError);
  const openProjectDialog = useNewProjectDialog((s) => s.setOpen);

  return (
    <Screen
      title={name ? `Welcome, ${name}` : "Open a project"}
      subtitle="Pick where you want to work. You can add more projects from the sidebar later."
    >
      <div className="choices" aria-busy={busy}>
        <button type="button" className="card" disabled={busy} onClick={() => openProjectDialog(true, "local")}>
          <LuFolderOpen />
          <strong>Local folder</strong>
          <span className="card-text">Open or create a folder on this computer</span>
        </button>
        <button type="button" className="card" disabled={busy} onClick={() => openProjectDialog(true, "cloud")}>
          <BsGithub />
          <strong>GitHub repository</strong>
          <span className="card-text">Open or create a repo in a cloud workspace</span>
        </button>
      </div>
      {error && (
        <div className="alert" role="alert">
          <span>{error}</span>
          <IconButton label="Dismiss" size="sm" onClick={dismissError}>
            <LuX />
          </IconButton>
        </div>
      )}
    </Screen>
  );
}
