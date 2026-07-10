// components/ui/responsive-table.tsx
// Drop-in wrapper that makes any Table horizontally scrollable on mobile.
//
// BEFORE:
//   <div className="rounded-md border">
//     <Table>...</Table>
//   </div>
//
// AFTER:
//   <ResponsiveTable>
//     <Table>...</Table>
//   </ResponsiveTable>

import { cn } from "@/lib/utils";

export function ResponsiveTable({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md border overflow-x-auto -webkit-overflow-scrolling-touch", className)}>
      {children}
    </div>
  );
}
