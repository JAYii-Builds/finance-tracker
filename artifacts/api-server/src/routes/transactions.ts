import { Router, type IRouter } from "express";
import { db, transactionsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { CreateTransactionBody, DeleteTransactionParams } from "@workspace/api-zod";

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

router.get("/transactions", requireAuth, async (req: any, res): Promise<void> => {
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
    .where(eq(transactionsTable.userId, req.userId))
    .orderBy(sql`${transactionsTable.createdAt} DESC`);

  res.json(rows);
});

router.post("/transactions", requireAuth, async (req: any, res): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [tx] = await db
    .insert(transactionsTable)
    .values({
      userId: req.userId,
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

router.delete("/transactions/:id", requireAuth, async (req: any, res): Promise<void> => {
  const params = DeleteTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [tx] = await db
    .delete(transactionsTable)
    .where(and(eq(transactionsTable.id, params.data.id), eq(transactionsTable.userId, req.userId)))
    .returning();
  if (!tx) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
