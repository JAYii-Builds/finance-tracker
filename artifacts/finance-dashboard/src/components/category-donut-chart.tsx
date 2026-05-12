import { useGetStatsByCategory, getGetStatsByCategoryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface CategoryDonutChartProps {
  month: string;
}

const RADIUS = 70;
const INNER_RADIUS = 48;
const CENTER = 80;
const SIZE = 160;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, ri: number, startAngle: number, endAngle: number) {
  const s1 = polarToCartesian(cx, cy, r, startAngle);
  const e1 = polarToCartesian(cx, cy, r, endAngle);
  const s2 = polarToCartesian(cx, cy, ri, endAngle);
  const e2 = polarToCartesian(cx, cy, ri, startAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${s1.x} ${s1.y}`,
    `A ${r} ${r} 0 ${large} 1 ${e1.x} ${e1.y}`,
    `L ${s2.x} ${s2.y}`,
    `A ${ri} ${ri} 0 ${large} 0 ${e2.x} ${e2.y}`,
    "Z",
  ].join(" ");
}

export function CategoryDonutChart({ month }: CategoryDonutChartProps) {
  const { data: stats, isLoading } = useGetStatsByCategory(
    { month },
    { query: { queryKey: getGetStatsByCategoryQueryKey({ month }) } }
  );

  if (isLoading || !stats) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-sm">Expenses by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const chartData = stats
    .filter(s => Number(s.total) > 0)
    .map(s => ({
      name: s.categoryName,
      value: Number(s.total),
      color: s.categoryColor || "#6366f1",
    }));

  const total = chartData.reduce((acc, d) => acc + d.value, 0);

  let cumulativeAngle = 0;
  const slices = chartData.map((entry) => {
    const angle = (entry.value / total) * 360;
    const path = arcPath(CENTER, CENTER, RADIUS, INNER_RADIUS, cumulativeAngle, cumulativeAngle + angle - 1);
    cumulativeAngle += angle;
    return { ...entry, path };
  });

  return (
    <Card className="h-full bg-card">
      <CardHeader>
        <CardTitle className="text-sm">Expenses by Category</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3 pb-4">
        {chartData.length > 0 ? (
          <>
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ overflow: "visible" }}>
              {slices.map((slice, i) => (
                <path
                  key={i}
                  d={slice.path}
                  style={{ fill: slice.color, stroke: "none" }}
                />
              ))}
            </svg>
            <div className="w-full space-y-1.5">
              {chartData.map((entry, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-muted-foreground truncate max-w-[80px]">{entry.name}</span>
                  </div>
                  <span className="font-mono text-xs font-medium">${entry.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex h-[200px] items-center justify-center text-muted-foreground text-sm">
            No expenses this month
          </div>
        )}
      </CardContent>
    </Card>
  );
}
