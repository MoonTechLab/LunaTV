import { CastConfig, CastDevice, CastState, CastStateCallback, CastProtocol, CastError } from './types';

/**
 * 投屏基类 - 定义统一的投屏接口
 * 所有投屏协议实现都需要继承此基类
 */
export abstract class BaseCaster {
  protected config: CastConfig;
  protected state: CastState = 'idle';
  protected currentDevice: CastDevice | null = null;
  protected onStateChange: CastStateCallback | null = null;
  protected onDeviceConnected: ((device: CastDevice) => void) | null = null;
  protected onDeviceDisconnected: (() => void) | null = null;

  constructor(config: CastConfig) {
    this.config = config;
  }

  /**
   * 初始化投屏器
   */
  abstract initialize(): Promise<void>;

  /**
   * 检查协议是否支持
   */
  abstract isSupported(): boolean;

  /**
   * 获取可用设备列表
   */
  abstract getAvailableDevices(): Promise<CastDevice[]>;

  /**
   * 开始投屏到指定设备
   */
  abstract cast(deviceId: string): Promise<void>;

  /**
   * 断开投屏连接
   */
  abstract disconnect(): Promise<void>;

  /**
   * 获取当前状态
   */
  getState(): CastState {
    return this.state;
  }

  /**
   * 获取当前连接的设备
   */
  getCurrentDevice(): CastDevice | null {
    return this.currentDevice;
  }

  /**
   * 获取协议类型
   */
  abstract getProtocol(): CastProtocol;

  /**
   * 更新配置
   */
  updateConfig(config: Partial<CastConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 设置状态变化回调
   */
  onStateChangeCallback(callback: CastStateCallback): void {
    this.onStateChange = callback;
  }

  /**
   * 设置设备连接回调
   */
  onDeviceConnectedCallback(callback: (device: CastDevice) => void): void {
    this.onDeviceConnected = callback;
  }

  /**
   * 设置设备断开回调
   */
  onDeviceDisconnectedCallback(callback: () => void): void {
    this.onDeviceDisconnected = callback;
  }

  /**
   * 通知状态变化
   */
  protected notifyStateChange(error?: CastError): void {
    if (this.onStateChange) {
      this.onStateChange(this.state, this.currentDevice, error);
    }
  }

  /**
   * 通知设备连接
   */
  protected notifyDeviceConnected(): void {
    if (this.onDeviceConnected && this.currentDevice) {
      this.onDeviceConnected(this.currentDevice);
    }
  }

  /**
   * 通知设备断开
   */
  protected notifyDeviceDisconnected(): void {
    if (this.onDeviceDisconnected) {
      this.onDeviceDisconnected();
    }
  }

  /**
   * 设置内部状态
   */
  protected setState(newState: CastState, device: CastDevice | null = null): void {
    this.state = newState;
    if (device !== null) {
      this.currentDevice = device;
    }
    this.notifyStateChange();
  }

  /**
   * 清理资源
   */
  abstract cleanup(): Promise<void>;
}
