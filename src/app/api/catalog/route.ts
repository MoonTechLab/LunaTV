import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { catalogParameters, catalogQuery, loadCatalog } from '@/lib/catalog-core';
import { API_CONFIG, getAvailableApiSites, getConfig } from '@/lib/config';
import { yellowWords } from '@/lib/yellow';

export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  const auth = getAuthInfoFromCookie(req);
  if (!auth?.username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const sites = await getAvailableApiSites(auth.username);
    const { page, category } = catalogParameters(req.nextUrl.searchParams.get('page') || 1, req.nextUrl.searchParams.get('category'));
    const query = catalogQuery(req.nextUrl.searchParams.get('query'));
    const key = req.nextUrl.searchParams.get('source');
    if (!key) return NextResponse.json({ sources: sites.map(s => ({ id: s.key, name: s.name })) }, { headers: { 'Cache-Control': 'private, no-store' } });
    const source = sites.find(s => s.key === key);
    if (!source) return NextResponse.json({ error: '点播源不存在或无访问权限' }, { status: 404 });
    const config = await getConfig();
    const filtered = !config.SiteConfig.DisableYellowFilter;
    const data = await loadCatalog(source.api, page, category, name => filtered && yellowWords.some(word => name.includes(word)), async url => {
      // Only a server-configured, user-authorized source can be requested; reject redirects.
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
      const abort = () => controller.abort(); req.signal.addEventListener('abort', abort, { once: true });
      try {
        const res = await fetch(url, { headers: API_CONFIG.search.headers, signal: controller.signal, redirect: 'error', cache: 'no-store' });
        if (!res.ok) throw new Error(`点播源暂时不可用（HTTP ${res.status}）`);
        return await res.json();
      } finally { clearTimeout(timer); req.signal.removeEventListener('abort', abort); }
    }, query);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    const message = e instanceof Error ? e.message : '目录加载失败';
    return NextResponse.json({ error: message }, { status: message.startsWith('无效') ? 400 : 502 });
  }
}
