import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT
        COALESCE(SUM(CASE WHEN type = 'income'  THEN amount::float ELSE 0 END), 0) AS "totalIncome",
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount::float ELSE 0 END), 0) AS "totalExpenses"
       FROM transactions`
    );
    const { totalIncome, totalExpenses } = result.rows[0];
    const netBalance = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ totalIncome, totalExpenses, netBalance, savingsRate }),
    };
  } catch (err) {
    console.error("stats error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Internal server error" }) };
  } finally {
    client.release();
  }
};
