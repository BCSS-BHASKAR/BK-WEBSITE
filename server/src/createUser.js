const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

async function createUser() {
  const host = process.env.DB_HOST || "127.0.0.1";
  const port = Number(process.env.DB_PORT || 3306);
  const dbUser = process.env.DB_USER || "aiserver";
  const dbPass = process.env.DB_PASSWORD || "aiserver";
  const dbName = process.env.DB_NAME || "aiserver";

  const email = "djshah@test.com";
  const rawPassword = "DJS@test01";
  const role = "admin";

  console.log(`Connecting to MySQL at ${host}:${port}...`);

  // Grant binary logging function creators permission as root if possible
  try {
    const rootConn = await mysql.createConnection({ host, port, user: "root", password: "" });
    await rootConn.query("SET GLOBAL log_bin_trust_function_creators = 1;");
    await rootConn.end();
    console.log("Set GLOBAL log_bin_trust_function_creators = 1.");
  } catch (err) {
    console.log("Note on log_bin_trust_function_creators:", err.message);
  }

  const conn = await mysql.createConnection({
    host,
    port,
    user: dbUser,
    password: dbPass,
    database: dbName,
  });

  const hash = await bcrypt.hash(rawPassword, 10);

  await conn.query(
    `INSERT INTO anpr_app_users (email, password_hash, role, must_change_password)
     VALUES (?, ?, ?, 0)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = VALUES(role), disabled_at = NULL`,
    [email.toLowerCase().trim(), hash, role]
  );

  console.log(`Successfully created/updated user '${email}' with role '${role}'.`);
  await conn.end();
}

createUser().catch((err) => {
  console.error("Failed to create user:", err);
  process.exit(1);
});
