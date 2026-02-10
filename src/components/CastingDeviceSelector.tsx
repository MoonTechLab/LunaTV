'use client';

import { useEffect, useState } from 'react';
import { X, RefreshCw, Radio, Tv, Smartphone, Speaker } from 'lucide-react';
import type { CastDevice, CastProtocol, CastState } from '../lib/casting/types';
import { getCastingButtonTooltip } from './CastingButton';

interface CastingDeviceSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  devices: CastDevice[];
  currentDevice: CastDevice | null;
  castState: CastState;
  onConnect: (deviceId: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onScanStart?: () => void;
}

const PROTOCOL_NAMES: Record<CastProtocol, string> = {
  presentation: '浏览器投屏',
  airplay: 'AirPlay',
  chromecast: 'Chromecast/Google TV',
  dlna: 'DLNA 智能设备',
};

const PROTOCOL_ICONS: Record<CastProtocol, React.ReactNode> = {
  presentation: <Tv size={20} />,
  airplay: <Radio size={20} />,
  chromecast: <Speaker size={20} />,
  dlna: <Smartphone size={20} />,
};

const PROTOCOL_COLORS: Record<CastProtocol, string> = {
  presentation: 'text-blue-500',
  airplay: 'text-purple-500',
  chromecast: 'text-green-500',
  dlna: 'text-orange-500',
};

