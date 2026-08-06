const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

async function initDb() {
  const host = process.env.DB_HOST || "127.0.0.1";
  const port = Number(process.env.DB_PORT || 3306);
  const dbUser = process.env.DB_USER || "aiserver";
  const dbPass = process.env.DB_PASSWORD || "aiserver";
  const dbName = process.env.DB_NAME || "aiserver";

  console.log(`Connecting to MySQL at ${host}:${port}...`);
  
  // Attempt connection as root first to create database and user if needed
  try {
    const rootConn = await mysql.createConnection({ host, port, user: "root", password: "", multipleStatements: true });
    console.log("Connected to MySQL as root without password.");
    await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
    await rootConn.query(`CREATE USER IF NOT EXISTS '${dbUser}'@'%' IDENTIFIED BY '${dbPass}';`);
    await rootConn.query(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'%';`);
    await rootConn.query(`CREATE USER IF NOT EXISTS '${dbUser}'@'localhost' IDENTIFIED BY '${dbPass}';`);
    await rootConn.query(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'localhost';`);
    await rootConn.query(`FLUSH PRIVILEGES;`);
    await rootConn.end();
    console.log(`Ensured database '${dbName}' and user '${dbUser}' exist.`);
  } catch (err) {
    console.log("Root pre-step info (attempting direct target login):", err.message);
  }

  // Connect to target database and run seed scripts
  const targetConn = await mysql.createConnection({
    host,
    port,
    user: dbUser,
    password: dbPass,
    database: dbName,
    multipleStatements: true,
  });

  console.log(`Connected to database '${dbName}' as user '${dbUser}'. Seeding tables and data...`);

  const devBootstrapPath = path.join(__dirname, "..", "sql", "dev_bootstrap.sql");
  if (fs.existsSync(devBootstrapPath)) {
    const devBootstrapSql = fs.readFileSync(devBootstrapPath, "utf8");
    await targetConn.query(devBootstrapSql);
    console.log("[DB] Seeded dev_bootstrap.sql successfully.");
  }

  const auditSqlPath = path.join(__dirname, "..", "sql", "assistant_chat_audit.sql");
  if (fs.existsSync(auditSqlPath)) {
    const auditSql = fs.readFileSync(auditSqlPath, "utf8");
    await targetConn.query(auditSql);
    console.log("[DB] Seeded assistant_chat_audit.sql successfully.");
  }

  await targetConn.end();
  console.log("Database initialization complete!");
}

initDb().catch((err) => {
  console.error("Database initialization failed:", err);
  process.exit(1);
});
