import { BsGithub } from "react-icons/bs";
import { LuChevronDown, LuFolder, LuFolderOpen } from "react-icons/lu";
import { useChatStore } from "../../lib/store";
import { useWorkspaceStore, workspaceMode, type WorkspaceMeta } from "../../lib/workspace";
import { Button } from "../ui/Button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "../ui/Menu";
import { useNewProjectDialog } from "./NewProjectDialog";

export function ProjectIcon({ project, open }: { project: WorkspaceMeta; open?: boolean }) {
  if (workspaceMode(project) === "cloud") return <BsGithub />;
  return open ? <LuFolderOpen /> : <LuFolder />;
}

export function OpenProjectItems() {
  const busy = useWorkspaceStore((s) => s.busy);
  const streaming = useChatStore((s) => s.streaming);
  const locked = busy || streaming;
  const openProjectDialog = useNewProjectDialog((s) => s.setOpen);
  return (
    <>
      <MenuItem disabled={locked} onSelect={() => openProjectDialog(true, "local")}>
        <LuFolderOpen />
        <span className="row-label">
          Local folder
          <span className="menu-hint">Open or create a folder on this computer</span>
        </span>
      </MenuItem>
      <MenuItem disabled={locked} onSelect={() => openProjectDialog(true, "cloud")}>
        <BsGithub />
        <span className="row-label">
          GitHub repository
          <span className="menu-hint">Open or create a cloud workspace</span>
        </span>
      </MenuItem>
    </>
  );
}

export function ProjectMenu() {
  const current = useWorkspaceStore((s) => s.current);
  const all = useWorkspaceStore((s) => s.all);
  const switchTo = useWorkspaceStore((s) => s.switchTo);
  const busy = useWorkspaceStore((s) => s.busy);
  const streaming = useChatStore((s) => s.streaming);
  const locked = busy || streaming;

  return (
    <Menu>
      <MenuTrigger asChild>
        <Button aria-label="Switch project" title={current?.path}>
          {current ? <ProjectIcon project={current} /> : <LuFolder />}
          <span>{current?.name ?? "Choose project"}</span>
          <LuChevronDown className="chevron" />
        </Button>
      </MenuTrigger>
      <MenuContent align="start" side="top">
        {all.length > 0 && <MenuLabel>Projects</MenuLabel>}
        {all.map((project) => (
          <MenuItem
            key={project.id}
            disabled={locked}
            selected={project.id === current?.id}
            onSelect={() => project.id !== current?.id && void switchTo(project.id)}
          >
            <ProjectIcon project={project} />
            <span className="row-label">{project.name}</span>
          </MenuItem>
        ))}
        {all.length > 0 && <MenuSeparator />}
        <OpenProjectItems />
      </MenuContent>
    </Menu>
  );
}
