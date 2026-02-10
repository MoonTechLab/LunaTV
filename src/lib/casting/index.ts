/**
 * 投屏功能统一导出
 */

// 类型定义
export type {
  CastProtocol,
  CastState,
  CastDevice,
  CastMetadata,
  CastConfig,
  CastErrorType,
  CastError,
  CastStateCallback,
  DeviceListCallback,
  ProtocolCapabilities,
} from './types';

export { CastErrorType } from './types';

// 基础类
export { BaseCaster } from './base';

// 投屏协议实现
export { PresentationCaster } from './presentation-caster';
export { AirPlayCaster } from './airplay-caster';
export { DlnaCaster } from './dlna-caster';
export { ChromecastCaster } from './chromecast-caster';

// 设备管理器
export { DeviceManager } from './device-manager';

// 存储工具
export type { CastingSettings } from './storage';
export {
  getCastingSettings,
  saveCastingSettings,
  clearCastingSettings,
  saveLastUsedDevice,
  clearLastUsedDevice,
} from './storage';

// 快捷函数
import { DeviceManager } from './device-manager';
import type { CastConfig, CastProtocol, CastState, CastDevice, CastError } from './types';

/**
 * 创建设备管理器
 */
export function createDeviceManager(config: CastConfig): DeviceManager {
  return new DeviceManager(config);
}

/**
 * 检测平台的投屏能力
 */
export function detectPlatformCapabilities(): {
  presentation: boolean;
  airplay: boolean;
  chromecast: boolean;
  dlna: boolean;
  mobile: boolean;
  ios: boolean;
  android: boolean;
} {
  const ua = navigator.userAgent;
  const mobile = /iPad|iPhone|iPod|Android/i.test(ua);
  const ios = /iPad|iPhone|iPod/i.test(ua);
  const android = /Android/i.test(ua);

  return {
    // Presentation API 支持
    presentation: typeof PresentationRequest !== 'undefined' ||
                 (navigator as any).presentation?.request !== undefined,

    // AirPlay 支持
    airplay: typeof (window as any).AirPlay !== 'undefined' ||
              'webkitplaybacktargetavailabilitychanged' in HTMLVideoElement.prototype,

    // Chromecast 支持 (需要 Chrome)
    chromecast: /Chrome|Edge/i.test(ua) &&
                typeof (window as any).chrome?.cast !== 'undefined',

    // DLNA 基础支持
    dlna: typeof RTCPeerConnection !== 'undefined',

    mobile,
    ios,
    android,
  };
}

/**
 * 获取推荐的投屏协议
 */
export function getRecommendedProtocol(): CastProtocol | null {
  const caps = detectPlatformCapabilities();

  // iOS 优先 AirPlay
  if (caps.ios && caps.airplay) {
    return 'airplay';
  }

  // Android 优先 Chromecast
  if (caps.android && caps.chromecast) {
    return 'chromecast';
  }

  // 桌面端优先 Presentation API
  if (caps.presentation) {
    return 'presentation';
  }

  // 其次 AirPlay
  if (caps.airplay) {
    return 'airplay';
  }

  // 其次 Chromecast
  if (caps.chromecast) {
    return 'chromecast';
  }

  // 最后 DLNA
  if (caps.dlna) {
    return 'dlna';
  }

  return null;
}
