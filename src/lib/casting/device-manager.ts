import { BaseCaster } from './base';
import { PresentationCaster } from './presentation-caster';
import { AirPlayCaster } from './airplay-caster';
import { DlnaCaster } from './dlna-caster';
import { ChromecastCaster } from './chromecast-caster';

import type {
  CastConfig,
  CastDevice,
  CastProtocol,
  CastState,
  CastError,
  CastErrorType,
  ProtocolCapabilities,
  DeviceListCallback,
  CastStateCallback,
} from './types';

/**
 * 设备管理器 - 统一管理所有投屏协议的设备发现、连接和断开
 */
export class DeviceManager {
  private casters: Map<CastProtocol, BaseCaster> = new Map();
  private devices: Map<string, CastDevice> = new Map();
  private currentDevice: CastDevice | null = null;
  private currentState: CastState = 'idle';
  private scanInterval: number | null = null;
  private deviceListCallbacks: Set<DeviceListCallback> = new Set();
  private stateCallbacks: Set<CastStateCallback> = new Set();

  constructor(private config: CastConfig) {
    this.initializeCasters();
  }

  /**
   * 初始化所有投屏协议
   */
  private async initializeCasters(): Promise<void> {
    const casterClasses = [
      { protocol: 'presentation', Caster: PresentationCaster },
      { protocol: 'airplay', Caster: AirPlayCaster },
      { protocol: 'dlna', Caster: DlnaCaster },
      { protocol: 'chromecast', Caster: ChromecastCaster },
    ] as const;

    for (const { protocol, Caster } of casterClasses) {
      try {
        const caster = new Caster(this.config);
        if (caster.isSupported()) {
          await caster.initialize();
          this.casters.set(protocol, caster);
          console.log(`${protocol} 投屏协议已初始化`);
        }
      } catch (e) {
        console.warn(`${protocol} 投屏协议初始化失败:`, e);
      }
    }
  }

  /**
   * 检测协议支持情况
   */
  getCapabilities(): ProtocolCapabilities {
    return {
      presentation: this.casters.has('presentation'),
      airplay: this.casters.has('airplay'),
      chromecast: this.casters.has('chromecast'),
      dlna: this.casters.has('dlna'),
    };
  }

  /**
   * 获取最佳可用协议
   */
  getBestProtocol(): CastProtocol | null {
    const capabilities = this.getCapabilities();
    const priorityOrder: CastProtocol[] = ['airplay', 'presentation', 'chromecast', 'dlna'];

    for (const protocol of priorityOrder) {
      if (capabilities[protocol]) {
        return protocol;
      }
    }
    return null;
  }

  /**
   * 扫描所有可用设备
   */
  async scanDevices(): Promise<CastDevice[]> {
    this.currentState = 'scanning';
    this.notifyStateChange();

    const allDevices: CastDevice[] = [];
    this.devices.clear();

    // 并行扫描所有协议的设备
    const scanPromises = Array.from(this.casters.entries()).map(async ([protocol, caster]) => {
      try {
        const devices = await caster.getAvailableDevices();
        devices.forEach((device) => {
          allDevices.push(device);
          this.devices.set(device.id, device);
        });
      } catch (e) {
        console.warn(`扫描 ${protocol} 设备失败:`, e);
      }
    });

    await Promise.allSettled(scanPromises);

    this.currentState = allDevices.length > 0 ? 'idle' : 'idle';
    this.notifyStateChange();

    this.notifyDeviceListUpdate(allDevices);

    return allDevices;
  }

  /**
   * 启动自动扫描
   */
  startAutoScan(interval: number = 10000): void {
    if (this.scanInterval !== null) {
      this.stopAutoScan();
    }

    this.scanDevices();
    this.scanInterval = window.setInterval(() => {
      this.scanDevices();
    }, interval);
  }

  /**
   * 停止自动扫描
   */
  stopAutoScan(): void {
    if (this.scanInterval !== null) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
  }

  /**
   * 连接到指定的设备
   */
  async connect(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      const error: CastError = {
        type: CastErrorType.DEVICE_NOT_FOUND,
        message: '设备不存在',
      };
      this.currentState = 'error';
      this.notifyStateChange(undefined, error);
      throw error;
    }

    const caster = this.casters.get(device.protocol);
    if (!caster) {
      const error: CastError = {
        type: CastErrorType.UNSUPPORTED_PROTOCOL,
        message: `${device.protocol} 协议不支持`,
        protocol: device.protocol,
      };
      this.currentState = 'error';
      this.notifyStateChange(undefined, error);
      throw error;
    }

