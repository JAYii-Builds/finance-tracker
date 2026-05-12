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
  "Access-Control-Allow-Methods": "DELETE, OPTIONS",
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
  if (event.httpMethod !== "DELETE") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  try {
    const userId = await getUserId(event);
    const id = event.queryStringParameters?.id;
    if (!id || isNaN(Number(id))) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing or invalid id" }) };
    }
    const client = await pool.connect();
    try {
      const result = await client.query(
        "DELETE FROM transactions WHERE id = $1 AND user_id = $2 RETURNING id",
        [Number(id), userId]
      );
      if (result.rowCount === 0) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "Transaction not found" }) };
      }
      return { statusCode: 204, headers, body: "" };
    } finally {
      client.release();
    }
  } catch (err) {
    const status = err.message === "Unauthorized" ? 401 : 500;
    return { statusCode: status, headers, body: JSON.stringify({ error: err.message }) };
  }
};
