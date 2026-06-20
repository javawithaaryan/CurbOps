// ---------------------------------------------------------------------------
// CausaFlow AI — /api/zones
// Returns the full zone summary array (2,021 zones, sorted by priority_score
// desc). Re-reads the file on every request so data updates are picked up
// immediately without a server restart.
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const file = path.join(process.cwd(), 'data', 'zone_summary.json');
  const raw = await fs.readFile(file, 'utf-8');
  const data = JSON.parse(raw);
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