export function CastingDeviceSelector({
  isOpen,
  onClose,
  devices,
  currentDevice,
  castState,
  onConnect,
  onDisconnect,
  onRefresh,
  onScanStart,
}: CastingDeviceSelectorProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [connectingDeviceId, setConnectingDeviceId] = useState<string | null>(null);

  // 控制动画状态
  useEffect(() => {
    let animationId: number;
    let timer: NodeJS.Timeout;

    if (isOpen) {
      setIsVisible(true);
      // 使用双重 requestAnimationFrame 确保DOM完全渲染
      animationId = requestAnimationFrame(() => {
        animationId = requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      });

      // 自动扫描设备
      if (onScanStart) {
        setIsScanning(true);
        onScanStart();
      }
    } else {
      setIsAnimating(false);
      timer = setTimeout(() => {
        setIsVisible(false);
        setIsScanning(false);
        setConnectingDeviceId(null);
      }, 200);
    }

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (timer) clearTimeout(timer);
    };
  }, [isOpen, onScanStart]);

  // 阻止背景滚动
  useEffect(() => {
    if (isVisible) {
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;
      const body = document.body;
      const html = document.documentElement;

      const scrollBarWidth = window.innerWidth - html.clientWidth;

      const originalBodyStyle = {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
        paddingRight: body.style.paddingRight,
        overflow: body.style.overflow,
      };

      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.left = `-${scrollX}px`;
      body.style.right = '0';
      body.style.width = '100%';
      body.style.overflow = 'hidden';
      body.style.paddingRight = `${scrollBarWidth}px`;

      return () => {
        body.style.position = originalBodyStyle.position;
        body.style.top = originalBodyStyle.top;
        body.style.left = originalBodyStyle.left;
        body.style.right = originalBodyStyle.right;
        body.style.width = originalBodyStyle.width;
        body.style.paddingRight = originalBodyStyle.paddingRight;
        body.style.overflow = originalBodyStyle.overflow;

        requestAnimationFrame(() => {
          window.scrollTo(scrollX, scrollY);
        });
      };
    }
  }, [isVisible]);

  // ESC 键关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [isVisible, onClose]);

  // 监听扫描状态
  useEffect(() => {
    if (castState !== 'scanning') {
      setIsScanning(false);
    }
  }, [castState]);

  const handleRefresh = async () => {
    if (onScanStart) {
      setIsScanning(true);
      onScanStart();
    }
    await onRefresh();
    // 1.5秒后停止加载状态
    setTimeout(() => {
      setIsScanning(false);
    }, 1500);
  };

  const handleConnect = async (device: CastDevice) => {
    try {
      setConnectingDeviceId(device.id);
      await onConnect(device.id);
    } catch (e) {
      console.error('投屏连接失败:', e);
    } finally {
      setConnectingDeviceId(null);
    }
  };

  const handleDisconnect = async () => {
    await onDisconnect();
  };

  // 按协议分组设备
  const groupedDevices = devices.reduce((acc, device) => {
    if (!acc[device.protocol]) {
      acc[device.protocol] = [];
    }
    acc[device.protocol].push(device);
    return acc;
  }, {} as Record<CastProtocol, CastDevice[]>);

  // 如果已连接，显示断开连接选项
  if (currentDevice && castState === 'connected') {
    return (
      isConnected && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center">
          <div
            className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${
              isAnimating ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={onClose}
            style={{ backdropFilter: 'blur(4px)' }}
          />

          <div
            className="relative w-full max-w-lg mx-4 mb-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl"
            style={{
              marginBottom: 'calc(1rem + env(safe-area-inset-bottom))',
              transform: isAnimating ? 'translateY(0)' : 'translateY(100%)',
              opacity: isAnimating ? 1 : 0,
              transition: 'transform 200ms ease-out, opacity 200ms ease-out',
            }}
          >
            <div className="p-6">
              <div className="flex items-center justify-center gap-4">
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Tv size={32} className="text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    投屏中
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    已连接到 {currentDevice.name}
                  </p>
                </div>
                <button
                  onClick={() => {
                    handleDisconnect();
                    onClose();
                  }}
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                >
                  断开连接
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    );
  }

  // 没有任何设备时的状态
  const hasNoDevices = devices.length === 0 && !isScanning;

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center">
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${
          isAnimating ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
        style={{ backdropFilter: 'blur(4px)' }}
      />

      <div
        className="relative w-full max-w-lg mx-4 mb-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
        style={{
          marginBottom: 'calc(1rem + env(safe-area-inset-bottom))',
          maxHeight: 'calc(100vh - 2rem - env(safe-area-inset-bottom))',
          transform: isAnimating ? 'translateY(0)' : 'translateY(100%)',
          opacity: isAnimating ? 1 : 0,
          transition: 'transform 200ms ease-out, opacity 200ms ease-out',
        }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            选择投屏设备
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                handleRefresh();
              }}
              disabled={isScanning}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw
                size={20}
                className={`text-gray-600 dark:text-gray-400 ${
                  isScanning ? 'animate-spin' : ''
                }`}
              />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X size={20} className="text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* 设备列表 */}
        <div className="p-3 overflow-y-auto max-h-[60vh]">
          {hasNoDevices ? (
            <div className="py-12 text-center">
              <Tv size={48} className="mx-auto mb-4 text-gray-400 dark:text-gray-500" />
              <p className="text-gray-600 dark:text-gray-400 mb-2">
                未发现可用设备
              </p>
              <button
                onClick={() => {
                  handleRefresh();
                }}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                重新扫描
              </button>
            </div>
          ) : (
            Object.entries(groupedDevices).map(([protocol, protocolDevices]) => (
              <div key={protocol} className="mb-4 last:mb-0">
                {/* 协议分组标题 */}
                <div className="flex items-center gap-2 px-3 py-2 mb-2">
                  <span className={PROTOCOL_COLORS[protocol as CastProtocol]}>
                    {PROTOCOL_ICONS[protocol as CastProtocol]}
                  </span>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {PROTOCOL_NAMES[protocol as CastProtocol]}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    ({protocolDevices.length})
                  </span>
                </div>

                {/* 设备列表 */}
                <div className="space-y-1">
                  {protocolDevices.map((device) => {
                    const isConnecting = connectingDeviceId === device.id;
                    const isConnected =
                      currentDevice?.id === device.id && castState === 'connected';

                    return (
                      <button
                        key={device.id}
                        onClick={() => handleConnect(device)}
                        disabled={isConnecting || isConnected}
                        className={`
                          w-full flex items-center gap-3 px-4 py-3 rounded-xl
                          transition-all duration-150
                          ${
                            isConnected
                              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                              : 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'
                          }
                          ${isConnecting || isConnected ? 'cursor-not-allowed' : 'active:scale-[0.98]'}
                        `}
                      >
                        <span className="text-2xl">{device.icon}</span>
                        <div className="flex-1 min-w-0 text-left">
                          <p
                            className={`font-medium truncate ${
                              isConnected
                                ? 'text-green-700 dark:text-green-300'
                                : 'text-gray-900 dark:text-gray-100'
                            }`}
                          >
                            {device.name}
                          </p>
                          {isConnecting ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              正在连接...
                            </p>
                          ) : isConnected ? (
                            <p className="text-xs text-green-600 dark:text-green-400">
                              已连接
                            </p>
                          ) : null}
                        </div>
                        {isConnecting && (
                          <svg className="animate-spin w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="30"/>
                          </svg>
                        )}
                        {isConnected && (
                          <svg className="w-5 h-5 text-green-600 dark:text-green-400" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* 底部提示 */}
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            <span className="hidden sm:inline">DLNA 设备需要添加浏览器兼容支持</span>
            <span className="sm:hidden">部分协议可能在移动设备上不可用</span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default CastingDeviceSelector;
