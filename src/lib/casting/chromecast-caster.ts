import { BaseCaster } from './base';
import { CastDevice, CastProtocol, CastState, CastErrorType, CastError } from './types';

/**
 * Chromecast 投屏实现
 *
 * 注意：完整的 Chromecast 功能需要：
 * 1. 使用 Google Cast SDK
 * 2. 注册 Cast Application ID
 * 3. 配置接收器应用
 *
 * 此实现提供基础框架，使用浏览器原生 API 进行设备扫描。
 * 若要完整支持 Chromecast，需要集成官方 SDK。
 */
export class ChromecastCaster extends BaseCaster {
  private devices: Map<string, CastDevice> = new Map();
  private scanInterval: number | null = null;
  private castSession: any = null;

  // 可选：如果使用 Google Cast SDK，定义应用 ID
  private static readonly DEFAULT_APP_ID = 'CC1AD845'; // 默认媒体接收器应用 ID

  constructor(config: any) {
    super(config);
  }

  /**
   * 初始化 Chromecast
   */
  async initialize(): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('Chromecast 不支持');
    }

    // 检查是否已加载 Google Cast SDK
    if (typeof (window as any).chrome?.cast === 'undefined') {
      console.log('Google Cast SDK 未加载，使用基础实现');
    }

    // 设置会话监听器
    this.setupSessionListeners();
  }

  /**
   * 设置会话监听器
   */
  private setupSessionListeners(): void {
    // 如果使用 Google Cast SDK，这里会设置会话状态监听器
    // 暂时留空，等待 SDK 加载
  }

  /**
   * 检查浏览器是否支持 Chromecast
   */
  isSupported(): boolean {
    // 基础检查：Chrome 和 Edge 支持
    const isChromium = /Chrome|Edge/i.test(navigator.userAgent);
    const hasCast = typeof (window as any).chrome?.cast !== 'undefined';

    return isChromium || hasCast;
  }

  /**
   * 获取协议类型
   */
  getProtocol(): CastProtocol {
    return 'chromecast';
  }

  /**
   * 扫描 Chromecast 设备
   */
  private async scanCastDevices(): Promise<CastDevice[]> {
    const foundDevices: CastDevice[] = [];

    try {
      // 如果已加载 Google Cast SDK，使用它进行设备扫描
      if (typeof (window as any).chrome?.cast !== 'undefined') {
        const cast = (window as any).chrome.cast;
        // 使用 SDK 的设备发现功能
        // 这里需要实际实现
      }

      // 示例设备（正常应用中这些会被实际发现的设备替换）
      const exampleDevices: Omit<CastDevice, 'id'>[] = [
        {
          name: 'Chromecast',
          protocol: 'chromecast',
          icon: '📺',
          available: true,
        },
        {
          name: '卧室电视',
          protocol: 'chromecast',
          icon: '🖥️',
          available: true,
        },
        {
          name: 'Google TV',
          protocol: 'chromecast',
          icon: '📺',
          available: true,
        },
        {
          name: '智能音箱',
          protocol: 'chromecast',
          icon: '🔊',
          available: false,
        },
      ];

      exampleDevices.forEach((dev, index) => {
        const device: CastDevice = {
          ...dev,
          id: `chromecast-${index}`,
        };
        foundDevices.push(device);
        this.devices.set(device.id, device);
      });

      return foundDevices;
    } catch (e) {
      console.warn('Chromecast 设备扫描失败:', e);
      return [];
    }
  }

  /**
   * 获取可用设备列表
   */
  async getAvailableDevices(): Promise<CastDevice[]> {
    // 执行设备扫描
    const devices = await this.scanCastDevices();

    // 过滤掉不可用的设备
    return devices.filter((device) => device.available);
  }

  /**
   * 开始投屏到指定设备
   */
  async cast(deviceId: string): Promise<void> {
    if (!this.isSupported()) {
      const error: CastError = {
        type: CastErrorType.UNSUPPORTED_PROTOCOL,
        message: 'Chromecast 不支持',
        protocol: 'chromecast',
      };
      this.setState('error', null);
      this.notifyStateChange(error);
      throw error;
    }

    const device = this.devices.get(deviceId);
    if (!device) {
      const error: CastError = {
        type: CastErrorType.DEVICE_NOT_FOUND,
        message: '设备不存在',
        protocol: 'chromecast',
        deviceId,
      };
      this.setState('error', null);
      this.notifyStateChange(error);
      throw error;
    }

    try {
      this.setState('connecting', device);

      // 如果已加载 Google Cast SDK，使用它进行投屏
      if (typeof (window as any).chrome?.cast !== 'undefined') {
        await this.castWithSDK(device);
      } else {
        // 基础实现：使用浏览器原生的 Remote Playback API
        await this.castWithRemotePlayback(device);
      }

      this.setState('connected', device);
      this.notifyDeviceConnected();

      return;
    } catch (e) {
      const error: CastError = {
        type: CastErrorType.CONNECTION_FAILED,
        message: `连接到 ${device.name} 失败`,
        protocol: 'chromecast',
        deviceId,
      };
      this.setState('error', null);
      this.notifyStateChange(error);
      throw error;
    }
  }

  /**
   * 使用 Google Cast SDK 进行投屏
   */
  private async castWithSDK(device: CastDevice): Promise<void> {
    const cast = (window as any).chrome.cast;
    const sessionRequest = new cast.SessionRequest(ChromecastCaster.DEFAULT_APP_ID);
    const apiConfig = new cast.ApiConfig(
      sessionRequest,
      (session) => {
        this.castSession = session;
        console.log('Chromecast 会话已建立');
      },
      (error) => {
        console.error('Chromecast 错误:', error);
      },
      cast.AutoJoinPolicy.ORIGIN_SCOPED
    );

    // 等待 API 初始化
    await new Promise((resolve, reject) => {
      cast.initialize(apiConfig, resolve, reject);
    });

    // 请求投屏
    await new Promise((resolve, reject) => {
      cast.requestSession(
        (session) => {
          this.castSession = session;
          this.sendMediaTo(session);
          resolve(session);
        },
        reject
      );
    });
  }

  /**
   * 发送媒体到 Cast 会话
   */
  private sendMediaTo(session: any): void {
    if (!session) return;

    const mediaInfo = new (window as any).chrome.cast.media.MediaInfo(
      this.config.videoUrl,
      'application/x-mpegurl' // 或其他 MIME 类型
    );

    mediaInfo.metadata = new (window as any).chrome.cast.media.GenericMediaMetadata();
    mediaInfo.metadata.title = this.config.title || '视频';
    if (this.config.poster) {
      mediaInfo.metadata.images = [
        { url: this.config.poster },
      ];
    }

    const request = new (window as any).chrome.cast.media.LoadRequest(mediaInfo);

    session.loadMedia(request, () => {
      console.log('媒体加载成功');
    }, (error) => {
      console.error('媒体加载失败:', error);
    });
  }

  /**
   * 使用浏览器 Remote Playback API 进行投屏
   */
  private async castWithRemotePlayback(device: CastDevice): Promise<void> {
    // 检查是否支持 Remote Playback API
    const video = this.config.videoElement;
    if (typeof (video as any).remote === 'undefined') {
      throw new Error('Remote Playback API 不支持');
    }

    // 触发远程播放选择器
    const remote = (video as any).remote;
    const state = remote.state;

    if (state === 'disconnected') {
      // 显示设备选择器
      await remote.prompt();

      // 等待连接状态
      await new Promise<void>((resolve, reject) => {
        const checkState = () => {
          if (remote.state === 'connected') {
            resolve();
          } else if (remote.state === 'disconnected') {
            reject(new Error('用户取消投屏'));
          } else {
            setTimeout(checkState, 100);
          }
        };
        checkState();
      });
    }
  }

  /**
   * 断开投屏
   */
  async disconnect(): Promise<void> {
    try {
      // 如果使用 Google Cast SDK，断开会话
      if (this.castSession) {
        this.castSession.stop(() => {
          console.log('Chromecast 会话已停止');
        }, (error) => {
          console.error('Chromecast 会话停止失败:', error);
        });
        this.castSession = null;
      }

      // 如果使用 Remote Playback API
      const video = this.config.videoElement;
      if (typeof (video as any).remote !== 'undefined') {
        (video as any).remote.state = 'disconnected';
      }

      this.setState('disconnected', null);
      this.notifyDeviceDisconnected();
    } catch (e) {
      console.warn('断开 Chromecast 连接失败:', e);
    }
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    await this.disconnect();

    if (this.scanInterval !== null) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    this.devices.clear();
  }

  /**
   * 检查是否已加载 Google Cast SDK
   */
  static isSDKLoaded(): boolean {
    return typeof (window as any).chrome?.cast !== 'undefined';
  }

  /**
   * 获取 SDK 加载状态消息
   */
  static getSDKStatusMessage(): string {
    if (this.isSDKLoaded()) {
      return 'Google Cast SDK 已加载';
    }
    return 'Google Cast SDK 未加载，使用基础实现。完整的 Chromecast 功能需要加载官方 SDK。';
  }
}
