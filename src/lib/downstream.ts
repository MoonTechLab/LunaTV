/* eslint-disable @typescript-eslint/no-explicit-any */

import { API_CONFIG, ApiSite, getConfig } from '@/lib/config';
import { getCachedSearchPage, setCachedSearchPage } from '@/lib/search-cache';
import { SearchResult } from '@/lib/types';
import { cleanHtmlTags } from '@/lib/utils';

interface ApiSearchItem {
  vod_id: string;
  vod_name: string;
  vod_pic: string;
  vod_remarks?: string;
  vod_play_from?: string;
  vod_play_url?: string;
  vod_class?: string;
  vod_year?: string;
  vod_content?: string;
  vod_douban_id?: number;
  type_name?: string;
}

/**
 * 智能筛选最佳播放分集组 (默认强制优先 4K / 原画 / 蓝光顶级画质组)
 */
export function selectBestEpisodesGroup(
  playFromStr?: string,
  playUrlStr?: string
): { episodes: string[]; titles: string[] } {
  if (!playUrlStr) return { episodes: [], titles: [] };

  const playUrlGroups = playUrlStr.split('$$$');
  const playFromGroups = (playFromStr || '').split('$$$');

  let bestEpisodes: string[] = [];
  let bestTitles: string[] = [];
  let bestScore = -1;

  for (let i = 0; i < playUrlGroups.length; i++) {
    const rawUrlGroup = playUrlGroups[i];
    const fromName = (playFromGroups[i] || '').toLowerCase();
    const matchEpisodes: string[] = [];
    const matchTitles: string[] = [];

    const titleUrlArray = rawUrlGroup.split('#');
    for (const item of titleUrlArray) {
      const parts = item.split('$');
      if (
        parts.length === 2 &&
        (parts[1].includes('.m3u8') ||
          parts[1].includes('.mp4') ||
          parts[1].startsWith('http'))
      ) {
        matchTitles.push(parts[0]);
        matchEpisodes.push(parts[1]);
      }
    }

    if (matchEpisodes.length === 0) continue;

    // 计算该组的画质优先级评分：集数基础分 + 画质大加分
    let score = matchEpisodes.length * 10;
    const groupText = `${fromName} ${rawUrlGroup.slice(0, 300)}`.toLowerCase();

    // 4K / 原画 / 蓝光 顶级画质：加 500 分，确保在集数完整时绝对默认选用 4K！
    if (
      groupText.includes('4k') ||
      groupText.includes('2160') ||
      groupText.includes('原画') ||
      groupText.includes('蓝光') ||
      groupText.includes('uhd')
    ) {
      score += 500;
    } else if (groupText.includes('2k') || groupText.includes('1440')) {
      score += 200;
    } else if (
      groupText.includes('1080') ||
      groupText.includes('超清') ||
      groupText.includes('fhd')
    ) {
      score += 50;
    }

    if (score > bestScore) {
      bestScore = score;
      bestEpisodes = matchEpisodes;
      bestTitles = matchTitles;
    }
  }

  return { episodes: bestEpisodes, titles: bestTitles };
}

/**
 * 通用的带缓存搜索函数
 */
