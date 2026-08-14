const path = require("path");
const { Client } = require("pg");
const bcrypt = require("bcrypt");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

async function createUser() {
  const host = process.env.DB_HOST || "127.0.0.1";
  const port = Number(process.env.DB_PORT || 5432);
  const dbUser = process.env.DB_USER || "aiserver";
  const dbPass = process.env.DB_PASSWORD || "aiserver";
  const dbName = process.env.DB_NAME || "aiserver";

  const email = "djshah@test.com";
  const rawPassword = "DJS@test01";
  const role = "admin";

  console.log(`Connecting to PostgreSQL at ${host}:${port}...`);

  // The MySQL build had to set log_bin_trust_function_creators here before it
  // could create functions; PostgreSQL has no equivalent requirement.
  const client = new Client({ host, port, user: dbUser, password: dbPass, database: dbName });
  await client.connect();

  const hash = await bcrypt.hash(rawPassword, 10);

  await client.query(
    `INSERT INTO anpr_app_users (email, password_hash, role, must_change_password)
     VALUES ($1, $2, $3, 0)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       disabled_at = NULL`,
    [email.toLowerCase().trim(), hash, role]
  );

  console.log(`Successfully created/updated user '${email}' with role '${role}'.`);
  await client.end();
}

createUser().catch((err) => {
  console.error("Failed to create user:", err);
  process.exit(1);
});
