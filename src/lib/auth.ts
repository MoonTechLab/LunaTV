import { NextRequest, NextResponse } from 'next/server';

export type AuthRole = 'owner' | 'admin' | 'user';
export type AuthMethod = 'password' | 'oidc';

export interface AuthInfo {
  password?: string;
  username?: string;
  signature?: string;
  timestamp?: number;
  role?: AuthRole;
  authMethod?: AuthMethod;
}

export const AUTH_COOKIE_NAME = 'auth';

export const AUTH_COOKIE_BASE = {
  path: '/',
  sameSite: 'lax' as const,
  httpOnly: false, // PWA 需要客户端可访问
  secure: false,
};

// 生成 HMAC-SHA256 签名
export async function generateSignature(
  data: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// 生成认证 Cookie（带签名），与现有登录接口格式保持一致
export async function generateAuthCookie(
  username?: string,
  password?: string,
  role?: AuthRole,
  includePassword = false,
  authMethod?: AuthMethod
): Promise<string> {
  const authData: AuthInfo = { role: role || 'user' };

  if (includePassword && password) {
    authData.password = password;
  }

  if (username && process.env.PASSWORD) {
    authData.username = username;
    authData.signature = await generateSignature(
      username,
      process.env.PASSWORD
    );
    authData.timestamp = Date.now();
  }

  if (authMethod) {
    authData.authMethod = authMethod;
  }

  return encodeURIComponent(JSON.stringify(authData));
}

export function applyAuthCookie(
  response: NextResponse,
  cookieValue: string,
  maxAgeDays = 7
): void {
  const expires = new Date();
  expires.setDate(expires.getDate() + maxAgeDays);
  response.cookies.set(AUTH_COOKIE_NAME, cookieValue, {
    ...AUTH_COOKIE_BASE,
    expires,
  });
}

export function clearAuthCookie(response: NextResponse): void {
  response.cookies.set(AUTH_COOKIE_NAME, '', {
    ...AUTH_COOKIE_BASE,
    expires: new Date(0),
  });
}

// 从cookie获取认证信息 (服务端使用)
export function getAuthInfoFromCookie(request: NextRequest): AuthInfo | null {
  const authCookie = request.cookies.get('auth');

  if (!authCookie) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(authCookie.value);
    const authData = JSON.parse(decoded);
    return authData;
  } catch (error) {
    return null;
  }
}

// 从cookie获取认证信息 (客户端使用)
export function getAuthInfoFromBrowserCookie(): AuthInfo | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    // 解析 document.cookie
    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
      const trimmed = cookie.trim();
      const firstEqualIndex = trimmed.indexOf('=');

      if (firstEqualIndex > 0) {
        const key = trimmed.substring(0, firstEqualIndex);
        const value = trimmed.substring(firstEqualIndex + 1);
        if (key && value) {
          acc[key] = value;
        }
      }

      return acc;
    }, {} as Record<string, string>);

    const authCookie = cookies['auth'];
    if (!authCookie) {
      return null;
    }

    // 处理可能的双重编码
    let decoded = decodeURIComponent(authCookie);

    // 如果解码后仍然包含 %，说明是双重编码，需要再次解码
    if (decoded.includes('%')) {
      decoded = decodeURIComponent(decoded);
    }

    const authData = JSON.parse(decoded);
    return authData;
  } catch (error) {
    return null;
  }
}
