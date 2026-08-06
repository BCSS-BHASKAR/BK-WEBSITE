const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

// The .sql files are already PostgreSQL-native, so they go straight to a raw
// pg Client rather than through the mysql2-compatibility shim in db.js.
async function initDb() {
  const host = process.env.DB_HOST || "127.0.0.1";
  const port = Number(process.env.DB_PORT || 5432);
  const dbUser = process.env.DB_USER || "aiserver";
  const dbPass = process.env.DB_PASSWORD || "aiserver";
  const dbName = process.env.DB_NAME || "aiserver";

  const adminUser = process.env.DB_ADMIN_USER || "postgres";
  const adminPass = process.env.DB_ADMIN_PASSWORD || "";
  const adminDb = process.env.DB_ADMIN_DB || "postgres";

  console.log(`Connecting to PostgreSQL at ${host}:${port}...`);

  // Attempt connection as a superuser first to create the role and database.
  // Postgres has no CREATE {DATABASE,ROLE} IF NOT EXISTS, and CREATE DATABASE
  // cannot run inside a transaction, so each is guarded by a catalogue lookup.
  try {
    const admin = new Client({ host, port, user: adminUser, password: adminPass, database: adminDb });
    await admin.connect();
    console.log(`Connected to PostgreSQL as '${adminUser}'.`);

    const { rows: roles } = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [dbUser]);
    if (!roles.length) {
      await admin.query(`CREATE ROLE ${quoteIdent(dbUser)} LOGIN PASSWORD ${quoteLiteral(dbPass)}`);
      console.log(`Created role '${dbUser}'.`);
    }

    const { rows: dbs } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (!dbs.length) {
      await admin.query(`CREATE DATABASE ${quoteIdent(dbName)} OWNER ${quoteIdent(dbUser)}`);
      console.log(`Created database '${dbName}'.`);
    }

    await admin.query(`GRANT ALL PRIVILEGES ON DATABASE ${quoteIdent(dbName)} TO ${quoteIdent(dbUser)}`);
    await admin.end();
    console.log(`Ensured database '${dbName}' and role '${dbUser}' exist.`);
  } catch (err) {
    console.log("Superuser pre-step info (attempting direct target login):", err.message);
  }

  // Connect to target database and run seed scripts.
  const target = new Client({ host, port, user: dbUser, password: dbPass, database: dbName });
  await target.connect();

  // The role needs to create objects in the public schema; on PostgreSQL 15+
  // public is no longer writable by every role by default.
  try {
    await target.query(`GRANT ALL ON SCHEMA public TO ${quoteIdent(dbUser)}`);
  } catch (err) {
    console.log("Schema grant skipped:", err.message);
  }

  console.log(`Connected to database '${dbName}' as role '${dbUser}'. Seeding tables and data...`);

  for (const file of ["dev_bootstrap.sql", "assistant_chat_audit.sql"]) {
    const full = path.join(__dirname, "..", "sql", file);
    if (!fs.existsSync(full)) continue;
    await target.query(fs.readFileSync(full, "utf8"));
    console.log(`[DB] Seeded ${file} successfully.`);
  }

  await target.end();
  console.log("Database initialization complete!");
}

initDb().catch((err) => {
  console.error("Database initialization failed:", err);
  process.exit(1);
});
