const { Pool, types } = require("pg");

// mysql2 hands BIGINT/COUNT(*) back as JS numbers; node-postgres defaults to
// strings for int8. Match the old behaviour so callers keep doing arithmetic
// on aggregates without casting. NUMERIC/DECIMAL stays a string, which is what
// mysql2 did too.
types.setTypeParser(types.builtins.INT8, (v) => (v === null ? null : Number(v)));

function required(name, val) {
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

const SSL_MODES = new Set(["1", "true", "require", "yes", "on"]);

function sslConfig() {
  const raw = String(process.env.DB_SSL || "").trim().toLowerCase();
  if (!SSL_MODES.has(raw)) return false;
  // Managed Postgres (RDS/Supabase/Neon) terminates TLS with a chain the
  // container often lacks; DB_SSL_REJECT_UNAUTHORIZED=1 opts back into strict.
  const strict = String(process.env.DB_SSL_REJECT_UNAUTHORIZED || "").trim() === "1";
  return { rejectUnauthorized: strict };
}

const pgPool = new Pool({
  host: required("DB_HOST", process.env.DB_HOST),
  port: Number(process.env.DB_PORT || 5432),
  user: required("DB_USER", process.env.DB_USER),
  password: required("DB_PASSWORD", process.env.DB_PASSWORD),
  database: required("DB_NAME", process.env.DB_NAME),
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: sslConfig(),
  // Pin the session clock instead of inheriting postgresql.conf.
  //
  // Several date filters build their bounds with AT TIME ZONE, and one overload
  // of that operator returns a value that depends on the session TimeZone. Those
  // call sites are now written to be session-independent, but leaving the
  // session unpinned means the whole app's date handling silently changes if
  // the server's timezone setting is ever edited. Stating it here makes the
  // assumption explicit and reproducible across environments.
  options: "-c TimeZone=UTC",
});

pgPool.on("error", (err) => {
  console.error("[DB] Idle client error:", err.message || err);
});

// ---------------------------------------------------------------------------
// SQL translation
//
// The codebase was written against mysql2: `?` placeholders, array expansion
// for `IN (?)`, and backtick-quoted identifiers. Rather than touch every one of
// the ~200 call sites, rewrite the statement on the way to the driver.
// ---------------------------------------------------------------------------

/**
 * Rewrite mysql2-flavoured SQL into node-postgres form.
 *
 * - `?`            -> `$1`, `$2`, ...
 * - `?` + an array -> `$1, $2, $3` (mysql2's `IN (?)` expansion)
 * - `` `ident` ``  -> `"ident"`
 *
 * The scanner skips string literals, dollar-quoted bodies, quoted identifiers
 * and comments so a `?` or backtick inside them is left alone.
 */
function toPgSql(sql, params) {
  const values = [];
  const src = String(sql);
  const n = src.length;
  let out = "";
  let paramIndex = 0;
  let i = 0;

  while (i < n) {
    const ch = src[i];

    // Single-quoted literal. Postgres runs with standard_conforming_strings on,
    // so the only escape is a doubled quote.
    if (ch === "'") {
      let j = i + 1;
      while (j < n) {
        if (src[j] === "'") {
          if (src[j + 1] === "'") { j += 2; continue; }
          break;
        }
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    // Double-quoted identifier.
    if (ch === '"') {
      let j = i + 1;
      while (j < n) {
        if (src[j] === '"') {
          if (src[j + 1] === '"') { j += 2; continue; }
          break;
        }
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    // Backtick identifier -> standard quoted identifier.
    if (ch === "`") {
      const end = src.indexOf("`", i + 1);
      const stop = end === -1 ? n : end;
      out += `"${src.slice(i + 1, stop)}"`;
      i = stop + 1;
      continue;
    }

    // Dollar-quoted body ($$ ... $$ / $tag$ ... $tag$), used by plpgsql
    // function bodies in the migrations.
    if (ch === "$") {
      const tag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(src.slice(i));
      if (tag) {
        const marker = tag[0];
        const end = src.indexOf(marker, i + marker.length);
        const stop = end === -1 ? n : end + marker.length;
        out += src.slice(i, stop);
        i = stop;
        continue;
      }
    }

    // Line comment.
    if (ch === "-" && src[i + 1] === "-") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      out += src.slice(i, stop);
      i = stop;
      continue;
    }

    // Block comment (Postgres nests them).
    if (ch === "/" && src[i + 1] === "*") {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (src[j] === "/" && src[j + 1] === "*") { depth++; j += 2; continue; }
        if (src[j] === "*" && src[j + 1] === "/") { depth--; j += 2; continue; }
        j++;
      }
      out += src.slice(i, j);
      i = j;
      continue;
    }

    if (ch === "?") {
      const value = params[paramIndex++];
      if (Array.isArray(value)) {
        if (value.length === 0) {
          // mysql2 renders an empty `IN (?)` as `IN (NULL)`: matches nothing.
          out += "NULL";
        } else {
          out += value.map((v) => `$${values.push(v)}`).join(", ");
        }
      } else {
        out += `$${values.push(value)}`;
      }
      i++;
      continue;
    }

    out += ch;
    i++;
  }

  return { text: out, values };
}

const ROW_COMMANDS = new Set(["SELECT", "SHOW", "EXPLAIN", "WITH"]);

/**
 * Reshape a pg result into what mysql2 callers expect: an array of rows for
 * reads, an OkPacket-ish object for writes.
 */
function shapeResult(res) {
  if (!res) return [];
  if (ROW_COMMANDS.has(res.command)) return res.rows;
  return {
    affectedRows: res.rowCount || 0,
    // Only populated when the statement carries a `RETURNING id`.
    insertId: res.rows && res.rows.length ? res.rows[0].id : 0,
    rows: res.rows || [],
  };
}

async function runQuery(runner, sql, params) {
  const { text, values } = toPgSql(sql, params || []);
  // pg only accepts multiple statements over the simple protocol, i.e. when no
  // bind parameters are present — the same restriction mysql2's
  // multipleStatements had. It then returns one result per statement.
  const res = values.length ? await runner.query(text, values) : await runner.query(text);
  const last = Array.isArray(res) ? res[res.length - 1] : res;
  return [shapeResult(last), (last && last.fields) || []];
}

/** Pool exposing the subset of the mysql2 promise API this codebase uses. */
const pool = {
  query: (sql, params) => runQuery(pgPool, sql, params),
  // mysql2's execute() forced a prepared statement; pg parameterises anyway.
  execute: (sql, params) => runQuery(pgPool, sql, params),

  /** Checked-out connection, for multi-statement transactions. */
  async getConnection() {
    const client = await pgPool.connect();
    let released = false;
    return {
      query: (sql, params) => runQuery(client, sql, params),
      execute: (sql, params) => runQuery(client, sql, params),
      beginTransaction: () => client.query("BEGIN"),
      commit: () => client.query("COMMIT"),
      rollback: () => client.query("ROLLBACK"),
      release() {
        if (released) return;
        released = true;
        client.release();
      },
    };
  },

  end: () => pgPool.end(),
};

module.exports = { pool, pgPool, toPgSql };