async function searchWithCache(
  apiSite: ApiSite,
  query: string,
  page: number,
  url: string,
  timeoutMs = 8000
): Promise<{ results: SearchResult[]; pageCount?: number }> {
  // 先查缓存
  const cached = getCachedSearchPage(apiSite.key, query, page);
  if (cached) {
    if (cached.status === 'ok') {
      return { results: cached.data, pageCount: cached.pageCount };
    } else {
      return { results: [] };
    }
  }

  // 缓存未命中，发起网络请求
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: API_CONFIG.search.headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 403) {
        setCachedSearchPage(apiSite.key, query, page, 'forbidden', []);
      }
      return { results: [] };
    }

    const data = await response.json();
    if (
      !data ||
      !data.list ||
      !Array.isArray(data.list) ||
      data.list.length === 0
    ) {
      // 空结果不做负缓存要求，这里不写入缓存
      return { results: [] };
    }

    // 处理结果数据
    const allResults = data.list.map((item: ApiSearchItem) => {
      // 智能选取最优播放组 (默认强制优先 4K / 原画 / 蓝光)
      const { episodes, titles } = selectBestEpisodesGroup(
        item.vod_play_from,
        item.vod_play_url
      );

      return {
        id: item.vod_id.toString(),
        title: item.vod_name.trim().replace(/\s+/g, ' '),
        poster: item.vod_pic,
        episodes,
        episodes_titles: titles,
        source: apiSite.key,
        source_name: apiSite.name,
        class: item.vod_class,
        year: item.vod_year
          ? item.vod_year.match(/\d{4}/)?.[0] || ''
          : 'unknown',
        desc: cleanHtmlTags(item.vod_content || ''),
        type_name: item.type_name,
        douban_id: item.vod_douban_id,
      };
    });

    // 过滤掉集数为 0 的结果
    const results = allResults.filter((result: SearchResult) => result.episodes.length > 0);

    const pageCount = page === 1 ? data.pagecount || 1 : undefined;
    // 写入缓存（成功）
    setCachedSearchPage(apiSite.key, query, page, 'ok', results, pageCount);
    return { results, pageCount };
  } catch (error: any) {
    clearTimeout(timeoutId);
    // 识别被 AbortController 中止（超时）
    const aborted = error?.name === 'AbortError' || error?.code === 20 || error?.message?.includes('aborted');
    if (aborted) {
      setCachedSearchPage(apiSite.key, query, page, 'timeout', []);
    }
    return { results: [] };
  }
}

/**
 * 咕噜咕噜官方专线映射表 (复刻 GuluGuluTV 官方架构，映射至高可用秒播直连切片源)
 */
export const GULUGULU_OFFICIAL_MAPPINGS: {
  match: (site: ApiSite) => boolean;
  targetApi: string;
  defaultName: string;
}[] = [
  {
    // 咕噜直连切片代理 / glgl.tv (Live M3U8) -> 光速专线 (高并发节点)
    match: (s) => {
      const api = (s.api || '').toLowerCase();
      const key = (s.key || '').toLowerCase();
      const name = (s.name || '').toLowerCase();
      return (
        api.includes('glgl.tv') ||
        key.includes('glgl') ||
        name.includes('咕噜专线代理解析') ||
        name.includes('咕噜直连切片')
      );
    },
    targetApi: 'https://api.guangsuapi.com/api.php/provide/vod/',
    defaultName: '光速专线',
  },
  {
    // 咕噜1号官方专线 / 1ljx.com 主力解析及 API 直连 -> 量子专线 (秒播切片)
    match: (s) => {
      const api = (s.api || '').toLowerCase();
      const key = (s.key || '').toLowerCase();
      const name = (s.name || '').toLowerCase();
      return (
        api.includes('1ljx.com') ||
        key.includes('1ljx') ||
        name.includes('1号线路') ||
        name.includes('咕噜1号')
      );
    },
    targetApi: 'https://cj.lziapi.com/api.php/provide/vod/',
    defaultName: '量子专线',
  },
  {
    // 虾米极速秒播解析 / xmflv.com -> 红牛资源 (超清综合)
    match: (s) => {
      const api = (s.api || '').toLowerCase();
      const key = (s.key || '').toLowerCase();
      const name = (s.name || '').toLowerCase();
      return (
        api.includes('xmflv.com') ||
        key.includes('xmflv') ||
        name.includes('虾米') ||
        name.includes('极速秒播解析')
      );
    },
    targetApi: 'https://www.hongniuzy2.com/api.php/provide/vod/',
    defaultName: '红牛资源',
  },
  {
    // 金鹰蓝光大片解析 / playerjy.com -> 金鹰影视 (蓝光大片)
    match: (s) => {
      const api = (s.api || '').toLowerCase();
      const key = (s.key || '').toLowerCase();
      const name = (s.name || '').toLowerCase();
      return (
        api.includes('playerjy.com') ||
        key.includes('playerjy') ||
        name.includes('金鹰') ||
        name.includes('优质蓝光解析')
      );
    },
    targetApi: 'https://jyzyapi.com/api.php/provide/vod/',
    defaultName: '金鹰影视',
  },
  {
    // UC影音加速专线 / ucyy.cn -> 暴风专线 (高速秒播)
    match: (s) => {
      const api = (s.api || '').toLowerCase();
      const key = (s.key || '').toLowerCase();
      const name = (s.name || '').toLowerCase();
      return (
        api.includes('ucyy.cn') ||
        key.includes('ucyy') ||
        name.includes('uc影音') ||
        name.includes('uc_speed')
      );
    },
    targetApi: 'https://bfzyapi.com/api.php/provide/vod/',
    defaultName: '暴风专线',
  },
];

