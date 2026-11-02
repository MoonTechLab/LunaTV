/**
 * 通用的豆瓣数据获取函数
 * @param url 请求的URL
 * @returns Promise<T> 返回指定类型的数据
 */

export type DoubanProxyType =
  | 'direct'
  | 'cors-proxy-zwei'
  | 'cmliussss-cdn-tencent'
  | 'cmliussss-cdn-ali'
  | 'cors-anywhere'
  | 'custom';

export function getDoubanProxyConfig(): {
  proxyType: DoubanProxyType;
  proxyUrl: string;
} {
  const proxyType =
    (process.env.NEXT_PUBLIC_DOUBAN_PROXY_TYPE || 'cmliussss-cdn-tencent') as DoubanProxyType;
  const proxyUrl = process.env.NEXT_PUBLIC_DOUBAN_PROXY || '';

  return {
    proxyType,
    proxyUrl,
  };
}

export function resolveDoubanUrl(url: string): string {
  const { proxyType, proxyUrl } = getDoubanProxyConfig();

  switch (proxyType) {
    case 'cors-proxy-zwei':
      return `https://ciao-cors.is-an.org/${encodeURIComponent(url)}`;
    case 'cmliussss-cdn-tencent':
      return url
        .replace('https://m.douban.com', 'https://m.douban.cmliussss.net')
        .replace('https://movie.douban.com', 'https://movie.douban.cmliussss.net');
    case 'cmliussss-cdn-ali':
      return url
        .replace('https://m.douban.com', 'https://m.douban.cmliussss.com')
        .replace('https://movie.douban.com', 'https://movie.douban.cmliussss.com');
    case 'cors-anywhere':
      return `https://cors-anywhere.com/${url}`;
    case 'custom':
      return proxyUrl ? `${proxyUrl}${encodeURIComponent(url)}` : url;
    case 'direct':
    default:
      return url;
  }
}

export async function fetchDoubanData<T>(url: string): Promise<T> {
  // 添加超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

  // 设置请求选项，包括信号和头部
  const fetchOptions = {
    signal: controller.signal,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      Referer: 'https://movie.douban.com/',
      Accept: 'application/json, text/plain, */*',
      Origin: 'https://movie.douban.com',
    },
  };

  try {
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}
