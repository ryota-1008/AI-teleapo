'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/apiClient';

const BLANK = { id: null, title: '', body: '', is_active: false };

export default function ScriptsPage() {
  const [scripts, setScripts] = useState([]);
  const [draft, setDraft] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      setScripts(await api.listScripts());
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function save() {
    if (!draft.title.trim()) { setError('タイトルを入力してください'); return; }
    setBusy(true);
    try {
      const saved = await api.saveScript(draft);
      setDraft(saved);
      await load();
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="card info">
        手動モードの通話中に表示するトークスクリプトを編集します。
        <br />
        AIモードの台本は ElevenLabs ダッシュボードのエージェント設定で管理します
        （<a href="https://elevenlabs.io/app/agents" target="_blank" rel="noreferrer">ダッシュボードを開く</a>）。
      </div>

      {error && <div className="error">{error}</div>}

      <div className="scripts-layout">
        <aside className="script-list">
          <button className="btn primary block" onClick={() => setDraft(BLANK)}>＋ 新規スクリプト</button>
          {scripts.length === 0 && <p className="empty">まだスクリプトがありません</p>}
          {scripts.map((s) => (
            <button
              key={s.id}
              className={draft.id === s.id ? 'script-item active' : 'script-item'}
              onClick={() => setDraft(s)}
            >
              <span className="script-title">{s.title || '(無題)'}</span>
              {s.is_active ? <span className="chip">使用中</span> : null}
            </button>
          ))}
        </aside>

        <section className="script-edit card">
          <label className="field">
            <span>タイトル</span>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="例: 新規アポ取り用"
            />
          </label>

          <label className="field">
            <span>本文（通話中に表示）</span>
            <textarea
              rows={14}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              placeholder="お世話になります。〇〇会社の△△と申します…"
            />
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={!!draft.is_active}
              onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
            />
            このスクリプトを使用中にする（通話画面に表示）
          </label>

          <div className="row">
            <button className="btn primary" onClick={save} disabled={busy}>
              {draft.id ? '保存' : '作成'}
            </button>
            {draft.id && <span className="muted">ID: {draft.id}</span>}
          </div>
        </section>
      </div>
    </div>
  );
}
