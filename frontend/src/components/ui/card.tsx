import * as React from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border/80 bg-card/85 p-5 text-card-foreground shadow-2xl shadow-black/20",
        className,
      )}
      {...props}
    />
  );
}

export function StatCard({
  label,
  value,
  helper,
  trend,
  className,
}: {
  label: string;
  value: string;
  helper?: string;
  trend?: string;
  className?: string;
}) {
  return (
    <Card className={cn("min-h-32", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
        </div>
        {trend ? (
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            {trend}
          </span>
        ) : null}
      </div>
      {helper ? <p className="mt-4 text-sm text-muted-foreground">{helper}</p> : null}
    </Card>
  );
}