/**
 * 获取咕噜咕噜官方专线映射的真实执行采集源
 */
export function getGuluMappedSite(site: ApiSite): ApiSite | null {
  if (!site || !site.api) return null;
  const apiLower = site.api.toLowerCase().trim();
  const isDirectCms =
    apiLower.includes('/api.php/provide/vod/') ||
    apiLower.includes('/provide/vod/');

  // 若本身已是纯 CMS 采集接口且不带代理解析参数，无需映射
  if (isDirectCms && !apiLower.includes('?url=') && !apiLower.includes('live.m3u8')) {
    return null;
  }

  for (const m of GULUGULU_OFFICIAL_MAPPINGS) {
    if (m.match(site)) {
      return {
        key: site.key,
        name: site.name,
        api: m.targetApi,
      };
    }
  }
  return null;
}

/**
 * 判断是否为代理解析/播放代理型视频源 (含 ?url=, &url=, live.m3u8, 纯解析口)
 */
export function isProxyParseSite(site: ApiSite): boolean {
  if (!site || !site.api) return false;
  // 能命中咕噜咕噜官方映射的，直接按高可用真实采集源调度，绝不走残缺代理解析通道
  if (getGuluMappedSite(site)) {
    return false;
  }
  const api = site.api.trim().toLowerCase();
  return (
    api.includes('?url=') ||
    api.includes('&url=') ||
    api.includes('live.m3u8') ||
    api.endsWith('.m3u8') ||
    api.includes('api.php?url=')
  );
}

/**
 * 将原始视频播放地址与代理解析接口拼接
 */
export function buildProxyPlayUrl(proxyApi: string, rawUrl: string): string {
  if (!rawUrl) return '';
  const trimmedApi = (proxyApi || '').trim();
  if (!trimmedApi) return rawUrl;

  if (
    trimmedApi.endsWith('=') ||
    trimmedApi.endsWith('?url=') ||
    trimmedApi.includes('?url=') ||
    trimmedApi.includes('&url=')
  ) {
    return `${trimmedApi}${rawUrl}`;
  }
  if (trimmedApi.includes('?')) {
    return `${trimmedApi}&url=${encodeURIComponent(rawUrl)}`;
  }
  return `${trimmedApi}?url=${encodeURIComponent(rawUrl)}`;
}

// 内置高可用种子源 (供代理解析型视频源作为索引基座借用)
export const DEFAULT_SEED_CMS_SITES: ApiSite[] = [
  { key: 'seed_lzi', name: '量子专线', api: 'https://cj.lziapi.com/api.php/provide/vod/' },
  { key: 'seed_jy', name: '金鹰影视', api: 'https://jyzyapi.com/provide/vod/' },
  { key: 'seed_bf', name: '暴风专线', api: 'https://bfzyapi.com/api.php/provide/vod/' },
  { key: 'seed_hn', name: '红牛资源', api: 'https://www.hongniuzy2.com/api.php/provide/vod/' },
];

