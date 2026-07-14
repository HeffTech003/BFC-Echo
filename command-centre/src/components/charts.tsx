// components/charts.tsx
// Reusable Recharts-based chart components for Bendigo Fight Centre.
// All components are client-side ("use client").
"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// ── Palette (maps to Tailwind CSS vars where possible) ────────────────────────

const COLOURS = {
  primary:     "hsl(var(--primary))",
  success:     "#22c55e",
  warning:     "#f59e0b",
  destructive: "#ef4444",
  muted:       "hsl(var(--muted-foreground))",
  chart1:      "#6366f1",  // indigo
  chart2:      "#22c55e",  // green
  chart3:      "#f59e0b",  // amber
  chart4:      "#ef4444",  // red
  chart5:      "#8b5cf6",  // violet
};

// ── Shared tooltip style ──────────────────────────────────────────────────────

const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "6px",
  fontSize: "12px",
  color: "hsl(var(--popover-foreground))",
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
};

function fmtMoney(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

// ── Revenue trend (area chart) ────────────────────────────────────────────────

export type RevenueTrendPoint = {
  month: string;   // e.g. "Jul 24"
  revenue: number;
  expenses: number;
};

export function RevenueTrendChart({ data }: { data: RevenueTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id="grad-revenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={COLOURS.success} stopOpacity={0.25} />
            <stop offset="95%" stopColor={COLOURS.success} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="grad-expenses" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={COLOURS.warning} stopOpacity={0.2} />
            <stop offset="95%" stopColor={COLOURS.warning} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={fmtMoney}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          width={42}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v: number, name: string) => [fmtMoney(v), name]}
        />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          iconType="circle"
          iconSize={8}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke={COLOURS.success}
          strokeWidth={2}
          fill="url(#grad-revenue)"
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Area
          type="monotone"
          dataKey="expenses"
          name="Expenses"
          stroke={COLOURS.warning}
          strokeWidth={2}
          fill="url(#grad-expenses)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Monthly bar chart (single series, e.g. net P&L) ──────────────────────────

export type MonthlyBarPoint = {
  month: string;
  value: number;
};

export function MonthlyBarChart({
  data,
  label = "Amount",
  positiveColour = COLOURS.success,
  negativeColour = COLOURS.destructive,
}: {
  data: MonthlyBarPoint[];
  label?: string;
  positiveColour?: string;
  negativeColour?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={fmtMoney}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          width={42}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v: number) => [fmtMoney(v), label]}
        />
        <Bar dataKey="value" name={label} radius={[3, 3, 0, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.value >= 0 ? positiveColour : negativeColour}
              fillOpacity={0.85}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Status donut (member status breakdown) ────────────────────────────────────

export type StatusSlice = {
  name: string;
  value: number;
  colour?: string;
};

const DEFAULT_DONUT_COLOURS: Record<string, string> = {
  active:    COLOURS.success,
  inactive:  COLOURS.muted,
  suspended: COLOURS.warning,
  cancelled: COLOURS.destructive,
  pending:   COLOURS.chart1,
};

export function StatusDonutChart({ data }: { data: StatusSlice[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={75}
            paddingAngle={2}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.colour ?? DEFAULT_DONUT_COLOURS[entry.name.toLowerCase()] ?? COLOURS.chart5}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: number, name: string) => [
              `${v} (${total > 0 ? Math.round((v / total) * 100) : 0}%)`,
              name,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Centre label */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <div className="text-2xl font-semibold tabular-nums">{total}</div>
          <div className="text-[10px] text-muted-foreground">members</div>
        </div>
      </div>
      {/* Legend */}
      <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1">
        {data.map((entry, i) => (
          <div key={i} className="flex items-center gap-1 text-[11px]">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{
                backgroundColor:
                  entry.colour ?? DEFAULT_DONUT_COLOURS[entry.name.toLowerCase()] ?? COLOURS.chart5,
              }}
            />
            <span className="text-muted-foreground capitalize">{entry.name}</span>
            <span className="font-medium tabular-nums">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Payment events bar — payments per month ───────────────────────────────────

export type PaymentEventPoint = {
  month: string;
  paid: number;
  failed: number;
};

export function PaymentEventsChart({ data }: { data: PaymentEventPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          width={28}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
        <Bar dataKey="paid"   name="Paid"   fill={COLOURS.success}     radius={[3, 3, 0, 0]} stackId="a" />
        <Bar dataKey="failed" name="Failed" fill={COLOURS.destructive} radius={[3, 3, 0, 0]} stackId="a" />
      </BarChart>
    </ResponsiveContainer>
  );
}
