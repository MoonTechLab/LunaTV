/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { Favorite } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * GET /api/favorites
 *
 * 支持两种调用方式：
 * 1. 不带 query，返回全部收藏列表（Record<string, Favorite>）。
 * 2. 带 key=source+id，返回单条收藏（Favorite | null）。
 */
export async function GET(request: NextRequest) {
  try {
    // 从 cookie 获取用户信息
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = await getConfig();
    if (authInfo.username !== process.env.USERNAME) {
      // 非站长，检查用户存在或被封禁
      const user = config.UserConfig.Users.find(
        (u) => u.username === authInfo.username
      );
      if (!user) {
        return NextResponse.json({ error: '用户不存在' }, { status: 401 });
      }
      if (user.banned) {
        return NextResponse.json({ error: '用户已被封禁' }, { status: 401 });
      }
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    // 查询单条收藏
    if (key) {
      const [source, id] = key.split('+');
      if (!source || !id) {
        return NextResponse.json(
          { error: 'Invalid key format' },
          { status: 400 }
        );
      }
      const fav = await db.getFavorite(authInfo.username, source, id);
      return NextResponse.json(fav, { status: 200 });
    }

    // 查询全部收藏
    const favorites = await db.getAllFavorites(authInfo.username);
    return NextResponse.json(favorites, { status: 200 });
  } catch (err) {
    console.error('获取收藏失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/favorites
 * body: { key: string; favorite: Favorite }
 */
export async function POST(request: NextRequest) {
  try {
    // 从 cookie 获取用户信息
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = await getConfig();
    if (authInfo.username !== process.env.USERNAME) {
      // 非站长，检查用户存在或被封禁
      const user = config.UserConfig.Users.find(
        (u) => u.username === authInfo.username
      );
      if (!user) {
        return NextResponse.json({ error: '用户不存在' }, { status: 401 });
      }
      if (user.banned) {
        return NextResponse.json({ error: '用户已被封禁' }, { status: 401 });
      }
    }

    const body = await request.json();
    const { key, favorite }: { key: string; favorite: Favorite } = body;

    if (!key || !favorite) {
      return NextResponse.json(
        { error: 'Missing key or favorite' },
        { status: 400 }
      );
    }

    // 验证必要字段
    if (!favorite.title || !favorite.source_name) {
      return NextResponse.json(
        { error: 'Invalid favorite data' },
        { status: 400 }
      );
    }

    const [source, id] = key.split('+');
    if (!source || !id) {
      return NextResponse.json(
        { error: 'Invalid key format' },
        { status: 400 }
      );
    }

    const finalFavorite = {
      ...favorite,
      save_time: favorite.save_time ?? Date.now(),
    } as Favorite;

    await db.saveFavorite(authInfo.username, source, id, finalFavorite);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('保存收藏失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/favorites
 *
 * 1. 不带 query -> 清空全部收藏
 * 2. 带 key=source+id -> 删除单条收藏
 */
export async function DELETE(request: NextRequest) {
  try {
    // 从 cookie 获取用户信息
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = await getConfig();
    if (authInfo.username !== process.env.USERNAME) {
      // 非站长，检查用户存在或被封禁
      const user = config.UserConfig.Users.find(
        (u) => u.username === authInfo.username
      );
      if (!user) {
        return NextResponse.json({ error: '用户不存在' }, { status: 401 });
      }
      if (user.banned) {
        return NextResponse.json({ error: '用户已被封禁' }, { status: 401 });
      }
    }

    const username = authInfo.username;
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (key) {
      // 删除单条
      const [source, id] = key.split('+');
      if (!source || !id) {
        return NextResponse.json(
          { error: 'Invalid key format' },
          { status: 400 }
        );
      }
      await db.deleteFavorite(username, source, id);
    } else {
      // 清空全部
      await db.deleteAllFavorites(username);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('删除收藏失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
