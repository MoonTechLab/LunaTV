import type { CastState, CastDevice } from '../lib/casting/types';

/**
 * 投屏按钮组件 - 用于在 HTML 中渲染
 * 根据当前投屏状态返回不同的 HTML 内容
 */
export function getCastingButtonHTML(state: CastState, device: CastDevice | null): string {
  const isConnecting = state === 'connecting';
  const isConnected = state === 'connected';

  if (isConnecting) {
    // 连接中 - 显示加载图标
    return `<i class="art-icon flex items-center justify-center">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2V6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M12 18V22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M4.93 4.93L7.76 7.76" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M16.24 16.24L19.07 19.07" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M2 12H6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M18 12H22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M4.93 19.07L7.76 16.24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M16.24 7.76L19.07 4.93" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </i>`;
  }

  if (isConnected) {
    // 已连接 - 显示已连接状态
    return `<i class="art-icon flex items-center justify-center text-green-500">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM5 15h14v2H5z"/>
      </svg>
    </i>`;
  }

  // 未连接 - 显示投屏图标
  return `<i class="art-icon flex items-center justify-center">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
      <polyline points="17 2 12 7 7 2" />
    </svg>
  </i>`;
}

/**
 * 获取投屏按钮的 tooltip 提示文本
 */
export function getCastingButtonTooltip(state: CastState, device: CastDevice | null): string {
  const isConnecting = state === 'connecting';
  const isConnected = state === 'connected';

  if (isConnecting) {
    return '正在连接...';
  }

  if (isConnected && device) {
    return `已投屏到 ${device.name}`;
  }

  return '投屏';
}

/**
 * 获取投屏状态图标 HTML
 */
export function getCastingStatusHTML(state: CastState, device: CastDevice | null): string {
  const isConnecting = state === 'connecting';
  const isConnected = state === 'connected';

  if (isConnecting) {
    return `<span class="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
      <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="60" stroke-dashoffset="30"/>
      </svg>
      正在连接投屏设备...
    </span>`;
  }

  if (isConnected && device) {
    return `<span class="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="10"/>
      </svg>
      已投屏到 ${device.name}
    </span>`;
  }

  return '';
}
