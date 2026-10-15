import { decodeFields, previewHtml, type FsValue } from '../src/share/livePreview';
import { firebaseConfig } from '../src/data/firebaseConfig';
import type { Match } from '../src/types';

/**
 * GET /m/:id (rewritten to /api/live?id=:id in vercel.json).
 * Serves link-preview tags with the current score, then redirects people into the app.
 * Matches are publicly readable, so this uses the Firestore REST API with the public web key.
 */
interface Req {
  query: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
}
interface Res {
  setHeader(name: string, value: string): void;
  status(code: number): { send(body: string): void };
}

export default async function handler(req: Req, res: Res) {
  const raw = req.query.id;
  const id = (Array.isArray(raw) ? raw[0] : raw ?? '').replace(/[^A-Za-z0-9_-]/g, '');
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? 'ntu-cricket-scorer.vercel.app');
  const origin = `https://${host}`;

  let match: Match | null = null;
  if (id && firebaseConfig) {
    try {
      const url =
        `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/matches/` +
        `${encodeURIComponent(id)}?key=${firebaseConfig.apiKey}`;
      const r = await fetch(url);
      if (r.ok) {
        const doc = (await r.json()) as { fields?: Record<string, FsValue> };
        match = decodeFields(doc.fields ?? {}) as unknown as Match;
      }
    } catch {
      match = null; // fall back to a generic preview
    }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Previews refresh at most every 30s; live scores change ball by ball.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=30');
  res.status(200).send(previewHtml(match, origin, id));
}
