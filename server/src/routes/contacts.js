import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { contactsRepo, VALID_STATUSES } from '../db.js';
import { normalizePhone } from '../lib/phone.js';

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

  const commit = req.query.commit === 'true';
  if (!commit) {
    return res.json({ preview: true, validCount: valid.length, invalidCount: invalid.length, valid, invalid });
  }

  const inserted = contactsRepo.insertMany(valid.map(({ rawPhone, ...rest }) => rest));
  res.json({ preview: false, inserted, skipped: invalid.length, invalid });
});

// GET /api/contacts?status=未架電
router.get('/', (req, res) => {
  res.json(contactsRepo.list({ status: req.query.status }));
});

// GET /api/contacts/summary — ステータス別件数
router.get('/summary', (req, res) => {
  res.json(contactsRepo.statusSummary());
});

// PATCH /api/contacts/:id — ステータス・メモ等の更新
router.patch('/:id', (req, res) => {
  const contact = contactsRepo.get(Number(req.params.id));
  if (!contact) return res.status(404).json({ error: 'not found' });

  if (req.body.status && !VALID_STATUSES.includes(req.body.status)) {
    return res.status(400).json({ error: `status は ${VALID_STATUSES.join('/')} のいずれか` });
  }
  res.json(contactsRepo.update(contact.id, req.body));
});

export default router;