    try {
      this.currentState = 'connecting';
      this.currentDevice = null;
      this.notifyStateChange();

      // 设置 caster 的回调
      caster.onStateChangeCallback((state, device) => {
        if (state === 'connected') {
          this.currentDevice = device;
          this.currentState = 'connected';
          this.notifyStateChange();
        } else if (state === 'disconnected') {
          this.currentDevice = null;
          this.currentState = 'disconnected';
          this.notifyStateChange();
        } else if (state === 'error') {
          this.currentState = 'error';
          this.notifyStateChange();
        }
      });

      await caster.cast(deviceId);

      this.currentDevice = device;
      this.currentState = 'connected';

      if (this.scanInterval !== null) {
        this.stopAutoScan();
      }

      this.notifyStateChange();
    } catch (e) {
      const error: CastError = {
        type: CastErrorType.CONNECTION_FAILED,
        message: '连接失败',
        protocol: device.protocol,
        deviceId,
      };
      this.currentState = 'error';
      this.currentDevice = null;
      this.notifyStateChange(undefined, error);
      throw error;
    }
  }

  /**
   * 断开当前连接
   */
  async disconnect(): Promise<void> {
    if (!this.currentDevice) {
      return;
    }

    const caster = this.casters.get(this.currentDevice.protocol);
    if (caster) {
      try {
        await caster.disconnect();
      } catch (e) {
        console.warn('断开连接失败:', e);
      }
    }

    this.currentDevice = null;
    this.currentState = 'disconnected';
    this.notifyStateChange();
  }

  /**
   * 获取当前连接的设备
   */
  getCurrentDevice(): CastDevice | null {
    return this.currentDevice;
  }

  /**
   * 获取当前状态
   */
  getCurrentState(): CastState {
    return this.currentState;
  }

  /**
   * 获取所有可用设备
   */
  getAllDevices(): CastDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * 按协议分组设备
   */
  getDevicesByProtocol(): Map<CastProtocol, CastDevice[]> {
    const grouped = new Map<CastProtocol, CastDevice[]>();
    grouped.set('presentation', []);
    grouped.set('airplay', []);
    grouped.set('dlna', []);
    grouped.set('chromecast', []);

    for (const device of this.devices.values()) {
      const list = grouped.get(device.protocol) || [];
      list.push(device);
      grouped.set(device.protocol, list);
    }

    return grouped;
  }

  /**
   * 更新视频配置
   */
  updateConfig(config: Partial<CastConfig>): void {
    this.config = { ...this.config, ...config };

    // 更新所有 caster 的配置
    for (const caster of this.casters.values()) {
      caster.updateConfig(config);
    }
  }

  /**
   * 订阅设备列表更新
   */
  subscribeToDeviceUpdates(callback: DeviceListCallback): () => void {
    this.deviceListCallbacks.add(callback);

    // 立即回调一次
    if (this.devices.size > 0) {
      callback(this.getAllDevices());
    }

    // 返回取消订阅函数
    return () => {
      this.deviceListCallbacks.delete(callback);
    };
  }

  /**
   * 订阅状态变化
   */
  subscribeToStateChange(callback: CastStateCallback): () => void {
    this.stateCallbacks.add(callback);

    // 立即回调一次
    callback(this.currentState, this.currentDevice);

    // 返回取消订阅函数
    return () => {
      this.stateCallbacks.delete(callback);
    };
  }

  /**
   * 通知设备列表更新
   */
  private notifyDeviceListUpdate(devices: CastDevice[]): void {
    for (const callback of this.deviceListCallbacks) {
      try {
        callback(devices);
      } catch (e) {
        console.error('设备列表回调执行失败:', e);
      }
    }
  }

  /**
   * 通知状态变化
   */
  private notifyStateChange(device?: CastDevice | null, error?: CastError): void {
    for (const callback of this.stateCallbacks) {
      try {
        callback(this.currentState, this.currentDevice || device, error);
      } catch (e) {
        console.error('状态变化回调执行失败:', e);
      }
    }
  }

  /**
   * 清理所有资源
   */
  async cleanup(): Promise<void> {
    this.stopAutoScan();

    for (const caster of this.casters.values()) {
      await caster.cleanup();
    }

    this.casters.clear();
    this.devices.clear();
    this.deviceListCallbacks.clear();
    this.stateCallbacks.clear();
    this.currentDevice = null;
    this.currentState = 'idle';
  }
}
