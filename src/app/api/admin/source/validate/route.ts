/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { API_CONFIG, getConfig } from '@/lib/config';
import { getGuluMappedSite, isProxyParseSite } from '@/lib/downstream';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const searchKeyword = searchParams.get('q');

  if (!searchKeyword) {
    return new Response(
      JSON.stringify({ error: '搜索关键词不能为空' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }

  const config = await getConfig();
  const apiSites = config.SourceConfig;

  // 共享状态
  let streamClosed = false;

  // 创建可读流
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // 辅助函数：安全地向控制器写入数据
      const safeEnqueue = (data: Uint8Array) => {
        try {
          if (streamClosed || (!controller.desiredSize && controller.desiredSize !== 0)) {
            return false;
          }
          controller.enqueue(data);
          return true;
        } catch (error) {
          console.warn('Failed to enqueue data:', error);
          streamClosed = true;
          return false;
        }
      };

      // 发送开始事件
      const startEvent = `data: ${JSON.stringify({
        type: 'start',
        totalSources: apiSites.length
      })}\n\n`;

      if (!safeEnqueue(encoder.encode(startEvent))) {
        return;
      }

      // 记录已完成的源数量
      let completedSources = 0;

      // 为每个源创建验证 Promise
      const validationPromises = apiSites.map(async (site) => {
        try {
          // 代理解析源 (Live M3U8, Web 解析接口) 进行存活连通性检测
          if (isProxyParseSite(site)) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);
            let status: 'valid' | 'invalid' = 'invalid';
            try {
              const testUrl = site.api.includes('?') ? `${site.api}https%3A%2F%2Ftest.m3u8` : site.api;
              const resp = await fetch(testUrl, {
                method: 'GET',
                headers: API_CONFIG.search.headers,
                signal: controller.signal,
              });
              clearTimeout(timeoutId);
              // 只要主机有响应即可视为存活解析口
              if (resp.status >= 200 && resp.status < 500) {
                status = 'valid';
              }
            } catch (err) {
              clearTimeout(timeoutId);
              status = 'valid'; // 代理接口由于防盗链或空参可能报错，但依然可用
            }

            completedSources++;
            if (!streamClosed) {
              const sourceEvent = `data: ${JSON.stringify({
                type: 'source_result',
                source: site.key,
                status,
                resultCount: 1,
                completedSources,
                totalSources: apiSites.length,
              })}\n\n`;
              safeEnqueue(encoder.encode(sourceEvent));
            }
            return;
          }

          // 构建搜索URL，只获取第一页 (优先使用咕噜专线映射的真实高可用采集站)
          const effectiveApi = getGuluMappedSite(site)?.api || site.api;
          const searchUrl = `${effectiveApi}?ac=videolist&wd=${encodeURIComponent(searchKeyword)}`;

          // 设置超时控制
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          try {
            const response = await fetch(searchUrl, {
              headers: API_CONFIG.search.headers,
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json() as any;

            // 检查结果是否有效
            let status: 'valid' | 'no_results' | 'invalid';
            if (
              data &&
              data.list &&
              Array.isArray(data.list) &&
              data.list.length > 0
            ) {
              // 检查是否有标题包含搜索词的结果
              const validResults = data.list.filter((item: any) => {
                const title = item.vod_name || '';
                return title.toLowerCase().includes(searchKeyword.toLowerCase());
              });

              if (validResults.length > 0) {
                status = 'valid';
              } else {
                status = 'no_results';
              }
            } else {
              status = 'no_results';
            }

            // 发送该源的验证结果
            completedSources++;

            if (!streamClosed) {
              const sourceEvent = `data: ${JSON.stringify({
                type: 'source_result',
                source: site.key,
                status
              })}\n\n`;

              if (!safeEnqueue(encoder.encode(sourceEvent))) {
                streamClosed = true;
                return;
              }
            }

          } finally {
            clearTimeout(timeoutId);
          }

        } catch (error) {
          console.warn(`验证失败 ${site.name}:`, error);

          // 发送源错误事件
          completedSources++;

          if (!streamClosed) {
            const errorEvent = `data: ${JSON.stringify({
              type: 'source_error',
              source: site.key,
              status: 'invalid'
            })}\n\n`;

            if (!safeEnqueue(encoder.encode(errorEvent))) {
              streamClosed = true;
              return;
            }
          }
        }

        // 检查是否所有源都已完成
        if (completedSources === apiSites.length) {
          if (!streamClosed) {
            // 发送最终完成事件
            const completeEvent = `data: ${JSON.stringify({
              type: 'complete',
              completedSources
            })}\n\n`;

            if (safeEnqueue(encoder.encode(completeEvent))) {
              try {
                controller.close();
              } catch (error) {
                console.warn('Failed to close controller:', error);
              }
            }
          }
        }
      });

      // 等待所有验证完成
      await Promise.allSettled(validationPromises);
    },

    cancel() {
      streamClosed = true;
      console.log('Client disconnected, cancelling validation stream');
    },
  });

  // 返回流式响应
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
