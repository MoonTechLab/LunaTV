/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import {
  buildAuthorizationUrl,
  createPkcePair,
  generateOidcRandomString,
  getOidcDiscovery,
  getOidcRedirectUri,
  getPublicBaseUrl,
  isMultiUserStorage,
  isOidcConfigured,
  OIDC_CALLBACK_URI_COOKIE,
  OIDC_FLOW_COOKIE_BASE,
  OIDC_NONCE_COOKIE,
  OIDC_REDIRECT_COOKIE,
  OIDC_STATE_COOKIE,
  OIDC_VERIFIER_COOKIE,
  OidcError,
  oidcLoginErrorPath,
  sanitizeRedirect,
} from '@/lib/oidc';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const requestedRedirect = sanitizeRedirect(
    request.nextUrl.searchParams.get('redirect')
  );

  try {
    if (!isOidcConfigured()) {
      throw new OidcError('oidc_not_configured', '未启用 OIDC');
    }
    if (!isMultiUserStorage()) {
      throw new OidcError(
        'oidc_storage',
        'OIDC 仅支持 redis / kvrocks / upstash 存储模式'
      );
    }
    if (!process.env.PASSWORD) {
      throw new OidcError('oidc_not_configured', '未配置 PASSWORD，无法签发会话');
    }

    const discovery = await getOidcDiscovery();
    const redirectUri = getOidcRedirectUri(request);
    const state = generateOidcRandomString(24);
    const nonce = generateOidcRandomString(24);
    const { verifier, challenge } = createPkcePair();
    const authorizationUrl = buildAuthorizationUrl({
      discovery,
      redirectUri,
      state,
      nonce,
      codeChallenge: challenge,
    });

    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(OIDC_STATE_COOKIE, state, OIDC_FLOW_COOKIE_BASE);
    response.cookies.set(OIDC_NONCE_COOKIE, nonce, OIDC_FLOW_COOKIE_BASE);
    response.cookies.set(OIDC_VERIFIER_COOKIE, verifier, OIDC_FLOW_COOKIE_BASE);
    response.cookies.set(
      OIDC_REDIRECT_COOKIE,
      requestedRedirect,
      OIDC_FLOW_COOKIE_BASE
    );
    response.cookies.set(
      OIDC_CALLBACK_URI_COOKIE,
      redirectUri,
      OIDC_FLOW_COOKIE_BASE
    );
    return response;
  } catch (error) {
    const code =
      error instanceof OidcError ? error.code : 'oidc_failed';
    console.error('OIDC 登录发起失败:', error);
    return NextResponse.redirect(
      new URL(
        oidcLoginErrorPath(code, requestedRedirect),
        `${getPublicBaseUrl(request)}/`
      )
    );
  }
}
