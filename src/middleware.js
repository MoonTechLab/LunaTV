import { NextResponse } from 'next/server'

export function middleware(request) {
  const url = request.nextUrl.clone()
  // 如果用户访问的是根目录，强行重定向到实际的首页路由
  if (url.pathname === '/') {
    url.pathname = '/index'
    return NextResponse.rewrite(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: '/',
}
