/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { AlertCircle, CheckCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { CURRENT_VERSION } from '@/lib/version';
import { checkForUpdates, UpdateStatus } from '@/lib/version_check';

import { useSite } from '@/components/SiteProvider';
import { ThemeToggle } from '@/components/ThemeToggle';

// 版本显示组件
function VersionDisplay() {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const status = await checkForUpdates();
        setUpdateStatus(status);
      } catch (_) {
        // do nothing
      } finally {
        setIsChecking(false);
      }
    };

    checkUpdate();
  }, []);

  return (
    <button
      onClick={() =>
        window.open('https://github.com/MoonTechLab/LunaTV', '_blank')
      }
      className='absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 transition-colors cursor-pointer'
    >
      <span className='font-mono'>v{CURRENT_VERSION}</span>
      {!isChecking && updateStatus !== UpdateStatus.FETCH_FAILED && (
        <div
          className={`flex items-center gap-1.5 ${updateStatus === UpdateStatus.HAS_UPDATE
            ? 'text-yellow-600 dark:text-yellow-400'
            : updateStatus === UpdateStatus.NO_UPDATE
              ? 'text-green-600 dark:text-green-400'
              : ''
            }`}
        >
          {updateStatus === UpdateStatus.HAS_UPDATE && (
            <>
              <AlertCircle className='w-3.5 h-3.5' />
              <span className='font-semibold text-xs'>有新版本</span>
            </>
          )}
          {updateStatus === UpdateStatus.NO_UPDATE && (
            <>
              <CheckCircle className='w-3.5 h-3.5' />
              <span className='font-semibold text-xs'>已是最新</span>
            </>
          )}
        </div>
      )}
    </button>
  );
}

const OIDC_ERROR_MESSAGES: Record<string, string> = {
  oidc_not_configured: 'OIDC 未正确配置',
  oidc_storage: '当前存储模式不支持 OIDC，请使用 redis / kvrocks / upstash',
  oidc_discovery: '无法连接身份提供方，请检查 OIDC_ISSUER',
  oidc_state: '登录状态已失效，请重新发起 OIDC 登录',
  oidc_nonce: 'OIDC 校验失败，请重试',
  oidc_denied: '已取消 OIDC 登录',
  oidc_banned: '该账号已被封禁',
  oidc_not_registered: '账号未开通，请联系管理员先创建用户',
  oidc_username: '无法从身份提供方解析用户名',
  oidc_token: 'OIDC 换取令牌失败，请检查回调地址、Client Secret 和客户端认证方式',
  oidc_failed: 'OIDC 登录失败，请稍后重试',
};

function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shouldAskUsername, setShouldAskUsername] = useState(false);
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const [oidcButtonText, setOidcButtonText] = useState('OIDC 登录');
  const [disablePassword, setDisablePassword] = useState(false);
  const [oidcLoading, setOidcLoading] = useState(false);

  const { siteName } = useSite();

  // 在客户端挂载后设置配置
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const runtimeConfig = (window as any).RUNTIME_CONFIG;
      const storageType = runtimeConfig?.STORAGE_TYPE;
      setShouldAskUsername(storageType && storageType !== 'localstorage');
      setOidcEnabled(Boolean(runtimeConfig?.OIDC?.enabled));
      if (runtimeConfig?.OIDC?.buttonText) {
        setOidcButtonText(runtimeConfig.OIDC.buttonText);
      }
      setDisablePassword(Boolean(runtimeConfig?.OIDC?.disablePassword));
    }
  }, []);

  useEffect(() => {
    const oidcError = searchParams.get('error');
    if (oidcError) {
      const detail = searchParams.get('error_detail');
      const base = OIDC_ERROR_MESSAGES[oidcError] || 'OIDC 登录失败，请稍后重试';
      setError(detail ? `${base}（${detail}）` : base);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (disablePassword && oidcEnabled) return;
    if (!password || (shouldAskUsername && !username)) return;

    try {
      setLoading(true);
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          ...(shouldAskUsername ? { username } : {}),
        }),
      });

      if (res.ok) {
        const redirect = searchParams.get('redirect') || '/';
        router.replace(redirect);
      } else if (res.status === 401) {
        setError('密码错误');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '服务器错误');
      }
    } catch (error) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleOidcLogin = () => {
    setError(null);
    setOidcLoading(true);
    const redirect = searchParams.get('redirect') || '/';
    const oidcUrl = new URL('/api/oidc/login', window.location.origin);
    if (redirect && redirect !== '/') {
      oidcUrl.searchParams.set('redirect', redirect);
    }
    window.location.href = oidcUrl.toString();
  };

  const showPasswordForm = !oidcEnabled || !disablePassword;

  return (
    <div className='relative min-h-screen flex items-center justify-center px-4 overflow-hidden'>
      <div className='absolute top-4 right-4'>
        <ThemeToggle />
      </div>
      <div className='relative z-10 w-full max-w-md rounded-3xl bg-gradient-to-b from-white/90 via-white/70 to-white/40 dark:from-zinc-900/90 dark:via-zinc-900/70 dark:to-zinc-900/40 backdrop-blur-xl shadow-2xl p-10 dark:border dark:border-zinc-800'>
        <h1 className='text-green-600 tracking-tight text-center text-3xl font-extrabold mb-8 bg-clip-text drop-shadow-sm'>
          {siteName}
        </h1>
        <form onSubmit={handleSubmit} className='space-y-8'>
          {oidcEnabled && (
            <button
              type='button'
              onClick={handleOidcLogin}
              disabled={oidcLoading}
              className='inline-flex w-full justify-center rounded-lg border border-green-600 bg-white/70 dark:bg-zinc-800/70 py-3 text-base font-semibold text-green-700 dark:text-green-400 shadow-sm transition-all duration-200 hover:bg-green-50 dark:hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50'
            >
              {oidcLoading ? '正在跳转...' : oidcButtonText}
            </button>
          )}

          {oidcEnabled && showPasswordForm && (
            <div className='relative'>
              <div className='absolute inset-0 flex items-center'>
                <div className='w-full border-t border-gray-300/70 dark:border-zinc-700' />
              </div>
              <div className='relative flex justify-center text-xs'>
                <span className='bg-transparent px-3 text-gray-500 dark:text-gray-400'>
                  或使用账号密码
                </span>
              </div>
            </div>
          )}

          {showPasswordForm && (
            <>
              {shouldAskUsername && (
                <div>
                  <label htmlFor='username' className='sr-only'>
                    用户名
                  </label>
                  <input
                    id='username'
                    type='text'
                    autoComplete='username'
                    className='block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60 backdrop-blur'
                    placeholder='输入用户名'
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
              )}

              <div>
                <label htmlFor='password' className='sr-only'>
                  密码
                </label>
                <input
                  id='password'
                  type='password'
                  autoComplete='current-password'
                  className='block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60 backdrop-blur'
                  placeholder='输入访问密码'
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </>
          )}

          {error && (
            <p className='text-sm text-red-600 dark:text-red-400'>{error}</p>
          )}

          {/* 登录按钮 */}
          {showPasswordForm && (
            <button
              type='submit'
              disabled={
                !password || loading || (shouldAskUsername && !username)
              }
              className='inline-flex w-full justify-center rounded-lg bg-green-600 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:from-green-600 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-50'
            >
              {loading ? '登录中...' : '登录'}
            </button>
          )}
        </form>
      </div>

      {/* 版本信息显示 */}
      <VersionDisplay />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginPageClient />
    </Suspense>
  );
}
