'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createDeviceManager, type DeviceManager, saveLastUsedDevice, clearLastUsedDevice } from '../lib/casting';
import type { CastConfig, CastState, CastDevice } from '../lib/casting/types';

/**
 * 投屏 Hook - 管理投屏状态和操作
 */
export function useCasting(videoElement: HTMLVideoElement | null, videoUrl: string, poster?: string, title?: string) {
  const [deviceManager, setDeviceManager] = useState<DeviceManager | null>(null);
  const [state, setState] = useState<CastState>('idle');
  const [currentDevice, setCurrentDevice] = useState<CastDevice | null>(null);
  const [devices, setDevices] = useState<CastDevice[]>([]);
  const [isDeviceSelectorOpen, setIsDeviceSelectorOpen] = useState(false);

  const deviceManagerRef = useRef<DeviceManager | null>(null);
  const isInitializedRef = useRef(false);

  // 初始化设备管理器
  useEffect(() => {
    if (!videoElement || !videoUrl || isInitializedRef.current) {
      return;
    }

    isInitializedRef.current = true;

    const config: CastConfig = {
      videoElement,
      videoUrl,
      poster,
      title,
    };

    const manager = createDeviceManager(config);
    deviceManagerRef.current = manager;
    setDeviceManager(manager);

    // 订阅状态变化
    const unsubscribeState = manager.subscribeToStateChange((newState, device) => {
      setState(newState);
      setCurrentDevice(device);

      // 保存最近使用的设备信息
      if (newState === 'connected' && device) {
        saveLastUsedDevice(device.id, device.name, device.protocol);
      } else if (newState === 'disconnected') {
        clearLastUsedDevice();
      }
    });

    // 订阅设备列表更新
    const unsubscribeDevices = manager.subscribeToDeviceUpdates((newDevices) => {
      setDevices(newDevices);
    });

    return () => {
      unsubscribeState();
      unsubscribeDevices();
      manager.cleanup();
      isInitializedRef.current = false;
      deviceManagerRef.current = null;
    };
  }, [videoElement, videoUrl, poster, title]);

  // 当视频 URL 变化时，更新设备管理器配置
  useEffect(() => {
    if (deviceManagerRef.current && videoUrl) {
      deviceManagerRef.current.updateConfig({
        videoUrl,
        poster,
        title,
      });
    }
  }, [videoUrl, poster, title]);

  // 扫描设备
  const scanDevices = useCallback(async () => {
    if (!deviceManagerRef.current) return;

    try {
      await deviceManagerRef.current.scanDevices();
    } catch (error) {
      console.error('扫描设备失败:', error);
    }
  }, []);

  // 连接到指定设备
  const connect = useCallback(async (deviceId: string) => {
    if (!deviceManagerRef.current) {
      console.error('设备管理器未初始化');
      return;
    }

    try {
      await deviceManagerRef.current.connect(deviceId);
      setIsDeviceSelectorOpen(false);
    } catch (error) {
      console.error('连接设备失败:', error);
      throw error;
    }
  }, []);

  // 断开连接
  const disconnect = useCallback(async () => {
    if (!deviceManagerRef.current) {
      return;
    }

    try {
      await deviceManagerRef.current.disconnect();
      setIsDeviceSelectorOpen(false);
    } catch (error) {
      console.error('断开连接失败:', error);
      throw error;
    }
  }, []);

  // 打开设备选择器
  const openDeviceSelector = useCallback(async () => {
    setIsDeviceSelectorOpen(true);
    await scanDevices();
  }, [scanDevices]);

  // 切换投屏状态（如果已连接则断开，否则打开选择器）
  const toggleCasting = useCallback(async () => {
    const isConnected = state === 'connected';

    if (isConnected) {
      // 已连接，打开选择器显示断开选项
      setIsDeviceSelectorOpen(true);
    } else {
      // 未连接，打开设备选择器
      await openDeviceSelector();
    }
  }, [state, openDeviceSelector]);

  // 刷新设备列表
  const refreshDevices = useCallback(async () => {
    await scanDevices();
  }, [scanDevices]);

  return {
    // 状态
    state,
    currentDevice,
    devices,
    isDeviceSelectorOpen,

    // 操作
    scanDevices,
    connect,
    disconnect,
    openDeviceSelector,
    closeDeviceSelector: () => setIsDeviceSelectorOpen(false),
    refreshDevices,
    toggleCasting,

    // 快捷检查
    isConnected: state === 'connected',
    isConnecting: state === 'connecting',
    isScanning: state === 'scanning',
    hasDevices: devices.length > 0,

    // 设备管理器实例（用于高级操作）
    deviceManager: deviceManagerRef.current,
  };
}
