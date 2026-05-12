import { Router, type IRouter } from "express";
import { db, transactionsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/stats", async (req, res): Promise<void> => {
  const [row] = await db
    .select({
      totalIncome: sql<number>`coalesce(sum(case when ${transactionsTable.type} = 'income' then ${transactionsTable.amount}::float else 0 end), 0)`,
      totalExpenses: sql<number>`coalesce(sum(case when ${transactionsTable.type} = 'expense' then ${transactionsTable.amount}::float else 0 end), 0)`,
    })
    .from(transactionsTable);

  const totalIncome = row?.totalIncome ?? 0;
  const totalExpenses = row?.totalExpenses ?? 0;
  const netBalance = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

  res.json({ totalIncome, totalExpenses, netBalance, savingsRate });
});

export default router;
