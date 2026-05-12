import pg from "pg";

const pool = new pg.Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const client = await pool.connect();

  try {
    if (event.httpMethod === "GET") {
      const result = await client.query(
        `SELECT id, description, amount::float, category, type, created_at AS "createdAt"
         FROM transactions ORDER BY created_at DESC`
      );
      return { statusCode: 200, headers, body: JSON.stringify(result.rows) };
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const { description, amount, category, type } = body;

      if (!description || amount == null || !category || !type) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing required fields: description, amount, category, type" }) };
      }
      if (!["income", "expense"].includes(type)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "type must be 'income' or 'expense'" }) };
      }

      const result = await client.query(
        `INSERT INTO transactions (description, amount, category, type)
         VALUES ($1, $2, $3, $4)
         RETURNING id, description, amount::float, category, type, created_at AS "createdAt"`,
        [description, amount, category, type]
      );
      return { statusCode: 201, headers, body: JSON.stringify(result.rows[0]) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (err) {
    console.error("Full error:", err.message, err.stack);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  } finally {
    client.release();
  }
};
