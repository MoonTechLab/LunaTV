/* eslint-disable no-console, @typescript-eslint/no-explicit-any */

import { createHash, randomBytes } from 'crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { NextRequest } from 'next/server';

import { getConfig, setCachedConfig } from '@/lib/config';
import { db } from '@/lib/db';

import { AuthRole } from './auth';

export const OIDC_STATE_COOKIE = 'oidc_state';
export const OIDC_NONCE_COOKIE = 'oidc_nonce';
export const OIDC_VERIFIER_COOKIE = 'oidc_verifier';
export const OIDC_REDIRECT_COOKIE = 'oidc_redirect';
export const OIDC_CALLBACK_URI_COOKIE = 'oidc_callback_uri';

export type OidcClientAuthMethod = 'basic' | 'post' | 'none';

export const OIDC_FLOW_COOKIE_BASE = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: false,
  maxAge: 10 * 60,
};

const DISCOVERY_TTL_MS = 60 * 60 * 1000;
const CLOCK_TOLERANCE_SEC = 30;
const USERNAME_MAX_LEN = 64;

export interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
  end_session_endpoint?: string;
  token_endpoint_auth_methods_supported?: string[];
}

export interface PublicOidcConfig {
  enabled: boolean;
  buttonText: string;
  disablePassword: boolean;
}

export interface OidcUserIdentity {
  username: string;
  role: AuthRole;
  sub: string;
}

export class OidcError extends Error {
  code: string;
  detail?: string;

  constructor(code: string, message: string, detail?: string) {
    super(message);
    this.name = 'OidcError';
    this.code = code;
    this.detail = detail;
  }
}

interface CachedDiscovery {
  data: OidcDiscovery;
  fetchedAt: number;
  issuer: string;
}

let cachedDiscovery: CachedDiscovery | null = null;

function envFlag(name: string, defaultValue = false): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return defaultValue;
  }
  return raw === 'true' || raw === '1';
}

export function getStorageType(): string {
  return process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
}

export function isMultiUserStorage(): boolean {
  const storageType = getStorageType();
  return (
    storageType === 'redis' ||
    storageType === 'kvrocks' ||
    storageType === 'upstash'
  );
}

export function isOidcConfigured(): boolean {
  if (process.env.OIDC_ENABLED === 'false') {
    return false;
  }
  return Boolean(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID);
}

export function getPublicOidcConfig(): PublicOidcConfig {
  return {
    enabled: isOidcConfigured() && isMultiUserStorage(),
    buttonText: process.env.OIDC_BUTTON_TEXT || 'OIDC 登录',
    disablePassword: envFlag('OIDC_DISABLE_PASSWORD', false),
  };
}

export function getOidcScopes(): string {
  const raw = process.env.OIDC_SCOPES || 'openid profile email';
  const parts = raw.split(/[\s,]+/).filter(Boolean);
  if (!parts.includes('openid')) {
    parts.unshift('openid');
  }
  return Array.from(new Set(parts)).join(' ');
}

export function getUsernameClaimName(): string {
  return process.env.OIDC_USERNAME_CLAIM || 'preferred_username';
}

export function isOidcAutoRegister(): boolean {
  return envFlag('OIDC_AUTO_REGISTER', true);
}

export function sanitizeRedirect(redirect: string | null | undefined): string {
  if (!redirect) {
    return '/';
  }
  const trimmed = redirect.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return '/';
  }
  return trimmed;
}

function firstHeaderValue(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return value.split(',')[0].trim() || null;
}

export function getRequestOrigin(request: {
  headers: { get(name: string): string | null };
  nextUrl: { protocol: string; host: string };
}): string {
  const proto =
    firstHeaderValue(request.headers.get('x-forwarded-proto')) ||
    request.nextUrl.protocol.replace(':', '') ||
    'http';
  const host =
    firstHeaderValue(request.headers.get('x-forwarded-host')) ||
    request.headers.get('host') ||
    request.nextUrl.host;
  return `${proto}://${host}`;
}

export function getPublicBaseUrl(request: {
  headers: { get(name: string): string | null };
  nextUrl: { protocol: string; host: string };
}): string {
  const siteBase = process.env.SITE_BASE?.trim();
  if (siteBase) {
    return siteBase.replace(/\/+$/, '');
  }
  const explicit = process.env.OIDC_REDIRECT_URI?.trim();
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      // ignore invalid override
    }
  }
  return getRequestOrigin(request);
}

export function getOidcRedirectUri(request: NextRequest): string {
  const explicit = process.env.OIDC_REDIRECT_URI?.trim();
  if (explicit) {
    return explicit;
  }
  return `${getPublicBaseUrl(request)}/api/oidc/callback`;
}

export function resolveStoredRedirectUri(
  request: NextRequest,
  stored?: string | null
): string {
  if (stored && /^https?:\/\/\S+$/i.test(stored)) {
    return stored;
  }
  return getOidcRedirectUri(request);
}

