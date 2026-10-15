import { computeMatch, oversText } from '../engine/engine';
import type { Match } from '../types';

/** Firestore REST "Value" (only the kinds we store). */
export interface FsValue {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  stringValue?: string;
  timestampValue?: string;
  arrayValue?: { values?: FsValue[] };
  mapValue?: { fields?: Record<string, FsValue> };
}

/** Converts Firestore REST JSON into plain JS (what the app stored). */
export function decodeFs(v: FsValue): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue?.values ?? []).map(decodeFs);
  if ('mapValue' in v) return decodeFields(v.mapValue?.fields ?? {});
  return null;
}

export function decodeFields(fields: Record<string, FsValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, val]) => [k, decodeFs(val)]));
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Title + description for a link preview (WhatsApp, iMessage, Telegram…). */
export function previewText(m: Match | null, clubName = 'NTU Cricket Club'): { title: string; description: string } {
  if (!m || m.deletedAt) {
    return { title: `${clubName} · Live scores`, description: 'Ball-by-ball scores, scorecards and player stats.' };
  }
  const st = computeMatch(m);
  const bpo = m.rules.ballsPerOver;
  const [a, b] = m.teams.map((t) => t.name);
  const line = (i: number) => {
    const inn = st.innings[i];
    return `${m.teams[inn.battingTeam].name} ${inn.runs}/${inn.wickets} (${oversText(inn.legalBalls, bpo)})`;
  };
  const scores = st.innings.filter((i) => !i.superOver).map((_, i) => line(i));
  const result = m.result ?? st.result;

  if (m.status === 'live') {
    const cur = st.current;
    const now = cur ? line(cur.index) : '';
    const opp = cur ? m.teams[cur.bowlingTeam].name : b;
    const need =
      cur && cur.target !== null && !cur.complete
        ? ` · need ${Math.max(0, cur.target - cur.runs)} from ${Math.max(0, cur.maxBalls - cur.legalBalls)}`
        : '';
    return {
      title: cur?.started ? `🔴 LIVE · ${now} v ${opp}${need}` : `🔴 LIVE · ${a} v ${b}`,
      description: `${scores.join(' · ') || `${a} v ${b} is about to start`} — tap to follow ball by ball. ${clubName}`,
    };
  }
  return {
    title: `${a} v ${b}${result ? ` · ${result.text}` : ''}`,
    description: `${scores.join(' · ')} — full scorecard, commentary and Player of the Match. ${clubName}`,
  };
}

/** Tiny HTML page: link-preview tags for crawlers, instant redirect into the app for people. */
export function previewHtml(m: Match | null, origin: string, matchId: string): string {
  const { title, description } = previewText(m);
  const appUrl = `${origin}/#/match/${encodeURIComponent(matchId)}`;
  const image = `${origin}/logo-512.png`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="NTU Cricket Club">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="512">
<meta property="og:image:height" content="512">
<meta property="og:url" content="${esc(`${origin}/m/${matchId}`)}">
<meta name="twitter:card" content="summary">
<meta http-equiv="refresh" content="0; url=${esc(appUrl)}">
<script>location.replace(${JSON.stringify(appUrl)})</script>
</head>
<body style="font-family:system-ui,sans-serif;background:#0f1a30;color:#fff;text-align:center;padding:40px">
<p>${esc(title)}</p>
<p><a style="color:#e8b84a" href="${esc(appUrl)}">Open the live scorecard</a></p>
</body>
</html>`;
}
