import { inningsLabel, oversText, type MatchState } from './engine/engine';
import { computeMvp } from './engine/impact';
import type { Match } from './types';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(text: string, filename: string, type = 'text/plain') {
  downloadBlob(new Blob([text], { type }), filename);
}

/** Renders a DOM node to PNG; on phones opens the native share sheet (WhatsApp etc.), otherwise downloads. */
export async function exportNodeAsImage(node: HTMLElement, filename: string, share = true) {
  const { toBlob } = await import('html-to-image');
  const blob = await toBlob(node, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
  if (!blob) throw new Error('Could not render image');
  const file = new File([blob], filename, { type: 'image/png' });
  if (share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  downloadBlob(blob, filename);
}

export function matchFileName(m: Match, ext: string) {
  const slug = `${m.teams[0].name}-v-${m.teams[1].name}-${m.date}`.replace(/[^a-z0-9-]+/gi, '_');
  return `${slug}.${ext}`;
}

export function textSummary(
  m: Match,
  state: MatchState,
  nameOf: (id: string | undefined) => string,
  clubName: string,
  clubPar?: number,
): string {
  const bpo = m.rules.ballsPerOver;
  const lines: string[] = [];
  lines.push(`🏏 *${clubName}*`);
  lines.push(`*${m.teams[0].name} v ${m.teams[1].name}*${m.title ? ` — ${m.title}` : ''}`);
  lines.push(`${m.date}${m.venue ? ` · ${m.venue}` : ''} · ${m.rules.overs} overs`);
  lines.push('');
  for (const inn of state.innings) {
    lines.push(
      `*${m.teams[inn.battingTeam].name}*${inn.superOver ? ' (' + inningsLabel(inn.index) + ')' : ''} ${inn.runs}/${inn.wickets} (${oversText(inn.legalBalls, bpo)} ov)`,
    );
    const bats = [...inn.batters].sort((a, b) => b.runs - a.runs || a.balls - b.balls).slice(0, 3);
    for (const b of bats)
      lines.push(`   🏏 ${nameOf(b.playerId)} ${b.runs}${b.status === 'out' ? '' : '*'} (${b.balls})`);
    const bowls = [...inn.bowlers]
      .filter((b) => b.balls > 0)
      .sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)
      .slice(0, 2);
    for (const b of bowls)
      lines.push(`   🎯 ${nameOf(b.playerId)} ${b.wickets}/${b.runs} (${oversText(b.balls, bpo)})`);
    lines.push('');
  }
  const result = m.result ?? state.result;
  if (result) lines.push(`🏆 *${result.text}*`);
  if (result) {
    const mvp = computeMvp(m, state, { clubPar });
    const potm = m.motmId ?? mvp.heroes.potm;
    const imp = (id?: string) => mvp.players.find((p) => p.playerId === id)?.total;
    if (potm) lines.push(`🏅 Player of the match: *${nameOf(potm)}* (impact ${imp(potm)})`);
    if (mvp.heroes.bestBatter) lines.push(`🏏 Best batter: ${nameOf(mvp.heroes.bestBatter)}`);
    if (mvp.heroes.bestBowler) lines.push(`🎯 Best bowler: ${nameOf(mvp.heroes.bestBowler)}`);
    if (mvp.heroes.fighter && mvp.heroes.fighter !== potm) lines.push(`⚔️ Fighter of the match: ${nameOf(mvp.heroes.fighter)}`);
  }
  return lines.join('\n');
}

export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\n');
}

/** Short shareable link. On the live site, /m/<id> gives WhatsApp etc. a preview with the score. */
export function matchLink(matchId: string): string {
  const devHost = /^(localhost|127\.|10\.|192\.168\.|\[::1\])/.test(location.hostname);
  return devHost ? `${location.origin}${location.pathname}#/match/${matchId}` : `${location.origin}/m/${matchId}`;
}

/** Opens the phone's share sheet (WhatsApp, Instagram…) with the match link, or copies it. */
export async function shareMatchLink(m: Match): Promise<'shared' | 'copied' | 'cancelled'> {
  const url = matchLink(m.id);
  const teams = `${m.teams[0].name} v ${m.teams[1].name}`;
  const text = m.status === 'live' ? `🔴 Follow ${teams} live, ball by ball 🏏` : `🏏 ${teams}: scorecard & highlights`;
  if (navigator.share) {
    try {
      await navigator.share({ title: teams, text, url });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  await navigator.clipboard.writeText(`${text}\n${url}`);
  return 'copied';
}