export function pickTokenClientAuth(
  discovery: Pick<OidcDiscovery, 'token_endpoint_auth_methods_supported'>,
  hasSecret: boolean
): OidcClientAuthMethod {
  const override = process.env.OIDC_CLIENT_AUTH?.trim().toLowerCase();
  if (override === 'basic' || override === 'post' || override === 'none') {
    return override;
  }
  if (!hasSecret) {
    return 'none';
  }
  const methods = discovery.token_endpoint_auth_methods_supported;
  // Authelia 等会在发现文档里同时列出 basic/post，但单个 client 常被固定为
  // client_secret_post。双方都支持时优先 post，避免 invalid_client。
  if (!methods || methods.length === 0) {
    return 'post';
  }
  if (methods.includes('client_secret_post')) {
    return 'post';
  }
  if (methods.includes('client_secret_basic')) {
    return 'basic';
  }
  return 'post';
}

function getDiscoveryUrl(issuer: string): string {
  const normalized = issuer.replace(/\/+$/, '');
  if (normalized.includes('/.well-known/')) {
    return issuer;
  }
  return `${normalized}/.well-known/openid-configuration`;
}

export async function getOidcDiscovery(): Promise<OidcDiscovery> {
  const issuer = process.env.OIDC_ISSUER?.trim();
  if (!issuer) {
    throw new OidcError('oidc_not_configured', '未配置 OIDC_ISSUER');
  }

  if (
    cachedDiscovery &&
    cachedDiscovery.issuer === issuer &&
    Date.now() - cachedDiscovery.fetchedAt < DISCOVERY_TTL_MS
  ) {
    return cachedDiscovery.data;
  }

  const discoveryUrl = getDiscoveryUrl(issuer);
  const res = await fetch(discoveryUrl, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new OidcError(
      'oidc_discovery',
      `无法获取 OIDC 发现文档 (${res.status})`
    );
  }

  const data = (await res.json()) as OidcDiscovery;
  if (
    !data.issuer ||
    !data.authorization_endpoint ||
    !data.token_endpoint ||
    !data.jwks_uri
  ) {
    throw new OidcError('oidc_discovery', 'OIDC 发现文档缺少必要字段');
  }

  cachedDiscovery = {
    data,
    fetchedAt: Date.now(),
    issuer,
  };
  return data;
}