export async function searchFromApi(
  apiSite: ApiSite,
  query: string
): Promise<SearchResult[]> {
  try {
    // 咕噜咕噜官方专线映射：直接用目标高速秒播采集站执行搜索并返回真实直链切片
    const guluMapped = getGuluMappedSite(apiSite);
    if (guluMapped) {
      const realResults = await searchFromApi(
        {
          key: apiSite.key,
          name: apiSite.name,
          api: guluMapped.api,
        },
        query
      );
      return realResults.map((item) => ({
        ...item,
        id: `${apiSite.key}___${apiSite.key}___${item.id}`,
        source: apiSite.key,
        source_name: apiSite.name,
        // 真实 M3U8 秒播切片直链，不加任何死链前缀
        episodes: item.episodes || [],
        episodes_titles: item.episodes_titles,
      }));
    }

    const apiBaseUrl = (apiSite.api || '').trim();
    // 代理解析源借用种子源拉取影片分集并包装返回
    if (isProxyParseSite(apiSite)) {
      for (const seed of DEFAULT_SEED_CMS_SITES) {
        try {
          const baseResults = await searchFromApi(seed, query);
          if (baseResults && baseResults.length > 0) {
            return baseResults.map((item) => ({
              ...item,
              id: `${apiSite.key}___${item.source}___${item.id}`,
              source: apiSite.key,
              source_name: apiSite.name,
              episodes: (item.episodes || []).map((epUrl) =>
                buildProxyPlayUrl(apiSite.api, epUrl)
              ),
              episodes_titles: item.episodes_titles,
            }));
          }
        } catch (_) {}
      }
      return [];
    }
    const apiUrl =
      apiBaseUrl + API_CONFIG.search.path + encodeURIComponent(query);

    // 使用新的缓存搜索函数处理第一页
    const firstPageResult = await searchWithCache(apiSite, query, 1, apiUrl, 8000);
    const results = firstPageResult.results;
    const pageCountFromFirst = firstPageResult.pageCount;

    const config = await getConfig();
    const MAX_SEARCH_PAGES: number = config.SiteConfig.SearchDownstreamMaxPage;

    // 获取总页数
    const pageCount = pageCountFromFirst || 1;
    // 确定需要获取的额外页数
    const pagesToFetch = Math.min(pageCount - 1, MAX_SEARCH_PAGES - 1);

    // 如果有额外页数，获取更多页的结果
    if (pagesToFetch > 0) {
      const additionalPagePromises = [];

      for (let page = 2; page <= pagesToFetch + 1; page++) {
        const pageUrl =
          apiBaseUrl +
          API_CONFIG.search.pagePath
            .replace('{query}', encodeURIComponent(query))
            .replace('{page}', page.toString());

        const pagePromise = (async () => {
          // 使用新的缓存搜索函数处理分页
          const pageResult = await searchWithCache(apiSite, query, page, pageUrl, 8000);
          return pageResult.results;
        })();

        additionalPagePromises.push(pagePromise);
      }

      // 等待所有额外页的结果
      const additionalResults = await Promise.all(additionalPagePromises);

      // 合并所有页的结果
      additionalResults.forEach((pageResults) => {
        if (pageResults.length > 0) {
          results.push(...pageResults);
        }
      });
    }

    return results;
  } catch (error) {
    return [];
  }
}

