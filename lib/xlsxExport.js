// 行データ(日本語キー=見出し)を .xlsx の Buffer に変換する。
import * as XLSX from 'xlsx';

export function toXlsxBuffer(rows, sheetName = 'Sheet1') {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
