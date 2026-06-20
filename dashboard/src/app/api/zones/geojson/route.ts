// ---------------------------------------------------------------------------
// CausaFlow AI — /api/zones/geojson
// Returns the GeoJSON FeatureCollection of zone points.
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const file = path.join(process.cwd(), 'data', 'zones.geojson');
  const raw = await fs.readFile(file, 'utf-8');
  const data = JSON.parse(raw);
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
