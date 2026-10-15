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
2. **Rules**: balls per over, bowler quota, extras, plus club rules (see below). Defaults come from Settings.
3. **Toss & overs**: coin flip, the winner, bat or bowl, and **how many overs** (it defaults to last match's).
   Overs can be changed any time during the match: tap the overs in the score header, use **More → Change overs**,
   or use **＋ Add overs** at the innings break or the end of the match.
   **Rain rule**: if overs change *after* the first innings is complete (at the break or mid-chase), the target is
   revised from the batting resources the chasing side gained or lost. Resources depend on overs left and wickets in hand,
   in the spirit of Duckworth–Lewis (Z0(w)·(1−e^(−b·u))) but with simple constants, not the official DLS tables. The new
   target is previewed before you confirm, and results say e.g. *won by 3 runs (revised target 41)*.
4. **Openers**: striker, non-striker and opening bowler. You can add a player to either team right here.
5. **Scoring pad**: `0 1 2 3 4 6 · WD · NB · BYE · LB · OUT · OUT OF CAGE · Undo · More`
   - Wides and no-balls ask for the extra runs taken; for no-balls you also pick bat, bye or leg bye. A free hit follows a no-ball.
   - **OUT**: bowled, caught (pick the fielder; picking the bowler gives c&b), LBW, run out (who's out, runs completed,
     legal/wide/no-ball/bye), stumped, hit wicket, out of cage, obstructing, hit twice. Free-hit restrictions are enforced.
   - **More**: 5/7/custom runs, swap strike, mid-over bowler change, retire hurt/out, add a player to a team,
     **change overs**, match settings, end innings, abandon.
   - Strike rotates automatically on odd runs and at the end of each over. Consecutive overs and bowler quotas are blocked,
     with an "Allow anyway" override.
6. **Innings break**: shows the target and lets you **＋ Add overs** (any number) if you agree to extend.
7. **Tie → super over**: if scores are level you can play a super over (one over, two wickets; the side that batted\n   second bats first, as in ICC playing conditions) or finish as a tie. A tied super over can be followed by another.\n   Super-over runs and wickets count for MVP but not career records.\n8. **Match over**: the result is worked out automatically ("won by N runs" or "won by N wickets (B balls left)"). The Heroes
   of the Match (Player of the Match, Best Batter, Best Bowler, Fighter) are picked by MVP 2.0 (see below), and you can
   change Player of the Match. Then **Finish & save**.
9. **Match page**: Summary, Scorecard, ball-by-ball Commentary, Overs and partnerships.
   **Share summary** (the club's navy and gold "Match Summary" graphic: top 3 batters and bowlers per innings, result
   bar, Man of the Match with his stats; on phones this opens the share sheet for WhatsApp/Instagram),
   **Scorecard image** (the full scorecard as a PNG), **PDF / Print**, **Copy summary** (text). The footer line on the
   summary graphic is set in Settings.
   **Fix any past ball**: tap a ball in Commentary (or in Recent overs while scoring) to change runs, extras,\n   boundary, who faced or bowled it, or dismissal details, or to delete a stray ball. Later balls keep who was on strike,\n   and a finished match's result updates automatically (it reopens if it's no longer decided). Adding or removing a\n   wicket still needs an undo back to that ball, because it changes who batted next.\n   **Captains**: pick one per team when setting up (or in Match settings); they show as (c) on scorecards and images.

## Club rules: how they're handled

| Rule | Implementation |
| --- | --- |
| Ball out of the cage = out | One-tap **OUT OF CAGE** button (striker out, 0 runs). Bowler credit and whether it applies on a free hit are both toggles. Tracked as its own career stat. |
| New player can join any team at any time | Add a player from the openers, next batter and bowler sheets, or **More → Add player**. A side that was all out is automatically re-opened if it gains a batter. |
| Unequal teams / a player on both teams / flexible overs | Squads can be any size, and **Both** puts a player in both squads. Overs can be raised or lowered mid-match; a finished innings re-opens if overs are added. |
| A batter can bat twice when the team is short | The short side gets `opponent size − own size` extra turns. Once everyone has batted, dismissed batters appear as **BAT AGAIN**. The scorecard shows "Kabir (2nd turn)" as a separate line, and career stats count it as a separate innings. |
| Optional: last man stands | The final batter can carry on alone. |

## Stats

- **Match Analysis tab** (for viewers): **Manhattan** (runs per over, both innings, wickets marked), **Worm** (running
  totals), **win probability** during a chase (built on the Pressure Index, also shown live on the Summary tab), and
  **phase splits** (early / middle / death: runs, wickets, run rate). Phases scale with the format, roughly the first and last 30% of overs.
- **Player phase splits** (career SR and economy per phase) and **favourite partners** on profiles; **best pairs**
  (most runs together) on Records.
- **☀️ Sun mode** (scoring screen header, or Settings → Display): large text, bigger buttons, maximum contrast.
  Remembered per phone.
- **Club records** (Home → Records): highest and lowest totals, highest scores, best figures, biggest wins (runs and
  chasing), best partnerships, most sixes in an innings, and the out-of-cage hall of shame (career and single innings).
