import { useGetMonthlySummary, getGetMonthlySummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardsProps {
  month: string;
}

export function KpiCards({ month }: KpiCardsProps) {
  const { data: summary, isLoading } = useGetMonthlySummary(
    { month },
    { query: { queryKey: getGetMonthlySummaryQueryKey({ month }) } }
  );

  if (isLoading || !summary) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Skeleton className="h-4 w-[100px]" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-[120px] mb-2" />
              <Skeleton className="h-3 w-[80px]" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (rate: number) => {
    return `${rate.toFixed(1)}%`;
  };

  const calcDelta = (current: number, prev: number) => {
    if (prev === 0) return 0;
    return ((current - prev) / prev) * 100;
  };

  const incomeDelta = calcDelta(summary.totalIncome, summary.prevMonthIncome);
  const expensesDelta = calcDelta(summary.totalExpenses, summary.prevMonthExpenses);
  
  // For savings, we just use absolute difference if prev savings isn't provided directly,
  // but let's assume we can approximate or just not show delta if not available.
  const prevSavings = summary.prevMonthIncome - summary.prevMonthExpenses;
  const savingsDelta = calcDelta(summary.netSavings, prevSavings);

  const prevSavingsRate = summary.prevMonthIncome > 0 ? (prevSavings / summary.prevMonthIncome) * 100 : 0;
  const savingsRateDelta = summary.savingsRate - prevSavingsRate;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        title="Total Income"
        value={formatCurrency(summary.totalIncome)}
        delta={incomeDelta}
        trend="good-up"
      />
      <KpiCard
        title="Total Expenses"
        value={formatCurrency(summary.totalExpenses)}
        delta={expensesDelta}
        trend="bad-up"
      />
      <KpiCard
        title="Net Savings"
        value={formatCurrency(summary.netSavings)}
        delta={savingsDelta}
        trend="good-up"
      />
      <KpiCard
        title="Savings Rate"
        value={formatPercent(summary.savingsRate)}
        delta={savingsRateDelta}
        isRate
        trend="good-up"
      />
    </div>
  );
}

function KpiCard({ title, value, delta, isRate = false, trend }: { title: string, value: string, delta: number, isRate?: boolean, trend: "good-up" | "bad-up" }) {
  const isPositive = delta > 0;
  const isNegative = delta < 0;
  const isNeutral = delta === 0;

  // If trend is good-up, up is green. If bad-up, up is red.
  let colorClass = "text-muted-foreground";
  if (isPositive) {
    colorClass = trend === "good-up" ? "text-emerald-500" : "text-destructive";
  } else if (isNegative) {
    colorClass = trend === "good-up" ? "text-destructive" : "text-emerald-500";
  }

  return (
    <Card className="bg-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-mono tracking-tight">{value}</div>
        <p className="text-xs mt-1 flex items-center gap-1">
          {isPositive ? <ArrowUpIcon className={cn("h-3 w-3", colorClass)} /> : 
           isNegative ? <ArrowDownIcon className={cn("h-3 w-3", colorClass)} /> : 
           <MinusIcon className="h-3 w-3 text-muted-foreground" />}
          <span className={colorClass}>
            {Math.abs(delta).toFixed(1)}{isRate ? "pp" : "%"}
          </span>
          <span className="text-muted-foreground ml-1">vs last month</span>
        </p>
      </CardContent>
    </Card>
  );
}
