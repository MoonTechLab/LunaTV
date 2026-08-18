import { NextResponse } from 'next/server';

import { clearAuthCookie } from '@/lib/auth';
import {
  OIDC_CALLBACK_URI_COOKIE,
  OIDC_FLOW_COOKIE_BASE,
  OIDC_NONCE_COOKIE,
  OIDC_REDIRECT_COOKIE,
  OIDC_STATE_COOKIE,
  OIDC_VERIFIER_COOKIE,
} from '@/lib/oidc';

export const runtime = 'nodejs';

export async function POST() {
  const response = NextResponse.json({ ok: true });

  // 清除认证cookie
  clearAuthCookie(response);

  const expired = {
    ...OIDC_FLOW_COOKIE_BASE,
    maxAge: 0,
    expires: new Date(0),
  };
  response.cookies.set(OIDC_STATE_COOKIE, '', expired);
  response.cookies.set(OIDC_NONCE_COOKIE, '', expired);
  response.cookies.set(OIDC_VERIFIER_COOKIE, '', expired);
  response.cookies.set(OIDC_REDIRECT_COOKIE, '', expired);
  response.cookies.set(OIDC_CALLBACK_URI_COOKIE, '', expired);

  return response;
}
