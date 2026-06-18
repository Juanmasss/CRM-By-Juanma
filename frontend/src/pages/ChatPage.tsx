import { ChatInbox } from "@/components/ChatInbox";
import { ConnectionGate } from "@/components/ConnectionGate";

export function ChatPage() {
  return (
    <ConnectionGate>
      <ChatInbox />
    </ConnectionGate>
  );
}
