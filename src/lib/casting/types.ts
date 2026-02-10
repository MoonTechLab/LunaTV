// 投屏协议类型
export type CastProtocol = 'presentation' | 'dlna' | 'airplay' | 'chromecast';

// 投屏状态
export type CastState = 'idle' | 'scanning' | 'connecting' | 'connected' | 'disconnected' | 'error';

// 投屏设备信息
export interface CastDevice {
  id: string;
  name: string;
  protocol: CastProtocol;
  icon: string;
  available: boolean;
}

// 投屏元数据
export interface CastMetadata {
  title: string;
  poster?: string;
  duration?: number;
  type: 'video' | 'audio';
}

// 投屏配置
export interface CastConfig {
  videoElement: HTMLVideoElement;
  videoUrl: string;
  poster?: string;
  title?: string;
}

// 投屏错误类型
export enum CastErrorType {
  DEVICE_NOT_FOUND = 'DEVICE_NOT_FOUND',
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  DEVICE_DISCONNECTED = 'DEVICE_DISCONNECTED',
  INVALID_VIDEO_URL = 'INVALID_VIDEO_URL',
  UNSUPPORTED_PROTOCOL = 'UNSUPPORTED_PROTOCOL',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  TIMEOUT = 'TIMEOUT',
}

// 投屏错误
export interface CastError {
  type: CastErrorType;
  message: string;
  protocol?: CastProtocol;
  deviceId?: string;
}

// 投屏状态变化回调
export type CastStateCallback = (state: CastState, device: CastDevice | null, error?: CastError) => void;

// 设备列表更新回调
export type DeviceListCallback = (devices: CastDevice[]) => void;

// 协议支持信息
export interface ProtocolCapabilities {
  presentation: boolean;
  airplay: boolean;
  chromecast: boolean;
  dlna: boolean;
}
