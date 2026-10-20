/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites, getCacheTime, getConfig } from '@/lib/config';
import {
  DEFAULT_SEED_CMS_SITES,
  buildProxyPlayUrl,
  isProxyParseSite,
  searchFromApi,
} from '@/lib/downstream';
import { SearchResult } from '@/lib/types';
import { yellowWords } from '@/lib/yellow';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    const cacheTime = await getCacheTime();
    return NextResponse.json(
      { results: [] },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Netlify-Vary': 'query',
        },
      }
    );
  }

  const config = await getConfig();
  const apiSites = await getAvailableApiSites(authInfo.username);

  // 1. 分离 CMS 采集源 与 代理解析源
  const cmsSites = apiSites.filter((site) => !isProxyParseSite(site));
  const parseSites = apiSites.filter((site) => isProxyParseSite(site));

  // 2. 如果用户仅启用了代理解析源而无任何 CMS 源，借用高可用种子源拉取影片元数据基底
  const activeCmsSites = cmsSites.length > 0 ? cmsSites : DEFAULT_SEED_CMS_SITES;

  // 添加超时控制和错误处理，避免慢接口拖累整体响应
  const searchPromises = activeCmsSites.map((site) =>
    Promise.race([
      searchFromApi(site, query),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${site.name} timeout`)), 15000)
      ),
    ]).catch((err) => {
      console.warn(`搜索失败 ${site.name}:`, err.message);
      return []; // 返回空数组而不是抛出错误
    })
  );

  try {
    const results = await Promise.allSettled(searchPromises);
    const successResults = results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => (result as PromiseFulfilledResult<any>).value);
    const baseCmsResults: SearchResult[] = successResults.flat();

    // 3. 为每个代理解析源挂载对应的播放线路结果
    const parseResults: SearchResult[] = [];
    if (parseSites.length > 0 && baseCmsResults.length > 0) {
      // 按片名归一化去重，优先选取集数最多、内容最完整的样本
      const titleTemplateMap = new Map<string, SearchResult>();
      for (const item of baseCmsResults) {
        const cleanTitle = (item.title || '').trim().replace(/\s+/g, ' ').toLowerCase();
        const existing = titleTemplateMap.get(cleanTitle);
        if (!existing || (item.episodes?.length || 0) > (existing.episodes?.length || 0)) {
          titleTemplateMap.set(cleanTitle, item);
        }
      }

      const templates = Array.from(titleTemplateMap.values());
      for (const parseSite of parseSites) {
        for (const tmpl of templates) {
          parseResults.push({
            ...tmpl,
            id: `${parseSite.key}___${tmpl.source}___${tmpl.id}`,
            source: parseSite.key,
            source_name: parseSite.name,
            episodes: (tmpl.episodes || []).map((epUrl) =>
              buildProxyPlayUrl(parseSite.api, epUrl)
            ),
            episodes_titles: tmpl.episodes_titles,
          });
        }
      }
    }

    // 如果用户自身未开启 CMS 源，则只输出代理解析源；若开启了 CMS 源，则将代理解析源与 CMS 源合并输出
    let flattenedResults: SearchResult[] =
      cmsSites.length > 0 ? [...parseResults, ...baseCmsResults] : parseResults;

    if (!config.SiteConfig.DisableYellowFilter) {
      flattenedResults = flattenedResults.filter((result) => {
        const typeName = result.type_name || '';
        return !yellowWords.some((word: string) => typeName.includes(word));
      });
    }
    const cacheTime = await getCacheTime();

    if (flattenedResults.length === 0) {
      // no cache if empty
      return NextResponse.json({ results: [] }, { status: 200 });
    }

    return NextResponse.json(
      { results: flattenedResults },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Netlify-Vary': 'query',
        },
      }
    );
  } catch (error) {
    return NextResponse.json({ error: '搜索失败' }, { status: 500 });
  }
}
