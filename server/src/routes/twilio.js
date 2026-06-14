// Twilio から叩かれるエンドポイント (DESIGN 7章: /twiml/voice, /api/twilio/status)。
// webhook 同様、認証ミドルウェアの外に置く。Twilio は x-www-form-urlencoded で送ってくる。
import { Router } from 'express';
import express from 'express';
import { buildDialTwiml } from '../lib/twilio.js';

const router = Router();
const form = express.urlencoded({ extended: false });

// POST /twiml/voice — ブラウザ発信時に Twilio が取得しにくる発信指示(TwiML)
router.post('/twiml/voice', form, (req, res) => {
  // フロントが Device.connect({ params: { To } }) で渡した番号が req.body.To に入る
  const to = req.body.To;
  res.type('text/xml').send(buildDialTwiml(to));
});

// POST /api/twilio/status — 通話のステータスコールバック(完了検知など)
router.post('/api/twilio/status', form, (req, res) => {
  // CallSid / CallStatus / CallDuration などが届く。当面はログのみ。
  console.log('[twilio status]', req.body.CallSid, req.body.CallStatus);
  res.sendStatus(204);
});

export default router;
