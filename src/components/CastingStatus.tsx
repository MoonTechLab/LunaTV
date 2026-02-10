import type { CastState, CastDevice } from '../lib/casting/types';

interface CastingStatusProps {
  state: CastState;
  device: CastDevice | null;
  className?: string;
}

/**
 * 投屏状态指示组件
 * 显示当前投屏状态的图标和文本
 */
export function CastingStatus({ state, device, className = '' }: CastingStatusProps) {
  const isConnecting = state === 'connecting';
  const isConnected = state === 'connected';
  const isScanning = state === 'scanning';
  const isIdle = state === 'idle';
  const isError = state === 'error';

  if (isIdle && !device) {
    // 空闲状态，不显示
    return null;
  }

  if (isScanning) {
    return (
      <div className={`flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 ${className}`}>
        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="30"/>
        </svg>
        <span>正在扫描设备...</span>
      </div>
    );
  }

  if (isConnecting) {
    return (
      <div className={`flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 ${className}`}>
        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="30"/>
        </svg>
        <span>正在连接投屏设备...</span>
      </div>
    );
  }

  if (isConnected && device) {
    return (
      <div className={`flex items-center gap-2 text-sm text-green-600 dark:text-green-400 ${className}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10"/>
        </svg>
        <span>已投屏到 {device.name}</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={`flex items-center gap-2 text-sm text-red-600 dark:text-red-400 ${className}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 8v4M12 16h.01"/>
        </svg>
        <span>投屏连接失败</span>
      </div>
    );
  }

  return null;
}

/**
 * 投屏状态指示条 - 横向显示在播放器上的状态条
 */
export function CastingStatusBar({ state, device, className = '' }: CastingStatusProps) {
  const isConnected = state === 'connected' && device;

  if (!isConnected) {
    return null;
  }

  return (
    <div className={`absolute top-4 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-black/60 backdrop-blur-sm rounded-full flex items-center gap-2 ${className}`}>
      <span className="text-white text-sm flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM5 15h14v2H5z"/>
        </svg>
        已投屏到 {device.name}
      </span>
    </div>
  );
}

export default CastingStatus;
