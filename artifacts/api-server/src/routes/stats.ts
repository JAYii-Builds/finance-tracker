import { Router, type IRouter } from "express";
import { db, transactionsTable, categoriesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  GetMonthlyStatsQueryParams,
  GetMonthlySummaryQueryParams,
  GetStatsByCategoryQueryParams,
  GetMonthlyStatsResponse,
  GetMonthlySummaryResponse,
  GetStatsByCategoryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/stats/monthly", async (req, res): Promise<void> => {
  const query = GetMonthlyStatsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const year = query.data.year ?? new Date().getFullYear();

  const rows = await db
    .select({
      month: sql<string>`to_char(${transactionsTable.date}, 'YYYY-MM')`,
      income: sql<number>`coalesce(sum(case when ${transactionsTable.type} = 'income' then ${transactionsTable.amount}::float else 0 end), 0)`,
      expenses: sql<number>`coalesce(sum(case when ${transactionsTable.type} = 'expense' then ${transactionsTable.amount}::float else 0 end), 0)`,
    })
    .from(transactionsTable)
    .where(sql`extract(year from ${transactionsTable.date}) = ${year}`)
    .groupBy(sql`to_char(${transactionsTable.date}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${transactionsTable.date}, 'YYYY-MM')`);

  const months: string[] = [];
  for (let m = 1; m <= 12; m++) {
    months.push(`${year}-${String(m).padStart(2, "0")}`);
  }

  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const result = months.map((m) => ({
    month: m,
    income: byMonth.get(m)?.income ?? 0,
    expenses: byMonth.get(m)?.expenses ?? 0,
  }));

  res.json(GetMonthlyStatsResponse.parse(result));
});

router.get("/stats/summary", async (req, res): Promise<void> => {
  const query = GetMonthlySummaryQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const now = new Date();
  const month =
    query.data.month ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [year, mon] = month.split("-").map(Number);
  const prevDate = new Date(year, mon - 2, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  const aggregate = async (m: string) => {
    const [row] = await db
      .select({
        income: sql<number>`coalesce(sum(case when ${transactionsTable.type} = 'income' then ${transactionsTable.amount}::float else 0 end), 0)`,
        expenses: sql<number>`coalesce(sum(case when ${transactionsTable.type} = 'expense' then ${transactionsTable.amount}::float else 0 end), 0)`,
      })
      .from(transactionsTable)
      .where(sql`to_char(${transactionsTable.date}, 'YYYY-MM') = ${m}`);
    return row ?? { income: 0, expenses: 0 };
  };

  const [curr, prev] = await Promise.all([aggregate(month), aggregate(prevMonth)]);

  const netSavings = curr.income - curr.expenses;
  const savingsRate = curr.income > 0 ? (netSavings / curr.income) * 100 : 0;

  const summary = {
    month,
    totalIncome: curr.income,
    totalExpenses: curr.expenses,
    netSavings,
    savingsRate,
    prevMonthIncome: prev.income,
    prevMonthExpenses: prev.expenses,
  };

  res.json(GetMonthlySummaryResponse.parse(summary));
});

router.get("/stats/by-category", async (req, res): Promise<void> => {
  const query = GetStatsByCategoryQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const now = new Date();
  const month =
    query.data.month ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const rows = await db
    .select({
      categoryId: categoriesTable.id,
      categoryName: categoriesTable.name,
      categoryColor: categoriesTable.color,
      categoryIcon: categoriesTable.icon,
      total: sql<number>`coalesce(sum(${transactionsTable.amount}::float), 0)`,
    })
    .from(transactionsTable)
    .innerJoin(categoriesTable, eq(transactionsTable.categoryId, categoriesTable.id))
    .where(
      sql`to_char(${transactionsTable.date}, 'YYYY-MM') = ${month} and ${transactionsTable.type} = 'expense'`
    )
    .groupBy(categoriesTable.id, categoriesTable.name, categoriesTable.color, categoriesTable.icon)
    .orderBy(sql`sum(${transactionsTable.amount}::float) desc`);

  const grandTotal = rows.reduce((acc, r) => acc + r.total, 0);
  const result = rows.map((r) => ({
    ...r,
    percentage: grandTotal > 0 ? (r.total / grandTotal) * 100 : 0,
  }));

  res.json(GetStatsByCategoryResponse.parse(result));
});

export default router;
