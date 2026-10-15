# NTU Cricket Scorer

Ball-by-ball cricket scoring for NTU Cricket Club, modelled on CricHeroes and adapted to our cage rules.
It runs entirely in the browser (works offline once loaded, installable on phones). Player profiles, career stats
and match history are saved on the device.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (also on your LAN IP so you can open it on your phone)
npm test           # scoring-engine unit tests
npm run build      # production build in dist/
```

`dist/` is a static site: host it on GitHub Pages, Netlify or Vercel, or open it from any static server. On a phone, use **Add to Home
Screen** so it works offline at the cage.

## Match flow (opening → closing)

1. **New match → Teams**: name the two sides and tap **A / B / Both** for each player. **Both** means the player plays for both teams.
   Add new players inline. **Shuffle teams** randomly splits the players you picked. Uneven sides are fine; the app tells you how
   many extra batting turns the short side gets.
2. **Rules**: overs, balls per over, bowler quota, extras, plus club rules (see below). Defaults come from Settings.
3. **Toss**: coin flip, the winner, and bat or bowl.
4. **Openers**: striker, non-striker and opening bowler. You can add a player to either team right here.
5. **Scoring pad**: `0 1 2 3 4 6 · WD · NB · BYE · LB · OUT · OUT OF CAGE · Undo · More`
   - Wides and no-balls ask for the extra runs taken; for no-balls you also pick bat, bye or leg bye. A free hit follows a no-ball.
   - **OUT**: bowled, caught (pick the fielder; picking the bowler gives c&b), LBW, run out (who's out, runs completed,
     legal/wide/no-ball/bye), stumped, hit wicket, out of cage, obstructing, hit twice. Free-hit restrictions are enforced.
   - **More**: 5/7/custom runs, swap strike, mid-over bowler change, retire hurt/out, add a player to a team,
     match settings (**increase overs**), end innings, abandon.
   - Strike rotates automatically on odd runs and at the end of each over. Consecutive overs and bowler quotas are blocked,
     with an "Allow anyway" override.
6. **Innings break**: shows the target and lets you **+ Add an over** if you agree to extend.
7. **Match over**: the result is worked out automatically ("won by N runs" or "won by N wickets (B balls left)"). The Heroes
   of the Match (Player of the Match, Best Batter, Best Bowler, Fighter) are picked by MVP 2.0 (see below), and you can
   change Player of the Match. Then **Finish & save**.
8. **Match page**: Summary, Scorecard, ball-by-ball Commentary, Overs and partnerships.
   **Share summary** (the club's navy and gold "Match Summary" graphic: top 3 batters and bowlers per innings, result
   bar, Man of the Match with his stats; on phones this opens the share sheet for WhatsApp/Instagram),
   **Scorecard image** (the full scorecard as a PNG), **PDF / Print**, **Copy summary** (text). The footer line on the
   summary graphic is set in Settings.
   Completed matches can be reopened to fix mistakes.

## Club rules: how they're handled

| Rule | Implementation |
| --- | --- |
| Ball out of the cage = out | One-tap **OUT OF CAGE** button (striker out, 0 runs). Bowler credit and whether it applies on a free hit are both toggles. Tracked as its own career stat. |
| New player can join any team at any time | Add a player from the openers, next batter and bowler sheets, or **More → Add player**. A side that was all out is automatically re-opened if it gains a batter. |
| Unequal teams / a player on both teams / flexible overs | Squads can be any size, and **Both** puts a player in both squads. Overs can be raised or lowered mid-match; a finished innings re-opens if overs are added. |
| A batter can bat twice when the team is short | The short side gets `opponent size − own size` extra turns. Once everyone has batted, dismissed batters appear as **BAT AGAIN**. The scorecard shows "Kabir (2nd turn)" as a separate line, and career stats count it as a separate innings. |
| Optional: last man stands | The final batter can carry on alone. |

## Stats

- **Player profile**: matches, W/L, POTM; batting (innings, runs, HS, average, SR, 4s/6s, 30s/50s, ducks); bowling (overs, wickets,
  best, economy, average, SR, maidens, dots, wides/no-balls); fielding (catches, run outs, stumpings, out-of-cage dismissals); recent form.
- **Leaderboard**: all-time or by season. Batting, bowling and awards (including an out-of-cage hall of shame).
- **CSV export** of every player's stats (Players → ⬇).
- **Merge duplicate** players if someone was added twice.

## MVP 2.0: Pressure Index & Impact Score

Modelled on [CricHeroes MVP 2.0](https://blog.cricheroes.com/mvp-2-0-pressure-index-impact-score/). CricHeroes
publishes the factors and scales but not the formulas, so the maths in `src/engine/impact.ts` is our own model of those factors.

**Pressure Index (0–100, before every ball)**: Calm 0–19 · Light 20–39 · Moderate 40–64 · High 65–79 · Extreme 80–100.
- Chasing: runs needed vs the runs the side can expect from the balls left. The expectation is based on the target's
  required rate, scaled up for death overs and down for fewer wickets in hand.
- Batting first: the same, measured against a par score. Par = club default (1.3 runs/ball) blended with how the match is
  actually going, so it adapts to cage conditions and format. Batting first carries a little less pressure than chasing.
- Pressure builds through the innings (match phase). Shown live on the scoring screen, per ball in commentary, and as a
  graph on the match summary.

**Impact Score (per player)**: every ball is valued in runs above par and multiplied by that ball's pressure
(×0.6 when calm up to ×1.5 at extreme):
- Batting: runs, boundary bonus, dot balls cost, getting out costs.
- Bowling: economy vs par, extras cost; wickets are worth more for a set batter and for breaking a big partnership.
- Fielding: catches, stumpings, run outs (run outs get most of the wicket's value, since the bowler gets none).
- Scaled so 1 point = 1/20th of a par innings, which makes scores comparable between 3-over cage games and longer matches.
  Grades: Exceptional 10+ · Excellent 7.5 · Very good 5 · Good 3 · Useful 1.5 · Marginal.

**Heroes of the Match** (CricHeroes rules): Player of the Match = the highest-ranked winning-team player in the top 3 MVPs
(otherwise the MVP leader), and the scorer can override it. Best Batter / Best Bowler = highest batting / bowling impact.
Fighter of the Match = the highest-ranked losing-team player in the top 3 who isn't Player of the Match.

Not yet tracked (CricHeroes treats these as scorer-dependent too): runs saved and dropped catches.

## Data & multiple scorers

Data lives in the browser's IndexedDB on each device. Settings has **Download backup** and **Import / merge backup**.
Importing merges by id, and the most recently updated copy wins, so you can collect matches scored on different phones into one
"master" device. Back up regularly.

## Architecture

- `src/engine/engine.ts`: the scoring engine. A match stores only an **event log** (`start`, `ball`, `newBatter`, `newBowler`,
  `retire`, `swap`, `declare`). Everything else (scores, strike, overs, free hits, all-out, extra turns, results) is worked out by
  replaying the log. That keeps undo exact and lets rule changes mid-match (overs, adding players) apply immediately.
- `src/engine/stats.ts`: career aggregation, leaderboards, Player of the Match points.
- `src/engine/engine.test.ts`: unit tests covering the club rules.
- `src/db.ts`: Dexie/IndexedDB storage, backup/merge, player merge.
- `src/pages/scoring/`: live scoring screen and its sheets.
- `src/components/ScorecardExport.tsx`: the printable/shareable scorecard.

## Ideas for later

Cloud sync (e.g. Supabase) so several scorers share one live database, super over for ties, wagon wheel, live score link for
spectators, team presets.
