import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { contactsRepo, VALID_STATUSES } from '../db.js';
import { normalizePhone } from '../lib/phone.js';
import { toXlsxBuffer, sendXlsx } from '../lib/xlsxExport.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ヘッダ名のゆらぎを吸収するためのエイリアス
const COLUMN_ALIASES = {
  company: ['会社名', '会社', '企業名', 'company'],
  person: ['担当者名', '担当者', '担当', '氏名', '名前', 'person', 'name'],
  phone: ['電話番号', '電話', 'tel', 'phone', 'phone_number', '番号'],
  memo: ['メモ', '備考', 'note', 'memo'],
};

function detectKey(header) {
  const h = String(header ?? '').trim().toLowerCase();
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.some((a) => a.toLowerCase() === h)) return key;
  }
  return null;
}

// Excel/CSV をパースして {company, person, phone(raw), memo} の配列に変換
function parseSheet(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  // 先頭0落ちを避けるため defval を文字列で受ける
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  if (rows.length === 0) return [];

  const headerRow = rows[0];
  const mapping = {};
  headerRow.forEach((h, idx) => {
    const key = detectKey(h);
    if (key) mapping[key] = idx;
  });

  // ヘッダが認識できない場合は列固定(会社名/担当者名/電話番号/メモ)にフォールバック
  if (mapping.phone === undefined) {
    return rows.slice(1).map((r) => ({
      company: r[0], person: r[1], phone: r[2], memo: r[3],
    }));
  }

  return rows.slice(1).map((r) => ({
    company: mapping.company !== undefined ? r[mapping.company] : null,
    person: mapping.person !== undefined ? r[mapping.person] : null,
    phone: r[mapping.phone],
    memo: mapping.memo !== undefined ? r[mapping.memo] : null,
  }));
}

// POST /api/contacts/import — Excelアップロード(プレビュー or 確定)
// ?commit=true で実際にDB保存。未指定なら正規化結果のプレビューのみ返す (DESIGN 14-6)
router.post('/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file がありません' });

  let raw;
  try {
    raw = parseSheet(req.file.buffer);
  } catch (e) {
    return res.status(400).json({ error: 'Excelの解析に失敗しました', detail: String(e.message) });
  }

  const valid = [];
  const invalid = [];
  for (const row of raw) {
    if (!row.phone && !row.company && !row.person) continue; // 空行スキップ
    const n = normalizePhone(row.phone);
    if (n.ok) {
      valid.push({ company: row.company || null, person: row.person || null, phone: n.e164, memo: row.memo || null, rawPhone: n.raw });
    } else {
      invalid.push({ company: row.company || null, person: row.person || null, rawPhone: n.raw, reason: n.reason });
    }
  }

  // 重複番号(DB既存 + ファイル内重複)を分けておく
  const existing = new Set(contactsRepo.existingPhones());
  const seen = new Set();
  const fresh = [];
  const duplicates = [];
  for (const v of valid) {
    if (existing.has(v.phone) || seen.has(v.phone)) {
      duplicates.push(v);
    } else {
      seen.add(v.phone);
      fresh.push(v);
    }
  }

  const commit = req.query.commit === 'true';
  if (!commit) {
    return res.json({
      preview: true,
      validCount: fresh.length,
      duplicateCount: duplicates.length,
      invalidCount: invalid.length,
      valid: fresh, duplicates, invalid,
    });
  }

  const inserted = contactsRepo.insertMany(fresh.map(({ rawPhone, ...rest }) => rest));
  res.json({ preview: false, inserted, duplicateSkipped: duplicates.length, invalidSkipped: invalid.length, invalid });
});

// GET /api/contacts?status=未架電
router.get('/', (req, res) => {
  res.json(contactsRepo.list({ status: req.query.status }));
});

// POST /api/contacts — 1件手動追加(電話番号を正規化)
router.post('/', (req, res) => {
  const { company, person, memo } = req.body;
  const n = normalizePhone(req.body.phone);
  if (!n.ok) return res.status(400).json({ error: `電話番号が不正です: ${n.reason}` });
  if (contactsRepo.existingPhones().includes(n.e164)) {
    return res.status(409).json({ error: 'この電話番号は既に登録されています' });
  }
  res.status(201).json(contactsRepo.create({ company, person, phone: n.e164, memo }));
});

// DELETE /api/contacts/:id — 架電履歴がある場合は安全のため拒否
router.delete('/:id', (req, res) => {
  const contact = contactsRepo.get(Number(req.params.id));
  if (!contact) return res.status(404).json({ error: 'not found' });
  if (contactsRepo.callCount(contact.id) > 0) {
    return res.status(409).json({ error: '架電履歴があるため削除できません（履歴を残すため）' });
  }
  contactsRepo.remove(contact.id);
  res.status(204).end();
});

// GET /api/contacts/summary — ステータス別件数
router.get('/summary', (req, res) => {
  res.json(contactsRepo.statusSummary());
});

// GET /api/contacts/export — 連絡先一覧をExcel出力
router.get('/export', (req, res) => {
  const rows = contactsRepo.list({ status: req.query.status }).map((c) => ({
    会社名: c.company || '',
    担当者: c.person || '',
    電話番号: c.phone || '',
    ステータス: c.status || '',
    再架電予定: c.next_call_at || '',
    メモ: c.memo || '',
    登録日時: c.created_at || '',
  }));
  const date = new Date().toISOString().slice(0, 10);
  sendXlsx(res, toXlsxBuffer(rows, '連絡先'), `contacts_${date}.xlsx`);
});

// PATCH /api/contacts/:id — ステータス・メモ等の更新
router.patch('/:id', (req, res) => {
  const contact = contactsRepo.get(Number(req.params.id));
  if (!contact) return res.status(404).json({ error: 'not found' });

  if (req.body.status && !VALID_STATUSES.includes(req.body.status)) {
    return res.status(400).json({ error: `status は ${VALID_STATUSES.join('/')} のいずれか` });
  }

  const fields = { ...req.body };
  // 電話番号を編集する場合は正規化してから保存
  if (fields.phone !== undefined) {
    const n = normalizePhone(fields.phone);
    if (!n.ok) return res.status(400).json({ error: `電話番号が不正です: ${n.reason}` });
    fields.phone = n.e164;
  }
  res.json(contactsRepo.update(contact.id, fields));
});

export default router;
