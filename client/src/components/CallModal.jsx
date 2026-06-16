import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const STATUSES = ['未架電', '不在', 'アポ獲得', 'NG', '再架電'];

// 手動モードの通話画面 (DESIGN 画面2)。
// Twilio未設定でも「スマホで発信→結果記録」として使える。鍵があればブラウザ発信も有効になる。
export default function CallModal({ contact, script, onClose, onSaved }) {
  const [phase, setPhase] = useState('idle');     // idle / connecting / in-call
  const [twilioReady, setTwilioReady] = useState(false);
  const [twilioMsg, setTwilioMsg] = useState('Twilio接続を確認中…');
  const [muted, setMuted] = useState(false);

  const [result, setResult] = useState(contact.status || '不在');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const deviceRef = useRef(null);
  const callRef = useRef(null);
  const startedAtRef = useRef(null);

  // ブラウザ発信の準備(トークン取得 → Device初期化)。未設定なら結果記録のみモード。
  useEffect(() => {
    let device;
    (async () => {
      try {
        const { token } = await api.manualToken();
        const { Device } = await import('@twilio/voice-sdk');
        device = new Device(token, { codecPreferences: ['opus', 'pcmu'] });
        deviceRef.current = device;
        setTwilioReady(true);
        setTwilioMsg('');
      } catch (e) {
        // 503 twilio_not_configured もここに来る
        setTwilioReady(false);
        setTwilioMsg(
          e.code === 'twilio_not_configured'
            ? 'Twilio未設定: スマホで発信し、結果だけ記録できます。'
            : `ブラウザ発信は利用できません（${e.message}）。スマホ発信＋結果記録は可能です。`
        );
      }
    })();
    return () => { try { device?.destroy(); } catch { /* noop */ } };
  }, []);

  async function startCall() {
    setError('');
    setPhase('connecting');
    startedAtRef.current = new Date().toISOString();
    try {
      const call = await deviceRef.current.connect({ params: { To: contact.phone } });
      callRef.current = call;
      call.on('accept', () => setPhase('in-call'));
      call.on('disconnect', () => setPhase('idle'));
      call.on('error', (err) => { setError(err.message); setPhase('idle'); });
    } catch (e) {
      setError(e.message);
      setPhase('idle');
    }
  }

  function hangup() {
    try { callRef.current?.disconnect(); } catch { /* noop */ }
    setPhase('idle');
  }

  function toggleMute() {
    const c = callRef.current;
    if (!c) return;
    const next = !muted;
    c.mute(next);
    setMuted(next);
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      await api.createCall({
        contact_id: contact.id,
        mode: 'manual',
        result,
        note: note.trim() || null,
        started_at: startedAtRef.current,
        ended_at: new Date().toISOString(),
      });
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
          <div>
            <div className="modal-title">{contact.company || '(会社名なし)'}</div>
            <div className="muted">{contact.person || '担当者不明'}</div>
          </div>
          <a className="phone-big mono" href={`tel:${contact.phone}`}>{contact.phone}</a>
        </div>

        {twilioMsg && <div className="info small">{twilioMsg}</div>}
        {error && <div className="error">{error}</div>}

        {/* ブラウザ発信コントロール(Twilio設定時のみ) */}
        {twilioReady && (
          <div className="call-controls">
            {phase === 'idle' && (
              <button className="btn primary" onClick={startCall}>ブラウザで発信</button>
            )}
            {phase === 'connecting' && <button className="btn" disabled>接続中…</button>}
            {phase === 'in-call' && (
              <>
                <span className="chip live">通話中</span>
                <button className="btn" onClick={toggleMute}>{muted ? 'ミュート解除' : 'ミュート'}</button>
                <button className="btn danger" onClick={hangup}>切断</button>
              </>
            )}
          </div>
        )}

        {/* トークスクリプト */}
        <div className="script-box">
          <div className="script-box-head">トークスクリプト{script ? `: ${script.title}` : ''}</div>
          <div className="script-body">
            {script?.body
              ? script.body
              : '使用中のスクリプトがありません。「スクリプト」タブで作成・「使用中」に設定してください。'}
          </div>
        </div>

        {/* 結果記録 */}
        <div className="result-form">
          <label className="field">
            <span>結果</span>
            <select value={result} onChange={(e) => setResult(e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="field">
            <span>メモ</span>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="通話内容・次アクションなど" />
          </label>
          <div className="row">
            <button className="btn primary" onClick={save} disabled={saving}>結果を記録</button>
            <button className="btn" onClick={onClose} disabled={saving}>閉じる</button>
          </div>
        </div>
      </div>
    </div>
  );
}
