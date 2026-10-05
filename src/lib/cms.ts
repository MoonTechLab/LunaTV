export interface CmsVideoItem {
  vod_id: string;
  vod_name: string;
  vod_pic: string;
  vod_remarks?: string;
  vod_play_url?: string;
  vod_class?: string;
  vod_year?: string;
  vod_content?: string;
  vod_douban_id?: number;
  type_name?: string;
}

export interface CmsPayload {
  list: CmsVideoItem[];
  pagecount?: number;
}

const PLAY_URL_RE = /\.(m3u8|mp4)(\?|#|$)/i;

function xmlTag(block: string, tag: string): string {
  const match = block.match(
    new RegExp(
      `<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`,
      'i'
    )
  );
  return match?.[1]?.trim() ?? '';
}

function parseCmsXml(xml: string): CmsPayload {
  const pagecount = Number(
    xml.match(/pagecount=["']?(\d+)/i)?.[1] ||
      xml.match(/<pagecount>(\d+)/i)?.[1] ||
      1
  );

  const list = Array.from(xml.matchAll(/<video>([\s\S]*?)<\/video>/gi)).map(
    (match) => {
      const block = match[1];
      const dd = Array.from(
        block.matchAll(/<dd\b[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/dd>/gi)
      )
        .map((item) => item[1].trim())
        .filter(Boolean)
        .join('$$$');

      return {
        vod_id: xmlTag(block, 'id'),
        vod_name: xmlTag(block, 'name'),
        vod_pic: xmlTag(block, 'pic'),
        vod_year: xmlTag(block, 'year'),
        vod_content: xmlTag(block, 'des') || xmlTag(block, 'content'),
        vod_class: xmlTag(block, 'type') || xmlTag(block, 'class'),
        type_name: xmlTag(block, 'type'),
        vod_play_url: dd || xmlTag(block, 'dl'),
        vod_remarks: xmlTag(block, 'note'),
      };
    }
  );

  return { list, pagecount };
}

export function parseCmsResponse(text: string): CmsPayload {
  const trimmed = text.trim();
  if (!trimmed) {
    return { list: [] };
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const data = JSON.parse(trimmed) as {
      list?: CmsVideoItem[];
      pagecount?: number;
    };
    return {
      list: Array.isArray(data.list) ? data.list : [],
      pagecount: data.pagecount,
    };
  }

  if (trimmed.startsWith('<')) {
    return parseCmsXml(trimmed);
  }

  try {
    const data = JSON.parse(trimmed) as {
      list?: CmsVideoItem[];
      pagecount?: number;
    };
    return {
      list: Array.isArray(data.list) ? data.list : [],
      pagecount: data.pagecount,
    };
  } catch {
    return parseCmsXml(trimmed);
  }
}

export function extractPlaylists(vodPlayUrl?: string): {
  episodes: string[];
  titles: string[];
} {
  let episodes: string[] = [];
  let titles: string[] = [];

  if (!vodPlayUrl) {
    return { episodes, titles };
  }

  vodPlayUrl.split('$$$').forEach((group) => {
    const matchEpisodes: string[] = [];
    const matchTitles: string[] = [];

    group.split('#').forEach((item, index) => {
      const separator = item.indexOf('$');
      const title =
        separator >= 0 ? item.slice(0, separator).trim() : `第${index + 1}集`;
      const url =
        separator >= 0 ? item.slice(separator + 1).trim() : item.trim();

      if (url && PLAY_URL_RE.test(url)) {
        matchTitles.push(title || `第${matchEpisodes.length + 1}集`);
        matchEpisodes.push(url);
      }
    });

    if (matchEpisodes.length > episodes.length) {
      episodes = matchEpisodes;
      titles = matchTitles;
    }
  });

  return { episodes, titles };
}
