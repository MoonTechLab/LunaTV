/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig, setCachedConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const STORAGE_TYPE =
  (process.env.NEXT_PUBLIC_STORAGE_TYPE as
    | 'localstorage'
    | 'redis'
    | 'upstash'
    | 'kvrocks'
    | undefined) || 'localstorage';

// ponytail: 开放注册开关，站长在 Vercel env 加 NEXT_PUBLIC_ENABLE_REGISTER=true 即开
const REGISTER_OPEN =
  process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true';

function validName(u: string) {
  return /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/.test(u);
}

export async function GET() {
  return NextResponse.json({ open: STORAGE_TYPE !== 'localstorage' && REGISTER_OPEN });
}

export async function POST(req: NextRequest) {
  if (STORAGE_TYPE === 'localstorage') {
    return NextResponse.json({ error: '当前模式不支持注册' }, { status: 400 });
  }
  if (!REGISTER_OPEN) {
    return NextResponse.json({ error: '暂未开放注册' }, { status: 403 });
  }
  try {
    const { username, password } = await req.json();
    if (!username || typeof username !== 'string' || !validName(username)) {
      return NextResponse.json({ error: '用户名需 2-20 位：字母/数字/_/中文' }, { status: 400 });
    }
    if (!password || typeof password !== 'string' || password.length < 4 || password.length > 32) {
      return NextResponse.json({ error: '密码需 4-32 位' }, { status: 400 });
    }
    if (username === process.env.USERNAME) {
      return NextResponse.json({ error: '用户名已存在' }, { status: 400 });
    }
    if (await db.checkUserExist(username)) {
      return NextResponse.json({ error: '用户名已存在' }, { status: 400 });
    }
    await db.registerUser(username, password);

    // 同步进管理员配置的用户列表（沿用 admin/user add 的结构）
    const adminConfig = await getConfig();
    if (!adminConfig.UserConfig.Users.find((u) => u.username === username)) {
      adminConfig.UserConfig.Users.push({ username, role: 'user' } as never);
      await db.saveAdminConfig(adminConfig);
      // 刷新内存缓存：下次 getConfig 读到最新
      await setCachedConfig(adminConfig);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('注册失败:', e);
    return NextResponse.json({ error: '注册失败，请稍后重试' }, { status: 500 });
  }
}