- **Compare** (Home → Compare, or a profile's *Compare →*): two players side by side with the better figure highlighted,
  head-to-head (each batting against the other's bowling: balls, runs, outs, SR), and recent batting form.
- **Form charts** on every profile (last 10 innings' runs and wickets per match) and a **cage shot chart** built from shot zones.
- **Shot zones**: after a scoring shot, one tap on Straight / Off / Leg / Behind under the pad (optional; can be switched
  off in the rules). Off and leg flip for left-handers on the chart.
- **Dropped catches and runs saved**: recorded on the same strip (or by editing a ball). They count in MVP fielding
  impact (a drop costs 0.3 of a wicket's value; each run saved counts run-for-run, both weighted by pressure) and appear on
  profiles, the Awards leaderboard and the stats spreadsheet.

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
- Batting first: the same, measured against a par score. Par comes from the **club's own history**: the average
  first-innings scoring rate of earlier completed matches (same venue when it has 3+ matches). Before 3 matches exist it
  uses a default of 1.3 runs per ball. Either way it's blended with how the current match is going. Batting first
  carries a little less pressure than chasing.
- **Wicket shock** (after Shah & Shah, *Pressure Index in Cricket*, IOSR-JSPE 1(5), 2014): a wicket adds extra
  pressure. The extra is bigger when many runs are still needed and many balls remain, and the batters "pay it off" with
  the runs they score afterwards. So pressure spikes on a wicket and eases as a new pair rebuilds. The paper's T20
  constants are expressed relative to the target so they scale to short cage games.
- Pressure builds through the innings (match phase). Shown live on the scoring screen, per ball in commentary, and as a
  graph on the match summary.
- **Pressure runs**: runs off the bat scored at High/Extreme pressure (PI 65+), plus average pressure faced. Shown on
  player profiles, in the stats spreadsheet, and on the leaderboard ("Runs under pressure", "Toughest conditions").
**Impact Score (per player)**: every ball is valued in runs above par and multiplied by that ball's pressure
(×0.6 when calm up to ×1.5 at extreme):
- Batting: runs, boundary bonus, dot balls cost, getting out costs.
- Bowling: economy vs par, extras cost; wickets are worth more for a set batter and for breaking a big partnership.
- Fielding: catches, stumpings, run outs (run outs get most of the wicket's value, since the bowler gets none).
- Scaled so 1 point = 1/20th of a par innings, which makes scores comparable between 3-over cage games and longer matches.
  Grades: Exceptional 10+ · Excellent 7.5 · Very good 5 · Good 3 · Useful 1.5 · Marginal.

**Heroes of the Match** (CricHeroes rules): Player of the Match = the highest-ranked winning-team player in the top 3 MVPs
(otherwise the MVP leader), and the scorer can override it. Best Batter / Best Bowler = highest batting / bowling impact.
Fighter of the Match = the highest-ranked losing-team player in the top 3 who isn't Player of the Match and made a\npositive contribution.

Not yet tracked (CricHeroes treats these as scorer-dependent too): runs saved and dropped catches.

## Data, cloud sync & access

**Live site:** deployed on Vercel from the `main` branch of GitHub, so every push redeploys automatically.

**Club database:** Firebase project `ntu-cricket-scorer` (Firestore, asia-southeast1). The connection lives in
`src/data/firebaseConfig.ts`; set it to `null` to run fully offline with on-device storage only.

- **Offline-first:** each phone keeps a cached copy, so scoring works with no signal and uploads automatically later.
  The scoring screen shows ☁ Synced / ⏳ Syncing / 📴 Saved on phone.
- **Who can do what** is enforced server-side by [`firestore.rules`](firestore.rules). After editing that file, paste it into
  Firebase console → Firestore → Rules → Publish.
  - Anyone with the link: view live scores, scorecards, players and leaderboards.
  - Scorers: score matches, add, edit or remove players, import backups.
  - Admins: everything above, plus club settings and the scorer list (Settings → Scorers & admins).
- The first person to sign in on a fresh project claims it as admin (Settings → Claim club as admin).
- Sign-in is Google only. Every domain the site runs on must be listed in Firebase → Authentication → Settings → Authorized domains.
- **Scorer lock**: one device holds the pen for a live match. Anyone else opening it sees *Being scored by Riaan*\n  and watches live, with a **Take over** button (confirm first; balls the other phone hasn't uploaded yet could be lost).\n  The lock is per device, so the same person on two phones is protected too.

**Share live link**: the 📡 button (scoring screen, match page) opens the share menu with `…/m/<match-id>`. A Vercel
function (`api/live.ts`) gives WhatsApp and other apps a preview showing the current score, then redirects into the app.
Previews refresh at most every 30 seconds, and apps like WhatsApp also keep their own copy of a preview.

**Backups** (optional extra safety): Settings → Download backup / Import / merge backup. Imports merge by id and the newest
`updatedAt` wins, so nothing is deleted. Settings → Upload this phone's data moves anything scored before cloud sync into
the club database.

**Bin:** deleting a match moves it to **Matches → Bin** for 30 days (it stops counting towards stats). Scorers can\nrestore it; admins can delete forever. Anything older than 30 days is removed automatically.\n\n**Removing players:** Players → Select → Remove. Players with no matches are deleted. Players with match history are
archived instead: hidden from the roster and leaderboards, but kept on old scorecards, and restorable from "Removed players".

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
