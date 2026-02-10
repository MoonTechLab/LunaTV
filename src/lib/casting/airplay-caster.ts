import { BaseCaster } from './base';
import { CastDevice, CastProtocol, CastState, CastErrorType, CastError } from './types';

/**
 * 使用浏览器 AirPlay API 实现投屏
 * 支持 Safari 和 Chrome（移动端）
 */
export class AirPlayCaster extends BaseCaster {
  private airPlayHandler: ((event: any) => void) | null = null;
  private wirelessChangeHandler: ((event: Event) => void) | null = null;
  private isAirPlayAvailable = false;

  constructor(config: any) {
    super(config);
  }

  /**
   * 初始化 AirPlay
   */
  async initialize(): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('AirPlay 不支持');
    }

    // 添加 webkitplaybacktargetavailabilitychanged 监听器
    this.airPlayHandler = this.handleAirPlayAvailability.bind(this);
    this.config.videoElement.addEventListener(
      'webkitplaybacktargetavailabilitychanged',
      this.airPlayHandler
    );

    // 添加无线播放状态变化监听器
    this.wirelessChangeHandler = this.handleWirelessChange.bind(this);
    this.config.videoElement.addEventListener(
      'webkitcurrentplaybacktargetiswirelesschanged',
      this.wirelessChangeHandler
    );
  }

  /**
   * 处理 AirPlay 可用性变化
   */
  private handleAirPlayAvailability(event: WebKitPlaybackTargetAvailabilityEvent): void {
    this.isAirPlayAvailable = event.availability === 'available';
  }

  /**
   * 处理无线播放状态变化
   */
  private handleWirelessChange(): void {
    const video = this.config.videoElement;
    const isWireless = (video as any).webkitCurrentPlaybackTargetIsWireless;

    if (isWireless) {
      // 获取当前设备名称
      const currentTarget = (video as any).webkitPlaybackTarget;
      const deviceName = currentTarget?.deviceName || 'AirPlay 设备';

      const device: CastDevice = {
        id: 'airplay-device',
        name: deviceName,
        protocol: 'airplay',
        icon: '🍎',
        available: true,
      };

      this.setState('connected', device);
      this.notifyDeviceConnected();
    } else {
      this.setState('disconnected', null);
      this.notifyDeviceDisconnected();
    }
  }

  /**
   * 检查浏览器是否支持 AirPlay
   */
  isSupported(): boolean {
    return (
      typeof (window as any).AirPlay !== 'undefined' ||
      'webkitplaybacktargetavailabilitychanged' in HTMLVideoElement.prototype ||
      'webkitShowPlaybackTargetPicker' in HTMLVideoElement.prototype
    );
  }

  /**
   * 检查 AirPlay 是否可用（有可用设备）
   */
  isAvailable(): boolean {
    return this.isAirPlayAvailable;
  }

  /**
   * 获取协议类型
   */
  getProtocol(): CastProtocol {
    return 'airplay';
  }

  /**
   * 获取可用设备列表
   * 注意：AirPlay API 不支持预获取设备列表
   * 只能在调用 webkitShowPlaybackTargetPicker() 时让用户选择
   */
  async getAvailableDevices(): Promise<CastDevice[]> {
    if (this.isAirPlayAvailable) {
      return [
        {
          id: 'airplay-picker',
          name: 'AirPlay 设备选择器',
          protocol: 'airplay',
          icon: '🍎',
          available: true,
        },
      ];
    }
    return [];
  }

  /**
   * 开始投屏
   */
  async cast(deviceId: string): Promise<void> {
    if (!this.isSupported()) {
      const error: CastError = {
        type: CastErrorType.UNSUPPORTED_PROTOCOL,
        message: 'AirPlay 不支持',
        protocol: 'airplay',
      };
      this.setState('error', null);
      this.notifyStateChange(error);
      throw error;
    }

    if (!this.isAirPlayAvailable) {
      const error: CastError = {
        type: CastErrorType.DEVICE_NOT_FOUND,
        message: '没有可用的 AirPlay 设备',
        protocol: 'airplay',
      };
      this.setState('error', null);
      this.notifyStateChange(error);
      throw error;
    }

    try {
      this.setState('connecting', null);

      // 显示 AirPlay 选择器
      const video = this.config.videoElement;
      if (typeof (video as any).webkitShowPlaybackTargetPicker === 'function') {
        await (video as any).webkitShowPlaybackTargetPicker();
      }

      // 状态变化会在 handleWirelessChange 中处理
      // 设置一个超时，如果5秒内没有连接成功，则认为失败
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (this.state !== 'connected') {
            const error: CastError = {
              type: CastErrorType.TIMEOUT,
              message: '投屏连接超时，请确保选择了正确的 AirPlay 设备',
              protocol: 'airplay',
            };
            this.setState('error', null);
            this.notifyStateChange(error);
            reject(error);
          } else {
            resolve();
          }
        }, 5000);

        // 稍后检查状态（因为 webkitShowPlaybackTargetPicker 是异步的）
        setTimeout(() => {
          const currentState = (video as any).webkitCurrentPlaybackTargetIsWireless;
          if (currentState) {
            clearTimeout(timeout);
            resolve();
          }
        }, 1000);
      });

      return;
    } catch (e) {
      const error: CastError = {
        type: CastErrorType.CONNECTION_FAILED,
        message: 'AirPlay 连接失败',
        protocol: 'airplay',
        deviceId,
      };
      this.setState('error', null);
      this.notifyStateChange(error);
      throw error;
    }
  }

  /**
   * 断开投屏
   */
  async disconnect(): Promise<void> {
    try {
      const video = this.config.videoElement;

      // 取消当前的无线播放
      if (typeof (video as any).webkitSetPlaybackTarget === 'function') {
        (video as any).webkitSetPlaybackTarget(null);
      }

      this.setState('disconnected', null);
      this.notifyDeviceDisconnected();
    } catch (e) {
      console.warn('断开 AirPlay 连接失败:', e);
    }
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    await this.disconnect();

    if (this.airPlayHandler) {
      this.config.videoElement.removeEventListener(
        'webkitplaybacktargetavailabilitychanged',
        this.airPlayHandler
      );
      this.airPlayHandler = null;
    }

    if (this.wirelessChangeHandler) {
      this.config.videoElement.removeEventListener(
        'webkitcurrentplaybacktargetiswirelesschanged',
        this.wirelessChangeHandler
      );
      this.wirelessChangeHandler = null;
    }
  }
}
