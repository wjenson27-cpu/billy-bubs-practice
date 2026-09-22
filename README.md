# Bubble Craps Practice

A static practice machine for **Billy Bubs Practice** — **Bubble Craps**, one cabinet, two rule sets (**Regular** and **Crapless**). No accounts, no backend, no real money. Not affiliated with any casino or equipment maker.

**Practice only. No cash. No real-money wagering.**

## Play on your phone (GitHub Pages)

Intended live URL after Pages is enabled:

**https://wjenson27-cpu.github.io/billy-bubs-practice/**

Repo: **https://github.com/wjenson27-cpu/billy-bubs-practice**

This folder is already a root static site (`index.html`, `css/`, `js/`, `favicon.svg`). A `.nojekyll` file is included so GitHub serves it as files, not Jekyll.

## Run it locally

```bash
python3 -m http.server 8765
```

Open [http://127.0.0.1:8765](http://127.0.0.1:8765). Classic script tags also work from `file://`.

```bash
node tests/engine.test.js
```

## How to play

1. Stay on the green machine layout. Toggle **Regular** or **Crapless** at the top (same screen).
2. Select a **Billy Bubs** chip ($1 / $5 / $25 / $100) and tap a bet. Chips on the tray and on the felt carry a **BB** bubble mark — practice branding, not a casino logo.
3. **Roll** (or Space). Each die is an independent fair 1–6 via `crypto.getRandomValues` — no set-dice, no sticky faces. The **last-roll bar** on the felt shows both faces and the total (e.g. 3–4 = 7) so you can still see the combo when the bubble is scrolled away. Matching dice are marked Hard. The **last-rolls rail** sits under Repeat / Roll and stores each combo, not just the total. Big Red never shows seven-dice art. On a **phone in portrait**, Low Rolls / Roll ’Em All / High Rolls shrink into a **3×1 stack** so they stop eating the top of the felt, and the page scrolls. In **phone landscape**, the felt fills one screen and you swipe sideways to the bubble (dice + Roll), then swipe back. Hard Way All Day sits under Big Red in the middle of the prop cluster, not between Come and Don't Come.
4. **REPEAT / LAST BET** re-posts the last committed wager set (the board you last rolled, or the last chips you placed). It skips bets you cannot afford or that are illegal in this phase.
5. **BETS OFF** parks Place and Buy so they neither win nor lose on 7 / number hits until you turn them back on. Pass, Come, Field, and props still work.
6. **BILLY’S WAY** Buys the selected chip on 2, 3, 4, 5, 9, 10, 11, 12 (whichever the current rules offer) and Places chip × 6/5 on 6 and 8. Each press stacks one unit; numbers you cannot afford are skipped.
7. **RESET** restores the starting bet — the layout snapshotted on the first come-out roll with bets up this hand. Distinct from Repeat (previous roll).
8. **Take down** picks up removable bets, or **drag a chip off the layout** (or onto the take-down tray). Locked Pass / Don't Pass stay until they resolve.

Switching rules clears the table and **keeps credits**. **New session** resets to $1,000.

One-roll bets (Field, Big Red, Any Craps, Horn) **repeat** after a win, like a machine.

## Regular vs crapless

| | Regular | Crapless |
| --- | --- | --- |
| Come-out 7 | Pass wins | Pass wins |
| Come-out 11 | Pass wins | **Point 11** |
| Come-out 2, 3, 12 | Pass loses | **Points** |
| Don't Pass / Don't Come | Yes (12 barred) | Not offered |
| Place / Buy 2, 3, 11, 12 | No | Yes |

## Side bets — practice pays

Always working. A 7 before the set completes loses. Progress lamps light as totals appear.

| Bet | Set | Practice pay |
| --- | --- | --- |
| **Low Rolls** | 2, 3, 4, 5, 6 before 7 | **31 FOR 1** |
| **High Rolls** | 8, 9, 10, 11, 12 before 7 | **31 FOR 1** |
| **Roll ’Em All** | every total except 7 before 7 | **156 FOR 1** |

**FOR 1** here means total return including stake: 31 for 1 → $30 profit per $1; 156 for 1 → $155 profit per $1. Fixed practice schedule, not a progressive.

## Hard Way All Day (side wager)

A **separate** prop from the single Hard 4/6/8/10 bets. Wins only if **Hard 4, Hard 6, Hard 8, and Hard 10** all appear (matching dice) before a 7.

- Soft/easy 4, 6, 8, or 10 do **not** count and do not take the bet down.
- A 7 before all four hards are in loses the bet.
- Practice pay: **165 FOR 1** ($164 profit per $1).
- Dealer Envy is not in this build (casinos may add $5 per $1; we omit it).

## Felt layout

- **Pass Line** and **Don't Pass** sit along the **bottom** of the felt (Don't Pass is Regular-only).
- **Horn** is the left **2×2**: Aces / 2 and Midnight / 12 on top; Ace-deuce / 3 and Yo / 11 below, with C / E / Horn 4-way under that block.
- The **middle column** is **Big Red** (any 7, **4:1**, no seven-dice art) stacked above **Hard Way All Day** (165 FOR 1).
- **Hardways** are the right **2×2**: Hard 6 (3–3, 9:1) and Hard 10 (5–5, 7:1) on top; Hard 4 (2–2, 7:1) and Hard 8 (4–4, 9:1) below.
- **Come** and **Don't Come** are the only bets in the come band (Don't Come stays the narrower Regular-only bar). Buy is above each number, Place below.
- Phone portrait restacks **Low / All / High** into a compact vertical strip and scrolls. Phone landscape is a two-pane swipe: **Felt** (the whole board) and **Bubble** (hood, dice, Roll). The last-rolls rail lives under the Roll controls, not on the felt.

