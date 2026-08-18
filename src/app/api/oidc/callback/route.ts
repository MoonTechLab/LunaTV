/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { applyAuthCookie, generateAuthCookie } from '@/lib/auth';
import {
  exchangeAuthorizationCode,
  fetchUserInfo,
  getOidcDiscovery,
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
  provisionOidcUser,
  resolveStoredRedirectUri,
  sanitizeRedirect,
  verifyIdToken,
} from '@/lib/oidc';

export const runtime = 'nodejs';

function clearOidcFlowCookies(response: NextResponse) {
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
}

function redirectToLogin(
  request: NextRequest,
  code: string,
  fallbackRedirect?: string,
  detail?: string
): NextResponse {
  const response = NextResponse.redirect(
    new URL(
      oidcLoginErrorPath(code, fallbackRedirect, detail),
      `${getPublicBaseUrl(request)}/`
    )
  );
  clearOidcFlowCookies(response);
  return response;
}

export async function GET(request: NextRequest) {
  const storedRedirect = sanitizeRedirect(
    request.cookies.get(OIDC_REDIRECT_COOKIE)?.value
  );
  const storedState = request.cookies.get(OIDC_STATE_COOKIE)?.value;
  const storedNonce = request.cookies.get(OIDC_NONCE_COOKIE)?.value;
  const storedVerifier = request.cookies.get(OIDC_VERIFIER_COOKIE)?.value;

  const idpError = request.nextUrl.searchParams.get('error');
  if (idpError) {
    const denied =
      idpError === 'access_denied' ? 'oidc_denied' : 'oidc_failed';
    return redirectToLogin(request, denied, storedRedirect);
  }

  try {
    if (!isOidcConfigured() || !isMultiUserStorage()) {
      throw new OidcError('oidc_not_configured', '未启用 OIDC');
    }
    if (!process.env.PASSWORD) {
      throw new OidcError('oidc_not_configured', '未配置 PASSWORD，无法签发会话');
    }

    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    if (!code || !state) {
      throw new OidcError('oidc_state', '缺少授权码或 state');
    }
    if (!storedState || storedState !== state) {
      throw new OidcError('oidc_state', 'OIDC state 校验失败');
    }
    if (!storedNonce || !storedVerifier) {
      throw new OidcError('oidc_state', 'OIDC 登录会话已过期，请重试');
    }

    const discovery = await getOidcDiscovery();
    const redirectUri = resolveStoredRedirectUri(
      request,
      request.cookies.get(OIDC_CALLBACK_URI_COOKIE)?.value
    );
    const tokens = await exchangeAuthorizationCode({
      discovery,
      code,
      redirectUri,
      codeVerifier: storedVerifier,
    });

    if (!tokens.id_token) {
      throw new OidcError(
        'oidc_token',
        '令牌响应缺少 id_token',
        '身份提供方未返回 id_token，请确认 scope 包含 openid'
      );
    }

    let claims = await verifyIdToken(tokens.id_token, discovery, storedNonce);

    const needUserInfo =
      !claims[process.env.OIDC_USERNAME_CLAIM || 'preferred_username'] &&
      !claims.preferred_username &&
      !claims.email &&
      !claims.name;
    if (needUserInfo && tokens.access_token) {
      const extra = await fetchUserInfo(discovery, tokens.access_token);
      claims = { ...extra, ...claims };
    }

    const identity = await provisionOidcUser(claims);
    const cookieValue = await generateAuthCookie(
      identity.username,
      undefined,
      identity.role,
      false,
      'oidc'
    );

    const response = NextResponse.redirect(
      new URL(storedRedirect, `${getPublicBaseUrl(request)}/`)
    );
    applyAuthCookie(response, cookieValue);
    clearOidcFlowCookies(response);
    return response;
  } catch (error) {
    const code = error instanceof OidcError ? error.code : 'oidc_failed';
    const detail = error instanceof OidcError ? error.detail : undefined;
    console.error('OIDC 回调处理失败:', error);
    return redirectToLogin(request, code, storedRedirect, detail);
  }
}
