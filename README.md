# @beu-l/pi-beep

Beep notifier for [pi](https://pi.dev). Plays a short–long beep when the agent finishes and waits for you, or when it stops to ask you a question. Zero npm dependencies; the tone is synthesized as a WAV in Node (amplitude = volume), then played via PowerShell's `SoundPlayer` on Windows, `afplay` on macOS, or `paplay`/`aplay` on Linux.

| | |
|---|---|
| Version | 0.2.2 |
| License | MIT |
| Package | [@beu-l/pi-beep on npm](https://www.npmjs.com/package/@beu-l/pi-beep) |

## Installation

**From npm (recommended):**

```bash
pi install npm:@beu-l/pi-beep
```

Updates are picked up with `pi update`. Pin a version if you want stability: `npm:@beu-l/pi-beep@0.2.2`. Remove it later with:

```bash
pi uninstall npm:@beu-l/pi-beep
```

In an already-running session, type `/reload` to load or reload the extension.

## When it beeps

Two moments trigger the notify:

| Moment | Event | Why this one |
|---|---|---|
| Agent finished a full run, waiting for input | `agent_settled` | Not `agent_end`, which can fire mid-retry/compact. Only beeps if the run lasted ≥ `minRunMs` (default 15 s) — quick answers stay quiet |
| Agent stopped to ask you a question (`ask_user_question`) | `tool_call` hook | The turn is still active while blocked on your answer; always beeps, never duration-gated. Requires the [`@juicesharp/rpiv-ask-user-question`](https://www.npmjs.com/package/@juicesharp/rpiv-ask-user-question) package — without it, only the "finished" beep fires. |

The two beeps are independent: disable just one with `/beep settled off` or `/beep question off`.

## Commands

| Command | Effect |
|---|---|
| `/beep` | Shows current state (master + per-event toggles, cutoff, frequency, durations, volume) |
| `/beep on` / `/beep off` | Master enable/disable — saved to config; turning ON plays a confirmation beep |
| `/beep settled on\|off` | Toggle only the run-finished beep (turning ON plays a confirmation beep) |
| `/beep question on\|off` | Toggle only the ask-question beep (turning ON plays a confirmation beep) |
| `/beep vol <0-100>` | Set volume % — saved and played immediately at the new level |
| `/beep minimum <sec>` | Set the quiet cutoff in seconds — runs shorter than this stay silent (e.g. `minimum 30`) |

**Argument autocomplete (v0.1.1+, v0.2.0 added `settled`/`question`, v0.2.1 added `minimum`):** while typing, pi lists `on`, `off`, `settled on|off`, `question on|off`, `vol <0-100>` and `minimum <sec>` automatically — no Tab required. Type `/beep `, pick an option with the arrow keys, then finish a percentage after `vol` (once you start typing digits, suggestions stop so your input is never overwritten). Note that Tab after the space is reserved for file-path completion by pi's editor and will not show these options.

## Configuration

Location: `<agent-dir>/extensions/beep.json` (default `~/.pi/agent/extensions/beep.json`; honors `PI_CODING_AGENT_DIR`). Created automatically by `/beep on|off|vol`, or create it by hand. Missing keys fall back to defaults — no file = all defaults.

```json
{
  "enabled": true,
  "beepOnSettled": true,
  "beepOnQuestion": true,
  "minRunMs": 15000,
  "frequencyHz": 880,
  "shortMs": 140,
  "longMs": 350,
  "volumePct": 100
}
```

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch |
| `beepOnSettled` | `true` | Beep when a run finishes and waits for input |
| `beepOnQuestion` | `true` | Beep when the agent asks you a question (never duration-gated) |
| `minRunMs` | `15000` | Runs shorter than this don't trigger the settled beep — live-editable via `/beep minimum <sec>` (seconds) |
| `frequencyHz` | `880` | Tone pitch |
| `shortMs` | `140` | First (short) beep duration |
| `longMs` | `350` | Second (long) beep duration |
| `volumePct` | `100` | Volume 0–100, clamped. Works on all platforms that have an audio player (see Notes) |

The two tones are always separated by a fixed 160 ms silent gap. Hand-edited values take effect after `/reload`.

## Notes and limitations

- **Platform backends:** Windows → PowerShell `SoundPlayer`; macOS → `afplay`; Linux → `paplay`, then plain `aplay`. If none of those binaries exist, it falls back to a terminal bell (`\x07`), whose sound depends on your terminal settings and cannot be controlled from here.
- **Volume control works everywhere except the bell fallback.** The WAV samples' amplitude *is* the volume, so all player backends honor `volumePct`/`/beep vol`.
- The settled beep fires once per run — only when the run lasted at least `minRunMs`. If it still becomes annoying, set `enabled: false`, or just that event off with `/beep settled off`.
- On Windows playback spawns a short-lived `powershell.exe`; on macOS/Linux it spawns the detected player. If that binary is blocked the notifier silently does nothing (it never crashes pi).

## License

MIT
