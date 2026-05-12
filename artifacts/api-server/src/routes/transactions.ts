import { Router, type IRouter } from "express";
import { db, transactionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreateTransactionBody, DeleteTransactionParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/transactions", async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: transactionsTable.id,
      description: transactionsTable.description,
      amount: sql<number>`${transactionsTable.amount}::float`,
      category: transactionsTable.category,
      type: transactionsTable.type,
      createdAt: transactionsTable.createdAt,
    })
    .from(transactionsTable)
    .orderBy(sql`${transactionsTable.createdAt} DESC`);

  res.json(rows);
});

router.post("/transactions", async (req, res): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [tx] = await db
    .insert(transactionsTable)
    .values({
      description: parsed.data.description,
      amount: String(parsed.data.amount),
      category: parsed.data.category,
      type: parsed.data.type,
    })
    .returning({
      id: transactionsTable.id,
      description: transactionsTable.description,
      amount: sql<number>`${transactionsTable.amount}::float`,
      category: transactionsTable.category,
      type: transactionsTable.type,
      createdAt: transactionsTable.createdAt,
    });
  res.status(201).json(tx);
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
