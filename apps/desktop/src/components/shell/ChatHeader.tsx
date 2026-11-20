import { LuBlocks, LuMessageSquare } from "react-icons/lu";
import { useChatStore } from "../../lib/store";
import { useShell } from "./shellStore";

export function ChatHeader() {
  const view = useShell((s) => s.view);
  const session = useChatStore((s) => s.sessions.find((x) => x.id === s.currentSessionId)?.title);
  const hasMessages = useChatStore((s) => s.messages.length > 0);
  const integrations = view === "integrations";
  const label = integrations ? "Integrations" : session || (hasMessages ? "Conversation" : "New conversation");

  return (
    <div className="bar">
      <div className="tabs" role="tablist">
        <div className="tab" role="tab" aria-selected="true">
          {integrations ? <LuBlocks /> : <LuMessageSquare />}
          <span className="truncate tab-name">{label}</span>
        </div>
      </div>
    </div>
  );
}