// 匹配 m3u8 链接的正则
const M3U8_PATTERN = /(https?:\/\/[^"'\s]+?\.m3u8)/g;

export async function getDetailFromApi(
  apiSite: ApiSite,
  id: string
): Promise<SearchResult> {
  // 咕噜官方专线映射处理：直接获取真实采集站详情与高清直链切片
  const guluMapped = getGuluMappedSite(apiSite);
  if (guluMapped) {
    let realId = id;
    if (id.includes('___')) {
      const parts = id.split('___');
      realId = parts[2] || id;
    }
    const targetSite = {
      key: apiSite.key,
      name: apiSite.name,
      api: guluMapped.api,
    };
    const realDetail = await getDetailFromApi(targetSite, realId);
    return {
      ...realDetail,
      id: id,
      source: apiSite.key,
      source_name: apiSite.name,
      episodes: realDetail.episodes || [],
      episodes_titles: realDetail.episodes_titles,
    };
  }

  // 代理解析型源或三段式 ID 处理
  if (isProxyParseSite(apiSite) || id.includes('___')) {
    let baseSourceKey = '';
    let baseId = id;
    if (id.includes('___')) {
      const parts = id.split('___');
      baseSourceKey = parts[1] || '';
      baseId = parts[2] || id;
    }

    const config = await getConfig();
    const sourceList = config.SourceConfig || [];
    let baseSite: ApiSite | undefined = sourceList.find(
      (s) => s.key === baseSourceKey && !isProxyParseSite(s)
    );
    if (!baseSite) {
      baseSite =
        sourceList.find((s) => !isProxyParseSite(s)) || DEFAULT_SEED_CMS_SITES[0];
    }

    const targetSite = baseSite || DEFAULT_SEED_CMS_SITES[0];
    const baseDetail = await getDetailFromApi(targetSite, baseId);
    return {
      ...baseDetail,
      id: id,
      source: apiSite.key,
      source_name: apiSite.name,
      episodes: (baseDetail.episodes || []).map((u) =>
        buildProxyPlayUrl(apiSite.api, u)
      ),
      episodes_titles: baseDetail.episodes_titles,
    };
  }

  // 仅当非标准 JSON API 且明确带有 detail 时，才尝试 HTML 详情爬取；标准采集接口一律直接走高速 JSON API
  const isStandardJsonApi =
    apiSite.api.includes('/api.php') ||
    apiSite.api.includes('/provide/vod') ||
    apiSite.api.includes('zyapi.php') ||
    apiSite.api.includes('ac=videolist') ||
    apiSite.api.includes('ac=detail');
  if (apiSite.detail && !isStandardJsonApi) {
    return handleSpecialSourceDetail(id, apiSite);
  }

  const detailUrl = `${apiSite.api}${API_CONFIG.detail.path}${id}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const response = await fetch(detailUrl, {
    headers: API_CONFIG.detail.headers,
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`详情请求失败: ${response.status}`);
  }

  const data = await response.json();

  if (
    !data ||
    !data.list ||
    !Array.isArray(data.list) ||
    data.list.length === 0
  ) {
    throw new Error('获取到的详情内容无效');
  }

  const videoDetail = data.list[0];

  // 智能选取最优播放组 (默认强制优先 4K / 原画 / 蓝光)
  let { episodes, titles } = selectBestEpisodesGroup(
    videoDetail.vod_play_from,
    videoDetail.vod_play_url
  );

  // 如果播放源为空，则尝试从内容中解析 m3u8
  if (episodes.length === 0 && videoDetail.vod_content) {
    const matches = videoDetail.vod_content.match(M3U8_PATTERN) || [];
    episodes = matches.map((link: string) => link.replace(/^\$/, ''));
  }

  return {
    id: id.toString(),
    title: videoDetail.vod_name,
    poster: videoDetail.vod_pic,
    episodes,
    episodes_titles: titles,
    source: apiSite.key,
    source_name: apiSite.name,
    class: videoDetail.vod_class,
    year: videoDetail.vod_year
      ? videoDetail.vod_year.match(/\d{4}/)?.[0] || ''
      : 'unknown',
    desc: cleanHtmlTags(videoDetail.vod_content),
    type_name: videoDetail.type_name,
    douban_id: videoDetail.vod_douban_id,
  };
}

async function handleSpecialSourceDetail(
  id: string,
  apiSite: ApiSite
): Promise<SearchResult> {
  const detailUrl = `${apiSite.detail}/index.php/vod/detail/id/${id}.html`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const response = await fetch(detailUrl, {
    headers: API_CONFIG.detail.headers,
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`详情页请求失败: ${response.status}`);
  }

  const html = await response.text();
  let matches: string[] = [];

  if (apiSite.key === 'ffzy') {
    const ffzyPattern =
      /\$(https?:\/\/[^"'\s]+?\/\d{8}\/\d+_[a-f0-9]+\/index\.m3u8)/g;
    matches = html.match(ffzyPattern) || [];
  }

  if (matches.length === 0) {
    const generalPattern = /\$(https?:\/\/[^"'\s]+?\.m3u8)/g;
    matches = html.match(generalPattern) || [];
  }

  // 去重并清理链接前缀
  matches = Array.from(new Set(matches)).map((link: string) => {
    link = link.substring(1); // 去掉开头的 $
    const parenIndex = link.indexOf('(');
    return parenIndex > 0 ? link.substring(0, parenIndex) : link;
  });

  // 根据 matches 数量生成剧集标题
  const episodes_titles = Array.from({ length: matches.length }, (_, i) =>
    (i + 1).toString()
  );

  // 提取标题
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  const titleText = titleMatch ? titleMatch[1].trim() : '';

  // 提取描述
  const descMatch = html.match(
    /<div[^>]*class=["']sketch["'][^>]*>([\s\S]*?)<\/div>/
  );
  const descText = descMatch ? cleanHtmlTags(descMatch[1]) : '';

  // 提取封面
  const coverMatch = html.match(/(https?:\/\/[^"'\s]+?\.jpg)/g);
  const coverUrl = coverMatch ? coverMatch[0].trim() : '';

  // 提取年份
  const yearMatch = html.match(/>(\d{4})</);
  const yearText = yearMatch ? yearMatch[1] : 'unknown';

  return {
    id,
    title: titleText,
    poster: coverUrl,
    episodes: matches,
    episodes_titles,
    source: apiSite.key,
    source_name: apiSite.name,
    class: '',
    year: yearText,
    desc: descText,
    type_name: '',
    douban_id: 0,
  };
}
