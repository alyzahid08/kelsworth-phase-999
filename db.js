const { Pool } = require("pg");

// Most hosted Postgres providers (Railway, Render, Supabase, etc.) require
// SSL but use a self-signed-style cert chain, hence rejectUnauthorized: false.
// If you run Postgres locally for testing, set PGSSL=disable in your .env.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.PGSSL === "disable"
      ? false
      : { rejectUnauthorized: false },
});

// Runs `fn` inside a single Postgres transaction using one dedicated
// connection, committing on success and rolling back on any error.
// Needed anywhere we check-then-update the same row (like stock counts)
// so two simultaneous orders can't both succeed against the last unit.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  withTransaction,
};
