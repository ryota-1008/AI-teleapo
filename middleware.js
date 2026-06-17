// 認証ミドルウェアの「箱」。既定は無効(AUTH_ENABLED!=='true')で素通り。
// 複数人化時に AUTH_ENABLED=true + APP_PASSWORD で有効化。
// webhook / twiml は外部サービスが叩くので対象外（matcher で除外）。
import { NextResponse } from 'next/server';

export function middleware(req) {
  if (process.env.AUTH_ENABLED !== 'true') return NextResponse.next();

  const password = process.env.APP_PASSWORD;
  const provided = req.headers.get('x-app-password');
  if (password && provided === password) return NextResponse.next();

  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

export const config = {
  // /api/* のみ対象。ただし webhook と twiml/twilio は除外。
  matcher: ['/api/((?!webhooks|twiml|twilio).*)'],
};
