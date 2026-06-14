import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

// AI通話モニター (DESIGN 画面3)。発信 → 終了後にwebhookで届く結果をポーリングで反映する。
export default function AiCallModal({ contact, onClose, onSaved }) {
  const [phase, setPhase] = useState('starting'); // starting/calling/done/error/not_configured
  const [message, setMessage] = useState('AIエージェントに発信を依頼中…');
  const [call, setCall] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    let stopped = false;

    (async () => {
      try {
        const { call: created } = await api.startAiCall(contact.id);
        if (stopped) return;
        setCall(created);
        setPhase('calling');
        setMessage('発信しました。通話の終了を待っています…');

        // post-call webhook が届くまでポーリング
        timerRef.current = setInterval(async () => {
          try {
            const fresh = await api.getCall(created.id);
            setCall(fresh);
            if (fresh.ended_at || fresh.transcript || fresh.analysis || fresh.result) {
              clearInterval(timerRef.current);
              setPhase('done');
              setMessage('通話が終了しました。');
              onSaved?.();
            }
          } catch { /* 一時的なエラーは無視して継続 */ }
        }, 4000);
      } catch (e) {
        if (stopped) return;
        if (e.message === 'elevenlabs_not_configured') {
          setPhase('not_configured');
          setMessage('ElevenLabs未設定です。AIモードは鍵を設定すると利用できます（Phase 2）。');
        } else {
          setPhase('error');
          setMessage(`発信に失敗しました: ${e.message}`);
        }
      }
    })();

    return () => { stopped = true; if (timerRef.current) clearInterval(timerRef.current); };
  }, [contact.id]); // eslint-disable-line

  let analysis = null;
  try { analysis = call?.analysis ? JSON.parse(call.analysis) : null; } catch { /* noop */ }

  return (
    <div className="modal-backdrop" onClick={phase !== 'calling' ? onClose : undefined}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{contact.company || '(会社名なし)'} <span className="chip ai">AI発信</span></div>
            <div className="muted">{contact.person || '担当者不明'} ・ <span className="mono">{contact.phone}</span></div>
          </div>
        </div>

        <div className={phase === 'error' || phase === 'not_configured' ? 'error' : 'info'}>
          {phase === 'calling' && <span className="spinner-dot" />}
          {message}
        </div>

        {call?.el_conversation_id && (
          <p className="muted small">conversation_id: <span className="mono">{call.el_conversation_id}</span></p>
        )}

        {phase === 'done' && (
          <div className="script-box">
            <div className="script-box-head">結果</div>
            <div className="script-body">
              {analysis?.transcript_summary
                ? <p>{analysis.transcript_summary}</p>
                : <p className="muted">要約はまだありません。</p>}
              <p className="muted">詳しい会話ログ・評価は「履歴」タブの詳細で確認できます。結果（アポ獲得/NG等）はそこで確定してください。</p>
            </div>
          </div>
        )}

        <div className="row">
          {phase === 'calling'
            ? <button className="btn" onClick={onClose}>バックグラウンドで継続（閉じる）</button>
            : <button className="btn" onClick={onClose}>閉じる</button>}
        </div>
      </div>
    </div>
  );
}
