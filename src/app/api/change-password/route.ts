/* eslint-disable no-console*/

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';

  // 不支持 localstorage 模式
  if (storageType === 'localstorage') {
    return NextResponse.json(
      {
        error: '不支持本地存储模式修改密码',
      },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const { newPassword, oldPassword } = body;
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!oldPassword || typeof oldPassword !== 'string') {
      return NextResponse.json({ error: '旧密码不得为空' }, { status: 400 });
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
      return NextResponse.json({ error: '新密码长度至少为6位' }, { status: 400 });
    }
    if (oldPassword === newPassword) {
      return NextResponse.json({ error: '新密码不能与旧密码相同' }, { status: 400 });
    }
    const username = authInfo.username;
    if (username === process.env.USERNAME) {
      return NextResponse.json(
        { error: '站长不能通过此接口修改密码' },
        { status: 403 }
      );
    }

    const valid = await db.verifyUser(username, oldPassword);
    if (!valid) {
      return NextResponse.json({ error: '旧密码错误' }, { status: 401 });
    }
    await db.changePassword(username, newPassword);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('修改密码失败:', error);
    return NextResponse.json(
      {
        error: '修改密码失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
