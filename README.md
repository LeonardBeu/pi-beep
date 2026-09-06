# @beu-l/pi-beep

Beep notifier for [pi](https://pi.dev). Plays a "short–long" beep when the agent finishes and waits for you, or when it stops to ask you a question. Volume is controllable — on Windows the tone is synthesized as a WAV in Node (so amplitude = volume) and played via PowerShell's `SoundPlayer`. **Zero npm dependencies.**

## Install

```
pi install npm:@beu-l/pi-beep
```

Then start pi, or type `/reload` in a running session. Remove with:

```
pi uninstall npm:@beu-l/pi-beep
```

## When it beeps

| Moment | Event | Why this one |
|---|---|---|
| Agent finished a full run, waiting for input | `agent_settled` | Not `agent_end`, which can fire mid-retry/compact |
| Agent stopped to ask you a question (`ask_user_question`) | `tool_call` hook | The turn is still active while blocked on your answer. Note: this relies on the [`@juicesharp/rpiv-ask-user-question`](https://www.npmjs.com/package/@juicesharp/rpiv-ask-user-question) package being installed — remove it and only the "finished" beep remains. |

## Commands

| Command | Effect |
|---|---|
| `/beep` | Shows current state (on/off, frequency, durations, volume) |
| `/beep on` / `/beep off` | Enable/disable — saved to config; turning ON plays a confirmation beep |
| `/beep vol <0-100>` | Set volume % — saved and immediately played at the new level |

## Config file

Location: `~/.pi/agent/extensions/beep.json` (respects `PI_CODING_AGENT_DIR`). Created automatically by `/beep on|off|vol`; you can also create it by hand. Missing keys fall back to defaults — no file = all defaults.

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
| `volumePct` | `100` | Volume 0–100, clamped. Windows only — see below |

The two tones are always separated by a fixed 160ms silent gap. Hand-edited values take effect after `/reload`.

## Notes / limitations

- **Volume control is Windows-only.** It works because the WAV samples' amplitude *is* the volume. On other platforms the extension falls back to a terminal bell (`\x07`), whose sound depends on your terminal settings and can't be controlled from here.
- The beep fires once per settled run — including short answers. If it gets annoying, set `enabled: false`.
- On Windows playback spawns a short-lived `powershell.exe`; if that binary is blocked the notifier silently does nothing (it never crashes pi).

## License

MIT
