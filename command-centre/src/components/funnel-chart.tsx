// components/funnel-chart.tsx
"use client";

type FunnelStage = { label: string; value: number; colour?: string };

export function FunnelChart({ data }: { data: FunnelStage[] }) {
  const max = Math.max(...data.map(d => d.value), 1);

  return (
    <div className="space-y-2">
      {data.map((stage, i) => {
        const pct = Math.round((stage.value / max) * 100);
        const dropOff = i > 0 && data[i - 1].value > 0
          ? Math.round(((data[i - 1].value - stage.value) / data[i - 1].value) * 100)
          : null;

        return (
          <div key={stage.label}>
            {/* Drop-off indicator */}
            {dropOff !== null && dropOff > 0 && (
              <div className="flex items-center gap-1 py-0.5 pl-2 text-[10px] text-muted-foreground">
                <svg viewBox="0 0 16 16" className="h-3 w-3 text-destructive" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M8 3v10M4 9l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {dropOff}% drop-off
              </div>
            )}

            {/* Stage bar */}
            <div
              className="mx-auto overflow-hidden rounded-md transition-all duration-300"
              style={{ width: `${Math.max(pct, 20)}%` }}
            >
              <div className="relative flex items-center justify-between gap-2 bg-muted/60 px-3 py-2 rounded-md">
                <span className="text-xs font-medium">{stage.label}</span>
                <span className="text-xs font-semibold tabular-nums">{stage.value}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
