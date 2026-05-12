import pg from "pg";

const pool = new pg.Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "DELETE, OPTIONS",
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "DELETE") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const id = event.queryStringParameters?.id;
  if (!id || isNaN(Number(id))) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing or invalid id" }) };
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      "DELETE FROM transactions WHERE id = $1 RETURNING id",
      [Number(id)]
    );
    if (result.rowCount === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: "Transaction not found" }) };
    }
    return { statusCode: 204, headers, body: "" };
  } catch (err) {
    console.error("Full error:", err.message, err.stack);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  } finally {
    client.release();
  }
};
