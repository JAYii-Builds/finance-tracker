import { Router, type IRouter } from "express";
import { db, transactionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  const userId = (auth?.sessionClaims?.userId as string) || auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = userId;
  next();
}

router.get("/stats", requireAuth, async (req: any, res): Promise<void> => {
  const [row] = await db
    .select({
      totalIncome: sql<number>`coalesce(sum(case when ${transactionsTable.type} = 'income' then ${transactionsTable.amount}::float else 0 end), 0)`,
      totalExpenses: sql<number>`coalesce(sum(case when ${transactionsTable.type} = 'expense' then ${transactionsTable.amount}::float else 0 end), 0)`,
    })
    .from(transactionsTable)
    .where(eq(transactionsTable.userId, req.userId));

  const totalIncome = row?.totalIncome ?? 0;
  const totalExpenses = row?.totalExpenses ?? 0;
  const netBalance = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

  res.json({ totalIncome, totalExpenses, netBalance, savingsRate });
});

export default router;
