/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { getPublicOidcConfig } from '@/lib/oidc';
import { CURRENT_VERSION } from '@/lib/version'

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  console.log('server-config called: ', request.url);

  const config = await getConfig();
  const result = {
    SiteName: config.SiteConfig.SiteName,
    StorageType: process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage',
    Version: CURRENT_VERSION,
    Oidc: getPublicOidcConfig(),
  };
  return NextResponse.json(result);
}
