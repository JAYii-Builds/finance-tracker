import { useState } from "react";
import { KpiCards } from "@/components/kpi-cards";
import { MonthlyBarChart } from "@/components/monthly-bar-chart";
import { CategoryDonutChart } from "@/components/category-donut-chart";
import { CategoryProgress } from "@/components/category-progress";
import { RecentTransactions } from "@/components/recent-transactions";
import { AddTransactionDialog } from "@/components/add-transaction-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

export default function Dashboard() {
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date("2025-05-01"), "yyyy-MM"));
  const year = parseInt(selectedMonth.split("-")[0], 10);

  const months = [
    { value: `${year}-01`, label: "Jan" },
    { value: `${year}-02`, label: "Feb" },
    { value: `${year}-03`, label: "Mar" },
    { value: `${year}-04`, label: "Apr" },
    { value: `${year}-05`, label: "May" },
    { value: `${year}-06`, label: "Jun" },
    { value: `${year}-07`, label: "Jul" },
    { value: `${year}-08`, label: "Aug" },
    { value: `${year}-09`, label: "Sep" },
    { value: `${year}-10`, label: "Oct" },
    { value: `${year}-11`, label: "Nov" },
    { value: `${year}-12`, label: "Dec" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground pb-12">
      <div className="border-b border-border/40 bg-card/50 backdrop-blur-md sticky top-0 z-10">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center font-bold font-mono tracking-tighter">
              FD
            </div>
            <h1 className="font-semibold text-lg tracking-tight">Finance</h1>
          </div>
          <div className="flex items-center gap-4">
            <Tabs value={selectedMonth} onValueChange={setSelectedMonth} className="w-[400px] hidden md:block">
              <TabsList className="grid w-full grid-cols-12 h-9 bg-muted/50 p-1">
                {months.map(m => (
                  <TabsTrigger 
                    key={m.value} 
                    value={m.value}
                    className="text-[11px] px-0 py-1 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    {m.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <AddTransactionDialog />
          </div>
        </div>
      </div>
      
      {/* Mobile Month Selector */}
      <div className="md:hidden container mx-auto px-4 py-4">
        <Tabs value={selectedMonth} onValueChange={setSelectedMonth} className="w-full">
          <TabsList className="flex w-full overflow-x-auto h-10 bg-muted/50 p-1 no-scrollbar justify-start">
            {months.map(m => (
              <TabsTrigger 
                key={m.value} 
                value={m.value}
                className="text-xs px-4 py-1.5 whitespace-nowrap data-[state=active]:bg-background data-[state=active]:shadow-sm shrink-0"
              >
                {m.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <KpiCards month={selectedMonth} />
        
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <MonthlyBarChart year={year} />
          </div>
          <div className="lg:col-span-1">
            <CategoryDonutChart month={selectedMonth} />
          </div>
          <div className="lg:col-span-1">
            <CategoryProgress month={selectedMonth} />
          </div>
        </div>
        
        <div className="grid grid-cols-1 gap-6">
          <RecentTransactions month={selectedMonth} />
        </div>
      </main>
    </div>
  );
}
