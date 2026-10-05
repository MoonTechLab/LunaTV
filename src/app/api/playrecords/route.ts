/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db, parseStorageKey } from '@/lib/db';
import { PlayRecord } from '@/lib/types';

export const runtime = 'nodejs';

const STORAGE_TYPE = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';

function resolveUsername(
  authInfo: { username?: string } | null
): string | null {
  if (authInfo?.username) {
    return authInfo.username;
  }
  if (STORAGE_TYPE === 'localstorage') {
    return process.env.USERNAME || 'local';
  }
  return null;
}

async function ensureUserAllowed(username: string) {
  if (STORAGE_TYPE === 'localstorage') {
    return null;
  }
  if (username === process.env.USERNAME) {
    return null;
  }
  const config = await getConfig();
  const user = config.UserConfig?.Users?.find((u) => u.username === username);
  if (!user) {
    return NextResponse.json({ error: '用户不存在' }, { status: 401 });
  }
  if (user.banned) {
    return NextResponse.json({ error: '用户已被封禁' }, { status: 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    // 从 cookie 获取用户信息
    const authInfo = getAuthInfoFromCookie(request);
    const username = resolveUsername(authInfo);
    if (!authInfo || !username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await ensureUserAllowed(username);
    if (denied) {
      return denied;
    }

    if (STORAGE_TYPE === 'localstorage') {
      return NextResponse.json({}, { status: 200 });
    }

    const records = await db.getAllPlayRecords(username);
    return NextResponse.json(records, { status: 200 });
  } catch (err) {
    console.error('获取播放记录失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // 从 cookie 获取用户信息
    const authInfo = getAuthInfoFromCookie(request);
    const username = resolveUsername(authInfo);
    if (!authInfo || !username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await ensureUserAllowed(username);
    if (denied) {
      return denied;
    }

    const body = await request.json();
    const { key, record }: { key: string; record: PlayRecord } = body;

    if (!key || !record) {
      return NextResponse.json(
        { error: 'Missing key or record' },
        { status: 400 }
      );
    }

    const parsedKey = parseStorageKey(key);
    if (!parsedKey) {
      return NextResponse.json(
        { error: 'Invalid key format' },
        { status: 400 }
      );
    }

    const index = Number(record.index);
    const title = String(record.title || '').trim();
    const sourceName = String(record.source_name || '').trim();
    if (!title || !sourceName || !Number.isFinite(index) || index < 1) {
      return NextResponse.json(
        { error: 'Invalid record data' },
        { status: 400 }
      );
    }

    const finalRecord = {
      ...record,
      title,
      source_name: sourceName,
      year: String(record.year || ''),
      cover: record.cover || '',
      index: Math.max(1, Math.floor(index)),
      total_episodes: Math.max(1, Number(record.total_episodes) || 1),
      play_time: Math.max(0, Number(record.play_time) || 0),
      total_time: Math.max(0, Number(record.total_time) || 0),
      save_time: record.save_time ?? Date.now(),
      search_title: record.search_title || title,
    } as PlayRecord;

    if (STORAGE_TYPE === 'localstorage') {
      return NextResponse.json({ success: true }, { status: 200 });
    }

    await db.savePlayRecord(
      username,
      parsedKey.source,
      parsedKey.id,
      finalRecord
    );

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('保存播放记录失败', err);
    return NextResponse.json(
      {
        error: '保存播放记录失败',
        details: (err as Error).message,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // 从 cookie 获取用户信息
    const authInfo = getAuthInfoFromCookie(request);
    const username = resolveUsername(authInfo);
    if (!authInfo || !username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await ensureUserAllowed(username);
    if (denied) {
      return denied;
    }

    if (STORAGE_TYPE === 'localstorage') {
      return NextResponse.json({ success: true }, { status: 200 });
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (key) {
      const parsedKey = parseStorageKey(key);
      if (!parsedKey) {
        return NextResponse.json(
          { error: 'Invalid key format' },
          { status: 400 }
        );
      }

      await db.deletePlayRecord(username, parsedKey.source, parsedKey.id);
    } else {
      // 未提供 key，则清空全部播放记录
      await db.deleteAllPlayRecords(username);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('删除播放记录失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
