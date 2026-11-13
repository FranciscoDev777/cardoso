const { DatabaseSync } = require("node:sqlite");
const { randomBytes, scryptSync } = require("node:crypto");
const path = require("node:path");

const db = new DatabaseSync(path.join(__dirname, "cardoso.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS staff_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS staff_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES staff_users(id)
  );
`);

function configurarUsuario(username, role, password) {
  const salt = randomBytes(16).toString("hex");

  const hash = scryptSync(password, salt, 64).toString("hex");

  db.prepare(
    `
    INSERT INTO staff_users
      (username, role, password_hash, salt)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(username)
    DO UPDATE SET
      role = excluded.role,
      password_hash = excluded.password_hash,
      salt = excluded.salt
  `,
  ).run(username, role, hash, salt);

  console.log(`Usuário ${username} configurado!`);
}

try {
  db.exec("BEGIN IMMEDIATE");

  configurarUsuario("dono", "owner", "elisangela123");
  configurarUsuario("cozinha", "staff", "elisangela123");

  // Encerra sessões anteriores dos dois usuários.
  db.prepare(
    `
    DELETE FROM staff_sessions
    WHERE user_id IN (
      SELECT id FROM staff_users
      WHERE username IN ('dono', 'cozinha')
    )
  `,
  ).run();

  db.exec("COMMIT");

  console.log("Contas configuradas com sucesso!");
} catch (error) {
  db.exec("ROLLBACK");
  console.error("Erro ao configurar usuários:", error);
  process.exitCode = 1;
} finally {
  db.close();
}
