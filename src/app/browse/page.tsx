'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

import type { CatalogPage } from '@/lib/catalog-core';

import CatalogBrowser from '@/components/CatalogBrowser';
import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

function BrowseContent() {
  const params = useSearchParams();
  const [sources, setSources] = useState<{ id: string; name: string }[]>([]), [error, setError] = useState(''), [attempt, setAttempt] = useState(0), [ready, setReady] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setError(''); setReady(false);
    fetch('/api/catalog', { signal: controller.signal }).then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error || '点播源加载失败'); return data.sources; })
      .then(data => { if (!controller.signal.aborted) { setSources(data); setReady(true); } }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [attempt]);
  const fetchPage = useCallback(async (source: string, category: string, page: number, signal: AbortSignal, query: string): Promise<CatalogPage> => {
    const res = await fetch('/api/catalog?' + new URLSearchParams({ source, category, page: String(page), query }), { signal });
    const data = await res.json(); if (!res.ok) throw new Error(data.error || '目录加载失败'); return data;
  }, []);
  return <PageLayout activePath="/browse"><div className="px-4 md:px-8 py-8 max-w-screen-2xl mx-auto">
    {error ? <div role="status"><p>{error}</p><button className="mt-3 underline" onClick={() => setAttempt(n => n + 1)}>重试加载</button></div> : !ready ? <p role="status">正在加载点播源...</p> : <CatalogBrowser sources={sources} fetchPage={fetchPage} initialSource={params.get('source') || ''} initialCategory={params.get('category') || ''} initialQuery={params.get('query') || ''} renderCard={(item, source) => <VideoCard id={item.id} source={source} title={item.title} poster={item.poster} year={item.year} from="search" source_name={sources.find(s => s.id === source)?.name} />} />}
  </div></PageLayout>;
}
export default function BrowsePage() { return <Suspense><BrowseContent /></Suspense>; }
