# @beu-l/pi-beep

Beep notifier for [pi](https://pi.dev). Plays a short–long beep when the agent finishes and waits for you, or when it stops to ask you a question. Zero npm dependencies; on Windows the tone is synthesized as a WAV in Node (amplitude = volume) and played via PowerShell's `SoundPlayer`.

| | |
|---|---|
| Version | 0.1.2 |
| License | MIT |
| Package | [@beu-l/pi-beep on npm](https://www.npmjs.com/package/@beu-l/pi-beep) |

## Installation

**From npm (recommended):**

```bash
pi install npm:@beu-l/pi-beep
```

Updates are picked up with `pi update`. Pin a version if you want stability: `npm:@beu-l/pi-beep@0.1.2`. Remove it later with:

```bash
pi uninstall npm:@beu-l/pi-beep
```

In an already-running session, type `/reload` to load or reload the extension.

## When it beeps

| Moment | Event | Why this one |
|---|---|---|
| Agent finished a full run, waiting for input | `agent_settled` | Not `agent_end`, which can fire mid-retry/compact |
| Agent stopped to ask you a question (`ask_user_question`) | `tool_call` hook | The turn is still active while blocked on your answer. Requires the [`@juicesharp/rpiv-ask-user-question`](https://www.npmjs.com/package/@juicesharp/rpiv-ask-user-question) package — without it, only the "finished" beep fires. |

## Commands

| Command | Effect |
|---|---|
| `/beep` | Shows current state (on/off, frequency, durations, volume) |
| `/beep on` / `/beep off` | Enable/disable — saved to config; turning ON plays a confirmation beep |
| `/beep vol <0-100>` | Set volume % — saved and played immediately at the new level |

**Argument autocomplete (v0.1.1+):** while typing, pi lists `on`, `off` and `vol <0-100>` automatically — no Tab required. Type `/beep `, pick an option with the arrow keys, then finish a percentage after `vol`. Note that Tab after the space is reserved for file-path completion by pi's editor and will not show these options.

## Configuration

Location: `<agent-dir>/extensions/beep.json` (default `~/.pi/agent/extensions/beep.json`; honors `PI_CODING_AGENT_DIR`). Created automatically by `/beep on|off|vol`, or create it by hand. Missing keys fall back to defaults — no file = all defaults.

```json
{
  "enabled": true,
  "frequencyHz": 880,
  "shortMs": 140,
  "longMs": 350,
  "volumePct": 100
}
```

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch |
| `frequencyHz` | `880` | Tone pitch |
| `shortMs` | `140` | First (short) beep duration |
| `longMs` | `350` | Second (long) beep duration |
| `volumePct` | `100` | Volume 0–100, clamped. Windows only — see Notes |

The two tones are always separated by a fixed 160 ms silent gap. Hand-edited values take effect after `/reload`.

## Notes and limitations

- **Volume control is Windows-only.** It works because the WAV samples' amplitude *is* the volume. On other platforms the extension falls back to a terminal bell (`\x07`), whose sound depends on your terminal settings and cannot be controlled from here.
- The beep fires once per settled run — including short answers. If it becomes annoying, set `enabled: false`.
- On Windows playback spawns a short-lived `powershell.exe`; if that binary is blocked the notifier silently does nothing (it never crashes pi).

## License

MIT
