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

// Excel/CSV を「ヘッダー + 生の行配列」として読む。マッピングは別で行う。
function parseSheet(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  // 先頭0落ちを避けるため defval を文字列で受ける
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = (rows[0] || []).map((h) => String(h ?? '').trim());
  return { headers, rows: rows.slice(1) };
}

// ヘッダーから各項目の列を自動推定する（別名の完全一致 → ダメなら先頭固定）
function suggestMapping(headers) {
  const mapping = { company: null, person: null, phone: null, memo: null };
  headers.forEach((h, idx) => {
    const key = detectKey(h);
    if (key && mapping[key] === null) mapping[key] = idx;
  });
  if (Object.values(mapping).every((v) => v === null)) {
    if (headers.length > 0) mapping.company = 0;
    if (headers.length > 1) mapping.person = 1;
    if (headers.length > 2) mapping.phone = 2;
    if (headers.length > 3) mapping.memo = 3;
  }
  return mapping;
}

// マッピング(項目→列index)を行に適用して {company,person,phone,memo} を作る
function applyMapping(rows, mapping) {
  const at = (row, idx) => (idx === null || idx === undefined ? null : (row[idx] ?? null));
  return rows.map((r) => ({
    company: at(r, mapping.company),
    person: at(r, mapping.person),
    phone: at(r, mapping.phone),
    memo: at(r, mapping.memo),
  }));
}

// POST /api/contacts/import — Excelアップロード(プレビュー or 確定)
// body.mapping(JSON)で列マッピングを指定可。未指定なら自動推定 (DESIGN 14-6)
router.post('/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file がありません' });

  let parsed;
  try {
    parsed = parseSheet(req.file.buffer);
  } catch (e) {
    return res.status(400).json({ error: 'Excelの解析に失敗しました', detail: String(e.message) });
  }
  const { headers, rows } = parsed;
  if (headers.length === 0) return res.status(400).json({ error: 'ヘッダー行が見つかりません' });

  let mapping;
  if (req.body.mapping) {
    try { mapping = JSON.parse(req.body.mapping); }
    catch { return res.status(400).json({ error: 'mappingのJSONが不正です' }); }
  } else {
    mapping = suggestMapping(headers);
  }

  const records = applyMapping(rows, mapping);

  const valid = [];
  const invalid = [];
  for (const row of records) {
    if (!row.phone && !row.company && !row.person) continue; // 空行スキップ
    const n = normalizePhone(row.phone);
    if (n.ok) {
      valid.push({ company: row.company || null, person: row.person || null, phone: n.e164, memo: row.memo || null });
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
    if (existing.has(v.phone) || seen.has(v.phone)) duplicates.push(v);
    else { seen.add(v.phone); fresh.push(v); }
  }

  const commit = req.query.commit === 'true';
  if (!commit) {
    return res.json({
      preview: true,
      headers,
      sampleData: rows.slice(0, 5).map((r) => headers.map((_, i) => String(r[i] ?? ''))),
      mapping,
      phoneMissing: mapping.phone === null || mapping.phone === undefined,
      validCount: fresh.length,
      duplicateCount: duplicates.length,
      invalidCount: invalid.length,
      invalid,
    });
  }

  if (mapping.phone === null || mapping.phone === undefined) {
    return res.status(400).json({ error: '電話番号の列が指定されていません' });
  }
  const inserted = contactsRepo.insertMany(fresh);
  res.json({ preview: false, inserted, duplicateSkipped: duplicates.length, invalidSkipped: invalid.length });
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
