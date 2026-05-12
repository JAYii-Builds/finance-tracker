import { Router, type IRouter } from "express";
import { db, transactionsTable, categoriesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  GetTransactionsQueryParams,
  CreateTransactionBody,
  UpdateTransactionBody,
  GetTransactionParams,
  UpdateTransactionParams,
  DeleteTransactionParams,
  GetTransactionsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const withCategory = db
  .select({
    id: transactionsTable.id,
    date: transactionsTable.date,
    amount: sql<number>`${transactionsTable.amount}::float`,
    description: transactionsTable.description,
    type: transactionsTable.type,
    categoryId: transactionsTable.categoryId,
    categoryName: categoriesTable.name,
    categoryColor: categoriesTable.color,
    categoryIcon: categoriesTable.icon,
  })
  .from(transactionsTable)
  .innerJoin(categoriesTable, eq(transactionsTable.categoryId, categoriesTable.id))
  .$dynamic();

router.get("/transactions", async (req, res): Promise<void> => {
  const query = GetTransactionsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { month, type, limit } = query.data;

  let q = withCategory.orderBy(sql`${transactionsTable.date} DESC`);

  if (month) {
    q = q.where(sql`to_char(${transactionsTable.date}, 'YYYY-MM') = ${month}`);
  }
  if (type) {
    q = q.where(eq(transactionsTable.type, type));
  }

  const rows = await q.limit(limit ?? 50);
  res.json(GetTransactionsResponse.parse(rows));
});

router.post("/transactions", async (req, res): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [tx] = await db.insert(transactionsTable).values(parsed.data).returning();
  const [full] = await withCategory.where(eq(transactionsTable.id, tx.id));
  res.status(201).json(full);
});

router.get("/transactions/:id", async (req, res): Promise<void> => {
  const params = GetTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [tx] = await withCategory.where(eq(transactionsTable.id, params.data.id));
  if (!tx) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  res.json(tx);
});

router.patch("/transactions/:id", async (req, res): Promise<void> => {
  const params = UpdateTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [tx] = await db
    .update(transactionsTable)
    .set(parsed.data)
    .where(eq(transactionsTable.id, params.data.id))
    .returning();
  if (!tx) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  const [full] = await withCategory.where(eq(transactionsTable.id, tx.id));
  res.json(full);
});

router.delete("/transactions/:id", async (req, res): Promise<void> => {
  const params = DeleteTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [tx] = await db
    .delete(transactionsTable)
    .where(eq(transactionsTable.id, params.data.id))
    .returning();
  if (!tx) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
