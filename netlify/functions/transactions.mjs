import pg from "pg";
import { verifyToken } from "@clerk/backend";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

async function getUserId(event) {
  const token = event.headers.authorization?.replace("Bearer ", "");
  if (!token) throw new Error("Unauthorized");
  const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
  return payload.sub;
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
return { statusCode: 200, headers, body: JSON.stringify(result.rows || []) };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  try {
    const userId = await getUserId(event);
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT
          COALESCE(SUM(CASE WHEN type = 'income'  THEN amount::float ELSE 0 END), 0) AS "totalIncome",
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount::float ELSE 0 END), 0) AS "totalExpenses"
         FROM transactions WHERE user_id = $1`,
        [userId]
      );
      const { totalIncome, totalExpenses } = result.rows[0];
      const netBalance = totalIncome - totalExpenses;
      const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;
      return { statusCode: 200, headers, body: JSON.stringify({ totalIncome, totalExpenses, netBalance, savingsRate }) };
    } finally {
      client.release();
    }
  } catch (err) {
    const status = err.message === "Unauthorized" ? 401 : 500;
    return { statusCode: status, headers, body: JSON.stringify({ error: err.message }) };
  }
};
