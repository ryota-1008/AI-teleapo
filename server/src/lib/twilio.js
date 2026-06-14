// Twilio 手動モードのヘルパー (DESIGN 2-2)。
// 鍵が未設定でもサーバーは起動できるよう、設定チェックを噛ませる。
import twilio from 'twilio';

const REQUIRED_FOR_TOKEN = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_API_KEY',
  'TWILIO_API_SECRET',
  'TWILIO_TWIML_APP_SID',
];

// 発信トークンに必要な鍵が揃っているか
export function isTwilioConfigured() {
  return REQUIRED_FOR_TOKEN.every((k) => !!process.env[k]);
}

// ブラウザ発信用アクセストークンを発行する
export function createVoiceToken(identity) {
  const { AccessToken } = twilio.jwt;
  const { VoiceGrant } = AccessToken;

  const token = new AccessToken(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_API_KEY,
    process.env.TWILIO_API_SECRET,
    { identity, ttl: 3600 }
  );
  token.addGrant(
    new VoiceGrant({
      outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
      incomingAllow: false, // 着信はAI(ElevenLabs)側が取る想定なので無効
    })
  );
  return token.toJwt();
}

// ブラウザ発信時に Twilio が叩いてくる TwiML を生成する
export function buildDialTwiml(toNumber) {
  const { VoiceResponse } = twilio.twiml;
  const response = new VoiceResponse();
  if (!toNumber) {
    response.say({ language: 'ja-JP' }, '発信先が指定されていません。');
    return response.toString();
  }
  const dial = response.dial({
    callerId: process.env.TWILIO_CALLER_ID || undefined,
    answerOnBridge: true,
  });
  dial.number(toNumber);
  return response.toString();
}
