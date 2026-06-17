// 電話番号の正規化。Excel由来の汚いデータを E.164(+81...) に変換する。
// 想定する汚れ: 先頭0落ち / 科学記法 / 全角数字 / ハイフン・括弧・空白 / 内線表記。
import { parsePhoneNumberFromString } from 'libphonenumber-js';

function toHalfWidth(s) {
  return s.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ');
}

function stripExtension(s) {
  return s.split(/内線|ext\.?|x|（|\(/i)[0];
}

export function normalizePhone(raw) {
  const original = String(raw ?? '').trim();
  if (!original) return { ok: false, raw: original, reason: '空' };

  let s = toHalfWidth(original);

  if (/^\d+(\.\d+)?[eE]\+?\d+$/.test(s.replace(/\s/g, ''))) {
    const n = Number(s.replace(/\s/g, ''));
    if (Number.isFinite(n)) s = String(Math.round(n));
  }

  s = stripExtension(s);
  const hasPlus = s.trim().startsWith('+');
  let digits = s.replace(/[^\d]/g, '');
  if (hasPlus) digits = '+' + digits;

  if (!hasPlus && !digits.startsWith('0') && digits.length >= 9 && digits.length <= 10) {
    digits = '0' + digits;
  }

  const parsed = parsePhoneNumberFromString(digits, 'JP');
  if (!parsed || !parsed.isValid()) {
    return { ok: false, raw: original, reason: '番号として不正' };
  }
  return { ok: true, e164: parsed.number, raw: original };
}