export function generateOidcRandomString(bytes = 32): string {
  return base64UrlEncode(randomBytes(bytes));
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = generateOidcRandomString(32);
  const challenge = base64UrlEncode(
    createHash('sha256').update(verifier).digest()
  );
  return { verifier, challenge };
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function buildAuthorizationUrl(params: {
  discovery: OidcDiscovery;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}): string {
  const clientId = process.env.OIDC_CLIENT_ID;
  if (!clientId) {
    throw new OidcError('oidc_not_configured', '未配置 OIDC_CLIENT_ID');
  }

  const url = new URL(params.discovery.authorization_endpoint);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', getOidcScopes());
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('state', params.state);
  url.searchParams.set('nonce', params.nonce);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export function parseTokenResponseBody(
  text: string,
  contentType: string
): Record<string, any> {
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  if (!text) {
    return {};
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {
      error: 'invalid_response',
      error_description: text.slice(0, 200),
    };
  }
}

export async function exchangeAuthorizationCode(params: {
  discovery: OidcDiscovery;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<{ id_token?: string; access_token?: string }> {
  const clientId = process.env.OIDC_CLIENT_ID;
  if (!clientId) {
    throw new OidcError('oidc_not_configured', '未配置 OIDC_CLIENT_ID');
  }

  const clientSecret = process.env.OIDC_CLIENT_SECRET || '';
  const authMethod = pickTokenClientAuth(params.discovery, Boolean(clientSecret));

  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', params.code);
  body.set('redirect_uri', params.redirectUri);
  body.set('code_verifier', params.codeVerifier);

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  if (authMethod === 'basic' && clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(
      `${clientId}:${clientSecret}`,
      'utf8'
    ).toString('base64')}`;
  } else {
    body.set('client_id', clientId);
    if (authMethod === 'post' && clientSecret) {
      body.set('client_secret', clientSecret);
    }
  }

  const res = await fetch(params.discovery.token_endpoint, {
    method: 'POST',
    headers,
    body,
    cache: 'no-store',
  });

  const raw = await res.text();
  const payload = parseTokenResponseBody(
    raw,
    res.headers.get('content-type') || ''
  );
  if (!res.ok) {
    const description =
      payload.error_description || payload.error || `HTTP ${res.status}`;
    console.error('OIDC 换取令牌失败:', {
      status: res.status,
      error: payload.error,
      error_description: payload.error_description,
      redirectUri: params.redirectUri,
      tokenEndpoint: params.discovery.token_endpoint,
      authMethod,
    });
    throw new OidcError('oidc_token', `换取令牌失败: ${description}`, description);
  }

  return payload;
}

export async function verifyIdToken(
  idToken: string,
  discovery: OidcDiscovery,
  expectedNonce: string
): Promise<Record<string, unknown>> {
  const clientId = process.env.OIDC_CLIENT_ID;
  if (!clientId) {
    throw new OidcError('oidc_not_configured', '未配置 OIDC_CLIENT_ID');
  }

  const JWKS = createRemoteJWKSet(new URL(discovery.jwks_uri));
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: discovery.issuer,
    audience: clientId,
    clockTolerance: CLOCK_TOLERANCE_SEC,
  });

  if (!payload.nonce || payload.nonce !== expectedNonce) {
    throw new OidcError('oidc_nonce', 'OIDC nonce 校验失败');
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new OidcError('oidc_claims', 'OIDC 令牌缺少 sub');
  }

  return payload as Record<string, unknown>;
}

export async function fetchUserInfo(
  discovery: OidcDiscovery,
  accessToken: string
): Promise<Record<string, unknown>> {
  if (!discovery.userinfo_endpoint) {
    return {};
  }
  const res = await fetch(discovery.userinfo_endpoint, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    return {};
  }
  const data = await res.json().catch(() => ({}));
  return data && typeof data === 'object' ? data : {};
}

export function sanitizeUsername(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new OidcError('oidc_username', '用户名为空');
  }

  // 邮箱保留 @ 与 .，其余空白和路径分隔符替换为下划线，避免破坏存储 key
  const sanitized = trimmed
    .replace(/[:/\\]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, USERNAME_MAX_LEN);

  if (!sanitized) {
    throw new OidcError('oidc_username', '用户名非法');
  }
  return sanitized;
}

export function resolveOidcUsername(
  claims: Record<string, unknown>,
  claimName = getUsernameClaimName()
): string {
  const preferred = [claimName, 'preferred_username', 'email', 'name', 'sub'];
  const seen = new Set<string>();

  for (const key of preferred) {
    if (seen.has(key)) continue;
    seen.add(key);
    const value = claims[key];
    if (typeof value === 'string' && value.trim()) {
      return sanitizeUsername(value);
    }
  }

  throw new OidcError('oidc_username', '无法从 OIDC 令牌解析用户名');
}

export async function provisionOidcUser(
  claims: Record<string, unknown>
): Promise<OidcUserIdentity> {
  const sub = typeof claims.sub === 'string' ? claims.sub : '';
  if (!sub) {
    throw new OidcError('oidc_claims', 'OIDC 令牌缺少 sub');
  }

  const mappedUsername = resolveOidcUsername(claims);
  const config = await getConfig();
  const users = config.UserConfig.Users;

  const bySub = users.find((u) => u.oidcSub === sub);
  if (bySub) {
    if (bySub.banned) {
      throw new OidcError('oidc_banned', '用户被封禁');
    }
    return {
      username: bySub.username,
      role: bySub.role,
      sub,
    };
  }

  if (mappedUsername === process.env.USERNAME) {
    const owner = users.find((u) => u.username === mappedUsername);
    if (owner && owner.oidcSub !== sub) {
      owner.oidcSub = sub;
      if (!owner.from) {
        owner.from = 'oidc';
      }
      await db.saveAdminConfig(config);
      setCachedConfig(config);
    }
    return {
      username: mappedUsername,
      role: 'owner',
      sub,
    };
  }

  const byName = users.find((u) => u.username === mappedUsername);
  if (byName) {
    if (byName.banned) {
      throw new OidcError('oidc_banned', '用户被封禁');
    }
    byName.oidcSub = sub;
    if (!byName.from) {
      byName.from = 'oidc';
    }
    await db.saveAdminConfig(config);
    setCachedConfig(config);
    return {
      username: byName.username,
      role: byName.role,
      sub,
    };
  }

  if (!isOidcAutoRegister()) {
    throw new OidcError(
      'oidc_not_registered',
      '账号未开通，请联系管理员先创建用户'
    );
  }

  const exists = await db.checkUserExist(mappedUsername);
  if (!exists) {
    const randomPassword = randomBytes(32).toString('hex');
    await db.registerUser(mappedUsername, randomPassword);
  }

  users.push({
    username: mappedUsername,
    role: 'user',
    banned: false,
    from: 'oidc',
    oidcSub: sub,
  });
  await db.saveAdminConfig(config);
  setCachedConfig(config);

  return {
    username: mappedUsername,
    role: 'user',
    sub,
  };
}

export function sanitizeOidcErrorDetail(detail?: string): string | undefined {
  if (!detail) {
    return undefined;
  }
  const cleaned = detail.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 180);
  return cleaned || undefined;
}

export function oidcLoginErrorPath(
  code: string,
  fallbackRedirect?: string,
  detail?: string
): string {
  const url = new URL('/login', 'http://local.invalid');
  url.searchParams.set('error', code);
  const redirect = sanitizeRedirect(fallbackRedirect);
  if (redirect !== '/') {
    url.searchParams.set('redirect', redirect);
  }
  const safeDetail = sanitizeOidcErrorDetail(detail);
  if (safeDetail) {
    url.searchParams.set('error_detail', safeDetail);
  }
  return `${url.pathname}${url.search}`;
}
