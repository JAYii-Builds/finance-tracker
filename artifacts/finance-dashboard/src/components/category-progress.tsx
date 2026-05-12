import { useGetStatsByCategory, getGetStatsByCategoryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { getIcon } from "@/lib/icons";

interface CategoryProgressProps {
  month: string;
}

export function CategoryProgress({ month }: CategoryProgressProps) {
  const { data: stats, isLoading } = useGetStatsByCategory(
    { month },
    { query: { queryKey: getGetStatsByCategoryQueryKey({ month }) } }
  );

  if (isLoading || !stats) {
    return (
      <Card className="col-span-1 lg:col-span-1">
        <CardHeader>
          <CardTitle>Spending Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const sortedStats = [...stats].sort((a, b) => b.total - a.total).filter(s => s.total > 0);

  return (
    <Card className="col-span-1 lg:col-span-1 bg-card">
      <CardHeader>
        <CardTitle>Spending Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {sortedStats.length > 0 ? sortedStats.map(stat => {
          const Icon = getIcon(stat.categoryIcon);
          return (
            <div key={stat.categoryId} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: `${stat.categoryColor}20`, color: stat.categoryColor }}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-medium">{stat.categoryName}</span>
                </div>
                <div className="flex gap-3 text-muted-foreground">
                  <span className="font-mono">${stat.total.toLocaleString()}</span>
                  <span className="w-10 text-right">{stat.percentage.toFixed(0)}%</span>
                </div>
              </div>
              <Progress 
                value={stat.percentage} 
                className="h-1.5" 
                indicatorColor={stat.categoryColor}
              />
            </div>
          );
        }) : (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            No spending to summarize
          </div>
        )}
      </CardContent>
    </Card>
  );
}
