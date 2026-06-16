// SQLiteアクセスを集約する薄い層 (DESIGN 13-2)。
// ここだけ差し替えれば将来 Postgres などへ移行できる。
// Node 24 標準の node:sqlite を使用 — native ビルド不要。
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(join(DATA_DIR, 'app.db'));
db.exec('PRAGMA journal_mode = WAL;');   // 複数人化に備えた同時アクセス耐性 (DESIGN 13-2)
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT,
    person TEXT,
    phone TEXT NOT NULL,            -- E.164形式(+81...)に正規化して保存
    memo TEXT,
    status TEXT DEFAULT '未架電',   -- 未架電/不在/アポ獲得/NG/再架電
    next_call_at TEXT,              -- 再架電予定日時 (DESIGN 14-6)
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER REFERENCES contacts(id),
    mode TEXT NOT NULL,             -- 'ai' or 'manual'
    result TEXT,
    note TEXT,
    transcript TEXT,                -- AIモードの会話ログ(JSON文字列)
    analysis TEXT,                  -- ElevenLabsの評価結果(JSON文字列)
    el_conversation_id TEXT,
    twilio_call_sid TEXT,
    started_at TEXT,
    ended_at TEXT
  );

  CREATE TABLE IF NOT EXISTS scripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    body TEXT,
    is_active INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

export const VALID_STATUSES = ['未架電', '不在', 'アポ獲得', 'NG', '再架電'];

// ---- contacts ----
export const contactsRepo = {
  list({ status } = {}) {
    if (status) {
      return db.prepare('SELECT * FROM contacts WHERE status = ? ORDER BY id').all(status);
    }
    return db.prepare('SELECT * FROM contacts ORDER BY id').all();
  },

  get(id) {
    return db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  },

  create({ company, person, phone, memo }) {
    const r = db
      .prepare('INSERT INTO contacts (company, person, phone, memo) VALUES (?, ?, ?, ?)')
      .run(company ?? null, person ?? null, phone, memo ?? null);
    return contactsRepo.get(r.lastInsertRowid);
  },

  remove(id) {
    db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
  },

  callCount(id) {
    return db.prepare('SELECT COUNT(*) AS c FROM calls WHERE contact_id = ?').get(id).c;
  },

  // 既存の電話番号一覧(取込時の重複スキップ用)
  existingPhones() {
    return db.prepare('SELECT phone FROM contacts').all().map((r) => r.phone);
  },

  insertMany(rows) {
    // node:sqlite には better-sqlite3 の .transaction() が無いため手動で囲む
    const stmt = db.prepare(
      'INSERT INTO contacts (company, person, phone, memo) VALUES (?, ?, ?, ?)'
    );
    db.exec('BEGIN');
    try {
      for (const r of rows) stmt.run(r.company ?? null, r.person ?? null, r.phone, r.memo ?? null);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return rows.length;
  },

  update(id, fields) {
    const allowed = ['company', 'person', 'phone', 'memo', 'status', 'next_call_at'];
    const keys = Object.keys(fields).filter((k) => allowed.includes(k));
    if (keys.length === 0) return contactsRepo.get(id);
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => fields[k]);
    db.prepare(`UPDATE contacts SET ${setClause} WHERE id = ?`).run(...values, id);
    return contactsRepo.get(id);
  },

  statusSummary() {
    return db
      .prepare('SELECT status, COUNT(*) AS count FROM contacts GROUP BY status')
      .all();
  },
};

// ---- calls ----
export const callsRepo = {
  list() {
    return db
      .prepare(
        `SELECT calls.*, contacts.company, contacts.person, contacts.phone
         FROM calls LEFT JOIN contacts ON contacts.id = calls.contact_id
         ORDER BY calls.id DESC`
      )
      .all();
  },

  get(id) {
    return db.prepare('SELECT * FROM calls WHERE id = ?').get(id);
  },

  getByConversationId(conversationId) {
    return db.prepare('SELECT * FROM calls WHERE el_conversation_id = ?').get(conversationId);
  },

  // 当日(UTC)の架電件数。started_at は ISO/UTC 文字列なので前方一致で数える
  countToday(todayPrefix) {
    return db
      .prepare("SELECT COUNT(*) AS c FROM calls WHERE substr(started_at,1,10) = ?")
      .get(todayPrefix).c;
  },

  insert(call) {
    const r = db
      .prepare(
        `INSERT INTO calls (contact_id, mode, result, note, el_conversation_id, twilio_call_sid, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        call.contact_id,
        call.mode,
        call.result ?? null,
        call.note ?? null,
        call.el_conversation_id ?? null,
        call.twilio_call_sid ?? null,
        call.started_at ?? null
      );
    return callsRepo.get(r.lastInsertRowid);
  },

  update(id, fields) {
    const allowed = [
      'result', 'note', 'transcript', 'analysis',
      'el_conversation_id', 'twilio_call_sid', 'started_at', 'ended_at',
    ];
    const keys = Object.keys(fields).filter((k) => allowed.includes(k));
    if (keys.length === 0) return callsRepo.get(id);
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => fields[k]);
    db.prepare(`UPDATE calls SET ${setClause} WHERE id = ?`).run(...values, id);
    return callsRepo.get(id);
  },
};

// ---- scripts (手動モード用トークスクリプト) ----
export const scriptsRepo = {
  list() {
    return db.prepare('SELECT * FROM scripts ORDER BY id').all();
  },

  getActive() {
    return db.prepare('SELECT * FROM scripts WHERE is_active = 1 LIMIT 1').get();
  },

  upsert({ id, title, body, is_active }) {
    if (id) {
      db.prepare('UPDATE scripts SET title = ?, body = ?, is_active = ? WHERE id = ?').run(
        title, body, is_active ? 1 : 0, id
      );
      if (is_active) db.prepare('UPDATE scripts SET is_active = 0 WHERE id != ?').run(id);
      return db.prepare('SELECT * FROM scripts WHERE id = ?').get(id);
    }
    const r = db
      .prepare('INSERT INTO scripts (title, body, is_active) VALUES (?, ?, ?)')
      .run(title, body, is_active ? 1 : 0);
    if (is_active) db.prepare('UPDATE scripts SET is_active = 0 WHERE id != ?').run(r.lastInsertRowid);
    return db.prepare('SELECT * FROM scripts WHERE id = ?').get(r.lastInsertRowid);
  },
};

// ---- settings (キルスイッチ・架電上限など key-value) ----
export const settingsRepo = {
  get(key, fallback = null) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : fallback;
  },

  set(key, value) {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(key, String(value));
  },
};

export default db;
