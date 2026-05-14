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
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function getUserId(event) {
  const token = event.headers.authorization?.replace("Bearer ", "");
  if (!token) throw new Error("Unauthorized");
  const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
  return payload.sub;
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  try {
    const userId = await getUserId(event);
    const client = await pool.connect();
    try {
      if (event.httpMethod === "GET") {
        const result = await client.query(
          `SELECT id, description, amount::float, category, type, notes, recurring, created_at AS "createdAt"
           FROM transactions WHERE user_id = $1 ORDER BY created_at DESC`,
          [userId]
        );
        return { statusCode: 200, headers, body: JSON.stringify(result.rows || []) };
      }
      if (event.httpMethod === "POST") {
        const body = JSON.parse(event.body || "{}");
        const { description, amount, category, type, notes, recurring } = body;
        if (!description || amount == null || !category || !type) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing fields" }) };
        }
        const result = await client.query(
          `INSERT INTO transactions (description, amount, category, type, user_id, notes, recurring)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, description, amount::float, category, type, notes, recurring, created_at AS "createdAt"`,
          [description, amount, category, type, userId, notes || "", recurring || false]
        );
        return { statusCode: 201, headers, body: JSON.stringify(result.rows[0]) };
      }
      return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
    } finally {
      client.release();
    }
  } catch (err) {
    const status = err.message === "Unauthorized" ? 401 : 500;
    return { statusCode: status, headers, body: JSON.stringify({ error: err.message }) };
  }
};
