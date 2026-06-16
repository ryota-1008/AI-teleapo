import { useState } from 'react';
import { api } from '../api.js';

// 連絡先の手動追加・編集 (DESIGN 2-1)。contact が無ければ新規作成モード。
export default function ContactEditModal({ contact, onClose, onSaved }) {
  const isNew = !contact;
  const [form, setForm] = useState({
    company: contact?.company || '',
    person: contact?.person || '',
    phone: contact?.phone || '',
    memo: contact?.memo || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.phone.trim()) { setError('電話番号は必須です'); return; }
    setSaving(true);
    setError('');
    try {
      if (isNew) await api.createContact(form);
      else await api.updateContact(contact.id, form);
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{isNew ? '連絡先を追加' : '連絡先を編集'}</div>
        </div>

        {error && <div className="error">{error}</div>}

        <label className="field"><span>会社名</span>
          <input value={form.company} onChange={(e) => set('company', e.target.value)} placeholder="〇〇株式会社" />
        </label>
        <label className="field"><span>担当者</span>
          <input value={form.person} onChange={(e) => set('person', e.target.value)} placeholder="山田 太郎" />
        </label>
        <label className="field"><span>電話番号（必須・自動で+81形式に整形）</span>
          <input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="03-1234-5678 / 090-xxxx-xxxx" />
        </label>
        <label className="field"><span>メモ</span>
          <textarea rows={2} value={form.memo} onChange={(e) => set('memo', e.target.value)} />
        </label>

        <div className="row">
          <button className="btn primary" onClick={save} disabled={saving}>{isNew ? '追加' : '保存'}</button>
          <button className="btn" onClick={onClose} disabled={saving}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}
