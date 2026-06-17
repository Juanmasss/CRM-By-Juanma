import * as React from "react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/45 p-8 text-center",
        className,
      )}
    >
      <div className="mb-4 rounded-full border border-primary/25 bg-primary/10 p-3 text-primary">
        <Inbox className="h-5 w-5" />
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
