import type { CastProtocol } from './types';

const STORAGE_KEY = 'lunatv_casting_settings';

/**
 * 投屏设置接口
 */
export interface CastingSettings {
  // 优先使用的协议
  preferredProtocol: CastProtocol | null;
  // 最近使用的设备ID
  lastDeviceId: string | null;
  // 最近使用的设备名称
  lastDeviceName: string | null;
  // 是否自动投屏（如果在同一设备上）
  autoCast: boolean;
  // 是否显示设备不在连接时隐藏提示
  hideNotAvailableWarning: boolean;
}

/**
 * 默认设置
 */
const DEFAULT_SETTINGS: CastingSettings = {
  preferredProtocol: null,
  lastDeviceId: null,
  lastDeviceName: null,
  autoCast: false,
  hideNotAvailableWarning: false,
};

/**
 * 读取投屏设置
 */
export function getCastingSettings(): CastingSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn('读取投屏设置失败:', e);
  }

  return DEFAULT_SETTINGS;
}

/**
 * 保存投屏设置
 */
export function saveCastingSettings(settings: Partial<CastingSettings>): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const current = getCastingSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('保存投屏设置失败:', e);
  }
}

/**
 * 清除投屏设置
 */
export function clearCastingSettings(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('清除投屏设置失败:', e);
  }
}

/**
 * 保存最近使用的设备
 */
export function saveLastUsedDevice(deviceId: string, deviceName: string, protocol: CastProtocol): void {
  saveCastingSettings({
    lastDeviceId: deviceId,
    lastDeviceName: deviceName,
    preferredProtocol: protocol,
  });
}

/**
 * 清除最近使用的设备
 */
export function clearLastUsedDevice(): void {
  saveCastingSettings({
    lastDeviceId: null,
    lastDeviceName: null,
  });
}
