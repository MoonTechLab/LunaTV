/**
 * @jest-environment node
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { getConfig, setCachedConfig } from '@/lib/config';
import { db } from '@/lib/db';
import {
  getOidcScopes,
  getPublicBaseUrl,
  getPublicOidcConfig,
  getRequestOrigin,
  isMultiUserStorage,
  isOidcAutoRegister,
  isOidcConfigured,
  OidcError,
  oidcLoginErrorPath,
  parseTokenResponseBody,
  pickTokenClientAuth,
  provisionOidcUser,
  resolveOidcUsername,
  resolveStoredRedirectUri,
  sanitizeRedirect,
  sanitizeUsername,
} from '@/lib/oidc';

function fakeRequest(
  url: string,
  headers: Record<string, string> = {}
): {
  headers: { get(name: string): string | null };
  nextUrl: { protocol: string; host: string };
} {
  const parsed = new URL(url);
  return {
    nextUrl: { protocol: parsed.protocol, host: parsed.host },
    headers: {
      get(name: string) {
        return headers[name] || headers[name.toLowerCase()] || null;
      },
    },
  };
}

jest.mock('@/lib/config', () => ({
  getConfig: jest.fn(),
  setCachedConfig: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  db: {
    saveAdminConfig: jest.fn(),
    checkUserExist: jest.fn(),
    registerUser: jest.fn(),
  },
}));

const mockedGetConfig = getConfig as jest.MockedFunction<typeof getConfig>;
const mockedSetCachedConfig = setCachedConfig as jest.MockedFunction<
  typeof setCachedConfig
>;
const mockedDb = db as jest.Mocked<typeof db>;

describe('oidc helpers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.OIDC_ENABLED;
    delete process.env.OIDC_ISSUER;
    delete process.env.OIDC_CLIENT_ID;
    delete process.env.OIDC_AUTO_REGISTER;
    delete process.env.OIDC_DISABLE_PASSWORD;
    delete process.env.OIDC_SCOPES;
    delete process.env.OIDC_USERNAME_CLAIM;
    delete process.env.OIDC_BUTTON_TEXT;
    delete process.env.OIDC_CLIENT_AUTH;
    delete process.env.OIDC_REDIRECT_URI;
    delete process.env.SITE_BASE;
    delete process.env.NEXT_PUBLIC_STORAGE_TYPE;
    delete process.env.USERNAME;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('isOidcConfigured requires issuer and client id', () => {
    expect(isOidcConfigured()).toBe(false);
    process.env.OIDC_ISSUER = 'https://auth.example.com';
    expect(isOidcConfigured()).toBe(false);
    process.env.OIDC_CLIENT_ID = 'lunatv';
    expect(isOidcConfigured()).toBe(true);
  });

  test('isOidcConfigured can be explicitly disabled', () => {
    process.env.OIDC_ISSUER = 'https://auth.example.com';
    process.env.OIDC_CLIENT_ID = 'lunatv';
    process.env.OIDC_ENABLED = 'false';
    expect(isOidcConfigured()).toBe(false);
  });

  test('getPublicOidcConfig is disabled on localstorage', () => {
    process.env.OIDC_ISSUER = 'https://auth.example.com';
    process.env.OIDC_CLIENT_ID = 'lunatv';
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'localstorage';
    expect(getPublicOidcConfig()).toEqual({
      enabled: false,
      buttonText: 'OIDC 登录',
      disablePassword: false,
    });
  });

  test('getPublicOidcConfig exposes button text in multi-user mode', () => {
    process.env.OIDC_ISSUER = 'https://auth.example.com';
    process.env.OIDC_CLIENT_ID = 'lunatv';
    process.env.NEXT_PUBLIC_STORAGE_TYPE = 'redis';
    process.env.OIDC_BUTTON_TEXT = '使用公司账号登录';
    process.env.OIDC_DISABLE_PASSWORD = 'true';
    expect(getPublicOidcConfig()).toEqual({
      enabled: true,
      buttonText: '使用公司账号登录',
      disablePassword: true,
    });
    expect(isMultiUserStorage()).toBe(true);
  });

  test('getOidcScopes always includes openid', () => {
    process.env.OIDC_SCOPES = 'profile email';
    expect(getOidcScopes()).toBe('openid profile email');
  });

  test('sanitizeUsername strips path separators', () => {
    expect(sanitizeUsername(' alice/bob ')).toBe('alice_bob');
    expect(sanitizeUsername('user@example.com')).toBe('user@example.com');
  });

  test('resolveOidcUsername prefers configured claim then fallbacks', () => {
    expect(
      resolveOidcUsername(
        {
          preferred_username: 'bob',
          email: 'bob@example.com',
          sub: 'abc',
        },
        'preferred_username'
      )
    ).toBe('bob');
    expect(
      resolveOidcUsername(
        {
          email: 'bob@example.com',
          sub: 'abc',
        },
        'preferred_username'
      )
    ).toBe('bob@example.com');
    expect(resolveOidcUsername({ sub: 'abc-123' })).toBe('abc-123');
    expect(() => resolveOidcUsername({})).toThrow(OidcError);
  });

  test('getPublicBaseUrl uses SITE_BASE then OIDC_REDIRECT_URI origin', () => {
    const request = fakeRequest('http://127.0.0.1:3001/api/oidc/callback', {
      host: 'tv.impengbo.cn',
    });
    process.env.OIDC_REDIRECT_URI =
      'https://tv.impengbo.cn:8443/api/oidc/callback';
    expect(getPublicBaseUrl(request)).toBe('https://tv.impengbo.cn:8443');
    process.env.SITE_BASE = 'https://tv.impengbo.cn:8443';
    expect(getPublicBaseUrl(request)).toBe('https://tv.impengbo.cn:8443');
  });

  test('getRequestOrigin prefers forwarded proto and host', () => {
    const request = fakeRequest('http://127.0.0.1:3000/api/oidc/login', {
      host: '0.0.0.0:3001',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'tv.example.com',
    });
    expect(getRequestOrigin(request)).toBe('https://tv.example.com');
  });

  test('pickTokenClientAuth prefers post for Authelia-style clients', () => {
    expect(pickTokenClientAuth({}, false)).toBe('none');
    expect(pickTokenClientAuth({}, true)).toBe('post');
    expect(
      pickTokenClientAuth(
        { token_endpoint_auth_methods_supported: ['client_secret_post'] },
        true
      )
    ).toBe('post');
    expect(
      pickTokenClientAuth(
        {
          token_endpoint_auth_methods_supported: [
            'client_secret_basic',
            'client_secret_post',
          ],
        },
        true
      )
    ).toBe('post');
    expect(
      pickTokenClientAuth(
        { token_endpoint_auth_methods_supported: ['client_secret_basic'] },
        true
      )
    ).toBe('basic');
    process.env.OIDC_CLIENT_AUTH = 'basic';
    expect(pickTokenClientAuth({}, true)).toBe('basic');
  });

  test('parseTokenResponseBody accepts json and form bodies', () => {
    expect(
      parseTokenResponseBody(
        '{"id_token":"abc"}',
        'application/json; charset=utf-8'
      )
    ).toEqual({ id_token: 'abc' });
    expect(
      parseTokenResponseBody(
        'id_token=abc&token_type=Bearer',
        'application/x-www-form-urlencoded'
      )
    ).toEqual({ id_token: 'abc', token_type: 'Bearer' });
  });

  test('resolveStoredRedirectUri keeps the authorize-time callback', () => {
    const request = fakeRequest('http://127.0.0.1:3000/api/oidc/callback') as any;
    expect(
      resolveStoredRedirectUri(
        request,
        'https://0.0.0.0:3001/api/oidc/callback'
      )
    ).toBe('https://0.0.0.0:3001/api/oidc/callback');
  });

  test('oidcLoginErrorPath includes sanitized detail', () => {
    expect(oidcLoginErrorPath('oidc_token', '/', 'invalid_grant\nfoo')).toBe(
      '/login?error=oidc_token&error_detail=invalid_grant+foo'
    );
  });

  test('sanitizeRedirect only allows relative paths', () => {
    expect(sanitizeRedirect('/play?id=1')).toBe('/play?id=1');
    expect(sanitizeRedirect('https://evil.example')).toBe('/');
    expect(sanitizeRedirect('//evil.example')).toBe('/');
    expect(sanitizeRedirect(undefined)).toBe('/');
  });

  test('provisionOidcUser binds existing user by username', async () => {
    process.env.USERNAME = 'admin';
    const config: any = {
      UserConfig: {
        Users: [{ username: 'bob', role: 'user', banned: false }],
      },
    };
    mockedGetConfig.mockResolvedValue(config);

    const identity = await provisionOidcUser({
      sub: 'oidc-1',
      preferred_username: 'bob',
    });

    expect(identity).toEqual({
      username: 'bob',
      role: 'user',
      sub: 'oidc-1',
    });
    expect(config.UserConfig.Users[0].oidcSub).toBe('oidc-1');
    expect(mockedDb.saveAdminConfig).toHaveBeenCalled();
    expect(mockedSetCachedConfig).toHaveBeenCalled();
  });

  test('provisionOidcUser maps owner by USERNAME', async () => {
    process.env.USERNAME = 'admin';
    const config: any = {
      UserConfig: { Users: [{ username: 'admin', role: 'owner' }] },
    };
    mockedGetConfig.mockResolvedValue(config);

    const identity = await provisionOidcUser({
      sub: 'owner-sub',
      preferred_username: 'admin',
    });

    expect(identity.role).toBe('owner');
    expect(config.UserConfig.Users[0].oidcSub).toBe('owner-sub');
    expect(mockedDb.registerUser).not.toHaveBeenCalled();
    expect(mockedDb.saveAdminConfig).toHaveBeenCalled();
  });

  test('provisionOidcUser rejects banned users', async () => {
    mockedGetConfig.mockResolvedValue({
      UserConfig: {
        Users: [{ username: 'bob', role: 'user', banned: true }],
      },
    } as any);

    await expect(
      provisionOidcUser({ sub: 'x', preferred_username: 'bob' })
    ).rejects.toMatchObject({ code: 'oidc_banned' });
  });

  test('provisionOidcUser auto-registers new users', async () => {
    process.env.USERNAME = 'admin';
    process.env.OIDC_AUTO_REGISTER = 'true';
    const config: any = { UserConfig: { Users: [] } };
    mockedGetConfig.mockResolvedValue(config);
    mockedDb.checkUserExist.mockResolvedValue(false);
    mockedDb.registerUser.mockResolvedValue();

    const identity = await provisionOidcUser({
      sub: 'new-sub',
      preferred_username: 'carol',
    });

    expect(identity).toEqual({
      username: 'carol',
      role: 'user',
      sub: 'new-sub',
    });
    expect(mockedDb.registerUser).toHaveBeenCalled();
    expect(config.UserConfig.Users[0]).toMatchObject({
      username: 'carol',
      from: 'oidc',
      oidcSub: 'new-sub',
    });
  });

  test('provisionOidcUser respects disabled auto-register', async () => {
    process.env.OIDC_AUTO_REGISTER = 'false';
    expect(isOidcAutoRegister()).toBe(false);
    mockedGetConfig.mockResolvedValue({ UserConfig: { Users: [] } } as any);

    await expect(
      provisionOidcUser({ sub: 'new-sub', preferred_username: 'dave' })
    ).rejects.toMatchObject({ code: 'oidc_not_registered' });
    expect(mockedDb.registerUser).not.toHaveBeenCalled();
  });

  test('provisionOidcUser prefers stable oidcSub over claim rename', async () => {
    mockedGetConfig.mockResolvedValue({
      UserConfig: {
        Users: [
          {
            username: 'oldname',
            role: 'admin',
            oidcSub: 'stable-sub',
            from: 'oidc',
          },
        ],
      },
    } as any);

    const identity = await provisionOidcUser({
      sub: 'stable-sub',
      preferred_username: 'newname',
    });

    expect(identity).toEqual({
      username: 'oldname',
      role: 'admin',
      sub: 'stable-sub',
    });
    expect(mockedDb.registerUser).not.toHaveBeenCalled();
  });
});
