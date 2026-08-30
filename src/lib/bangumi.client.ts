'use client';

export interface BangumiCalendarData {
  weekday: {
    en: string;
  };
  items: {
    id: number;
    name: string;
    name_cn: string;
    rating: {
      score: number;
    };
    air_date: string;
    images: {
      large: string;
      common: string;
      medium: string;
      small: string;
      grid: string;
    };
  }[];
}

export async function GetBangumiCalendarData(): Promise<BangumiCalendarData[]> {
  const response = await fetch('/api/bangumi/calendar');
  if (!response.ok) {
    throw new Error(`获取番剧日历失败: HTTP ${response.status}`);
  }
  const data = await response.json();
  const filteredData = data.map((item: BangumiCalendarData) => ({
    ...item,
    items: item.items.filter(bangumiItem => bangumiItem.images)
  }));

  return filteredData;
}
