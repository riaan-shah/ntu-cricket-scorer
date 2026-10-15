import { decodeFields, previewHtml, type FsValue } from '../src/share/livePreview';
import { firebaseConfig } from '../src/data/firebaseConfig';
import type { Match } from '../src/types';

/**
 * GET /m/:id (rewritten to /api/live?id=:id in vercel.json).
 * Serves link-preview tags with the current score, then redirects people into the app.
 * Matches are publicly readable, so this uses the Firestore REST API with the public web key.
 *
 * Edge runtime: Vercel bundles this file with its imports, so the shared app code can be reused as-is.
 */
export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = (url.searchParams.get('id') ?? '').replace(/[^A-Za-z0-9_-]/g, '');
  const origin = url.origin;

  let match: Match | null = null;
  if (id && firebaseConfig) {
    try {
      const api =
        `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/matches/` +
        `${encodeURIComponent(id)}?key=${firebaseConfig.apiKey}`;
      const r = await fetch(api);
      if (r.ok) {
        const doc = (await r.json()) as { fields?: Record<string, FsValue> };
        match = decodeFields(doc.fields ?? {}) as unknown as Match;
      }
    } catch {
      match = null; // fall back to a generic preview
    }
  }

  return new Response(previewHtml(match, origin, id), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Previews refresh at most every 30s; live scores change ball by ball.
      'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=30',
    },
  });
}
