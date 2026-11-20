import { LuX } from "react-icons/lu";
import { useChatStore } from "../../lib/store";
import { IconButton } from "../ui/Button";
import { Composer } from "../composer/Composer";
import { MessageList } from "./MessageList";

export function ChatView() {
  const hasMessages = useChatStore((s) => s.messages.length > 0);
  const sessionId = useChatStore((s) => s.currentSessionId);
  const error = useChatStore((s) => s.error);
  const dismissError = useChatStore((s) => s.dismissError);

  return (
    <div className="chat" data-home={!hasMessages || undefined}>
      {hasMessages ? <MessageList key={sessionId} /> : null}
      <div className="dock">
        {error && (
          <div className="alert" role="alert">
            <span>{error}</span>
            <IconButton label="Dismiss" size="sm" onClick={dismissError}>
              <LuX />
            </IconButton>
          </div>
        )}
        <Composer home={!hasMessages} />
      </div>
    </div>
  );
}
