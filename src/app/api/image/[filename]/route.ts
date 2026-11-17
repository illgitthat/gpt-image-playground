import fs from 'fs/promises';
import { lookup } from 'mime-types';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { findStoredImage } from '@/lib/stored-image';

// Base directory where images are stored (outside gpt-image-playground)
const imageBaseDir = path.resolve(/* turbopackIgnore: true */ process.cwd(), 'generated-images');

// Generated image filenames embed a timestamp + index and are immutable once written.
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export async function GET(request: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;

  if (!filename) {
    return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
  }

  // Basic security: Prevent directory traversal
  if (filename.includes('..') || filename.startsWith('/') || filename.startsWith('\\')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const filepath = path.join(imageBaseDir, filename);

  // Resolve and ensure the resulting path stays inside imageBaseDir.
  const resolved = path.resolve(filepath);
  if (!resolved.startsWith(imageBaseDir + path.sep)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  try {
    const found = await findStoredImage(imageBaseDir, filename);
    if (!found) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }
    const { filepath: storedPath, stat } = found;
    // ETag based on file size + mtime (sufficient for immutable generated files).
    const etag = `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;

    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': IMMUTABLE_CACHE_CONTROL
        }
      });
    }

    const fileBuffer = await fs.readFile(storedPath);
    const contentType = lookup(storedPath) || 'application/octet-stream';

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': IMMUTABLE_CACHE_CONTROL,
        ETag: etag,
        'Last-Modified': new Date(stat.mtimeMs).toUTCString()
      }
    });
  } catch (error: unknown) {
    console.error(`Error serving image ${filename}:`, error);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
