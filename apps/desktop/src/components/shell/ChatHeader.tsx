import { useChatStore } from "../../lib/store";
import { useShell } from "./shellStore";

export function ChatHeader() {
  const view = useShell((s) => s.view);
  const session = useChatStore((s) => s.sessions.find((x) => x.id === s.currentSessionId)?.title);
  const hasMessages = useChatStore((s) => s.messages.length > 0);
  const label = view === "integrations" ? "Integrations" : session || (hasMessages ? "Conversation" : "New conversation");

  return (
    <div className="bar">
      <span className="bar-title">{label}</span>
    </div>
  );
}