## Phone landscape panes

Widths up to 980px and heights up to 500px in landscape use a horizontal pager:

1. **Felt** — the full layout on one screen (scaled to fit). Chips, Place / Take down, Bets Off, Billy’s Way, Reset, and Repeat stay in a slim dock.
2. **Bubble** — neon BB hood, dice, and the large Roll button. Swipe back, or tap **Felt** / **Bubble**.

Portrait and desktop keep a single scrolling (or side-by-side) board with the bubble above the felt. No bet math changes.

## Single hardways, Horn, C, and E

Hard 4 / 10 pay 7:1, Hard 6 / 8 pay 9:1. They stay up until a hard win (paid, bet remains), a 7, the easy way, or you take them down.

One-roll props repeat after a win, like a machine:

| Bet | Wins on | Practice pay |
| --- | --- | --- |
| **Big Red** (any 7) | 7 | **4:1** |
| **Aces (2)** | 1–1 | **30:1** |
| **Midnight (12)** | 6–6 | **30:1** |
| **Ace-deuce (3)** | 3 | **15:1** |
| **Yo (11)** | 11 | **15:1** |
| **C · Any Craps** | 2, 3, 12 | **7:1** |
| **E · Eleven (Yo)** | 11 | **15:1** |
| **Horn 4-way** | 2, 3, 11, 12 | 2/12 = 30:1 on the $1 that hits (net +$27 per $4); 3/11 = 15:1 (net +$12 per $4) |

Horn 4-way posts in **$4 units**. Hop legs take the selected chip on that total.

## Buy vs Place

Each point number has **Buy above** the number and **Place below**. Both stay after a hit and lose on 7. They are off on the come-out unless you check **Place & Buy work on come-out**.

| | 4 / 10 | 5 / 9 | 6 / 8 | Crapless 2 / 12 | Crapless 3 / 11 |
| --- | --- | --- | --- | --- | --- |
| **Place** | 9:5 | 7:5 | 7:6 | 11:2 | 11:4 |
| **Buy** (true odds) | 2:1 | 3:2 | 6:5 | 6:1 | 3:1 |

**Buy vig:** 5% of the buy stake, **taken on a win only**. Not charged when you post the bet, and not charged if a 7 takes it down. Example: $20 Buy 4 pays $40 true odds minus $1 vig → **$39 profit**; the $20 stays up.

**Bets Off** covers Place and Buy only. **Billy’s Way** Buys the selected chip on 2, 3, 4, 5, 9, 10, 11, 12 when those spots exist (Regular: 4, 5, 9, 10; Crapless adds 2, 3, 11, 12) and Places chip × 6/5 on 6 and 8, stacking one unit per press. **Hand rolls** counts rolls in the current shooter hand and resets after seven-out. **Reset to starting bet** remembers the first come-out layout of the hand (captured when that come-out is rolled with bets up) and restores it.

## Other live bets

Pass + odds, Don't Pass + lay odds (regular), Come / Don't Come + odds, Field (2 & 12 double), Place and Buy numbers, Big Red (any 7), hop legs (Aces / Midnight / Ace-deuce / Yo), Any Craps, Horn 4-way.

## Project layout

- `index.html` — machine shell
- `css/styles.css` — bubble viewport + green digital layout
- `js/engine.js` — rules and settlement
- `js/dice.js` — 3D dice
- `js/ui.js` — controls
- `js/app.js` — boot
- `tests/engine.test.js` — settlement checks
