// components/retention-charts.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";

type ChurnPoint = { month: string; cancellations: number; newMembers: number };
type ReasonSlice = { name: string; value: number };

const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "6px",
  fontSize: "12px",
  color: "hsl(var(--popover-foreground))",
};

const BAR_COLOURS = [
  "#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd",
  "#7c3aed", "#4f46e5", "#4338ca", "#3730a3",
];

export function RetentionCharts({
  churnTrendData,
  reasonData,
}: {
  churnTrendData: ChurnPoint[];
  reasonData: ReasonSlice[];
}) {
  const hasChurn = churnTrendData.some(d => d.cancellations > 0 || d.newMembers > 0);
  const hasReasons = reasonData.length > 0;

  if (!hasChurn && !hasReasons) return null;

  return (
    <div className="mb-6 grid gap-4 md:grid-cols-2">
      {/* Cancellations vs new members trend */}
      {hasChurn && (
        <Card className="md:col-span-2">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium">
              New joins vs cancellations — last 12 months
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={churnTrendData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
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
                  width={24}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                <Bar dataKey="newMembers"    name="New joins"      fill="#22c55e" radius={[3,3,0,0]} />
                <Bar dataKey="cancellations" name="Cancellations"  fill="#ef4444" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Cancellation reasons */}
      {hasReasons && (
        <Card className="md:col-span-2">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium">Cancellation reasons</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={reasonData}
                layout="vertical"
                margin={{ top: 4, right: 24, bottom: 0, left: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="value" name="Count" radius={[0, 3, 3, 0]}>
                  {reasonData.map((_, i) => (
                    <Cell key={i} fill={BAR_COLOURS[i % BAR_COLOURS.length]} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
