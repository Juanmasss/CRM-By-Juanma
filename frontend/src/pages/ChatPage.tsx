import { MessageCircle } from "lucide-react";

import { ConnectionGate } from "@/components/ConnectionGate";
import { Card } from "@/components/ui/card";

export function ChatPage() {
  return (
    <ConnectionGate>
      <Card className="flex min-h-[calc(100vh-12rem)] items-center justify-center p-8 text-center">
        <div>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <MessageCircle className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-xl font-semibold">Chat de WhatsApp</h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            La conexión está activa. Aquí se mostrará la bandeja de conversaciones del CRM.
          </p>
        </div>
      </Card>
    </ConnectionGate>
  );
}
