# __NAME__ — storyboard

Fill this in before writing scene code. Shots 2–6s. One idea per shot.

| # | shot id | start–end | what happens | style | lyric cue |
|---|---|---|---|---|---|
| 1 | 01-boot | 0.0–4.0 | system boots, identity lookup fails, title lands | T1 terminal + T4 CRT | — |
| 2 | 02-lyric | 4.0–9.0 | one lyric line owns the frame, glitch on entry | T2 kinetic type + T3 | 示例歌词第一句 → 第二句 |
| 3 | 03-log-rain | 9.0–12.0 | logs keep falling after the song stops, closing card | T1 + T9 cut-up | 第四句 → 第五句 |
| 4 | 04-particle | 12.0–15.0 | seeded swarm orbits one hot core, every particle trailing low-alpha ghosts | T10 particle field + T6 | — |
| 5 | 05-isometric | 15.0–18.0 | isometric blocks rise on a diagonal wave, depth sorted by hand | T11 isometric 3D + T5 | — |
| 6 | 06-dataviz | 18.0–21.0 | telemetry dashboard: oscilloscope, bar strip, heat grid, all read off env.t | T12 data viz + T8 | — |

## Palette
Near-black base, cyan accent; magenta is reserved for failure and the one important event.

## Rules
- The renderer owns time. Nothing in src/scenes/ may read the wall clock or call Math.random().
- After every change: render a contact sheet, then actually look at it.
