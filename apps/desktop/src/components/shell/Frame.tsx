import { Sidebar } from "./Sidebar";
import { Workspace } from "./Workspace";

export function Frame() {
  return (
    <>
      <Sidebar />
      <main className="pane main">
        <Workspace />
      </main>
    </>
  );
}
