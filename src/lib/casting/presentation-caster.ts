import { BaseCaster } from './base';
import { CastDevice, CastProtocol, CastState, CastErrorType, CastError } from './types';

/**
 * 使用浏览器 Presentation API 实现投屏
 * 支持 Chrome、Edge、Safari 等现代浏览器
 */
export class PresentationCaster extends BaseCaster {
  private request: PresentationRequest | null = null;
  private connection: PresentationConnection | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;

  constructor(config: any) {
    super(config);
  }

  /**
   * 初始化 Presentation API
   */
  async initialize(): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('Presentation API 不支持');
    }

    // 监听可用显示设备
    if (navigator.presentation) {
      navigator.presentation.defaultRequest = new PresentationRequest([
        this.config.videoUrl,
      ]);
      this.request = navigator.presentation.defaultRequest;
    }
  }

  /**
   * 检查浏览器是否支持 Presentation API
   */
  isSupported(): boolean {
    return (
      typeof PresentationRequest !== 'undefined' ||
      (navigator as any).presentation?.request !== undefined
    );
  }

  /**
   * 获取协议类型
   */
  getProtocol(): CastProtocol {
    return 'presentation';
  }

  /**
   * 获取可用设备列表
   * 注意：Presentation API 不支持预获取设备列表
   * 只能在调用 request() 时让用户选择
   */
  async getAvailableDevices(): Promise<CastDevice[]> {
    // Presentation API 不支持提前获取设备列表
    // 返回一个虚拟设备，表示"系统选择器"
    if (this.isSupported()) {
      return [
        {
          id: 'system-picker',
          name: '选择投屏设备',
          protocol: 'presentation',
          icon: '📺',
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
        message: 'Presentation API 不支持',
        protocol: 'presentation',
      };
      this.setState('error', null);
      this.notifyStateChange(error);
      throw error;
    }

    try {
      this.setState('connecting', null);

      // 创建投屏请求
      if (!this.request) {
        this.request = new PresentationRequest([this.config.videoUrl]);
      }

      // 设置连接监听器
      this.setupConnectionListeners(this.request);

      // 开始投屏
      this.connection = await this.request.start();

      // 重置重连计数
      this.reconnectAttempts = 0;

      // 发送视频信息到接收器
      if (this.connection.state === 'connected') {
        this.sendVideoInfo();
      }

      // 创建虚拟设备信息
      const device: CastDevice = {
        id: 'presentation-device',
        name: '投屏设备',
        protocol: 'presentation',
        icon: '📺',
        available: true,
      };

      this.setState('connected', device);
      this.notifyDeviceConnected();

      return;
    } catch (e) {
      const error: CastError = {
        type: CastErrorType.CONNECTION_FAILED,
        message: '投屏连接失败',
        protocol: 'presentation',
        deviceId,
      };
      this.setState('error', null);
      this.notifyStateChange(error);
      throw error;
    }
  }

  /**
   * 设置连接监听器
   */
  private setupConnectionListeners(request: PresentationRequest): void {
    // 连接到现有会话
    request.addEventListener('connect', (event: PresentationConnectionAvailableEvent) => {
      this.connection = event.connection;
      this.setState('connected', this.currentDevice);
      this.sendVideoInfo();
    });

    // 连接关闭
    request.addEventListener('disconnect', () => {
      this.setState('disconnected', null);
      this.notifyDeviceDisconnected();
    });

    // 连接终止
    request.addEventListener('terminate', () => {
      this.setState('disconnected', null);
      this.notifyDeviceDisconnected();
    });
  }

  /**
   * 发送视频信息到接收器
   */
  private sendVideoInfo(): void {
    if (!this.connection || this.connection.state !== 'connected') return;

    try {
      const message = {
        type: 'load',
        video: {
          url: this.config.videoUrl,
          poster: this.config.poster,
          title: this.config.title,
        },
      };
      this.connection.send(JSON.stringify(message));
    } catch (e) {
      console.warn('发送视频信息失败:', e);
    }
  }

  /**
   * 断开投屏
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      if (this.connection.state === 'connected') {
        this.connection.close();
      }
      this.connection = null;
    }

    this.setState('disconnected', null);
    this.notifyDeviceDisconnected();
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    await this.disconnect();
    this.request = null;
  }
}
