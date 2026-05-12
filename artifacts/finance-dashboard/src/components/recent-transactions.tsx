import { useState } from "react";
import { useGetTransactions, getGetTransactionsQueryKey, useDeleteTransaction } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getIcon } from "@/lib/icons";
import { format } from "date-fns";
import { MoreHorizontal, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

interface RecentTransactionsProps {
  month: string;
}

export function RecentTransactions({ month }: RecentTransactionsProps) {
  const { data: transactions, isLoading } = useGetTransactions(
    { month, limit: 20 },
    { query: { queryKey: getGetTransactionsQueryKey({ month, limit: 20 }) } }
  );

  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const deleteMutation = useDeleteTransaction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
        queryClient.invalidateQueries({ queryKey: ["/api/stats/monthly"] });
        queryClient.invalidateQueries({ queryKey: ["/api/stats/category"] });
        queryClient.invalidateQueries({ queryKey: ["/api/stats/summary"] });
        toast({ title: "Transaction deleted" });
      }
    }
  });

  if (isLoading || !transactions) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex justify-between items-center">
                <div className="flex gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-[150px]" />
                    <Skeleton className="h-3 w-[100px]" />
                  </div>
                </div>
                <Skeleton className="h-4 w-[80px]" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-full bg-card">
      <CardHeader>
        <CardTitle>Recent Transactions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {transactions.length > 0 ? transactions.map(tx => {
            const Icon = getIcon(tx.categoryIcon);
            const isIncome = tx.type === "income";
            const date = new Date(tx.date);
            
            return (
              <div key={tx.id} className="group flex items-center justify-between p-3 rounded-md hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" 
                    style={{ backgroundColor: `${tx.categoryColor}20`, color: tx.categoryColor }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium leading-none">{tx.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {tx.categoryName} • {format(date, "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className={`font-mono text-sm font-medium ${isIncome ? "text-emerald-500" : ""}`}>
                    {isIncome ? "+" : "-"}${tx.amount.toLocaleString()}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem 
                        className="text-destructive focus:text-destructive"
                        onClick={() => deleteMutation.mutate({ id: tx.id })}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          }) : (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No transactions for this month.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
