/**
 * Beep Notifier Extension
 *
 * Plays "short-long" beep when the agent finishes (agent_settled) and when
 * it stops to ask the user a question. Volume is controllable via config
 * (the WAV is synthesized in Node, so amplitude = volume).
 *
 * Config: <agent-dir>/extensions/beep.json, e.g.
 *   { "enabled": true, "beepOnSettled": true, "beepOnQuestion": true,
 *     "minRunMs": 15000, "frequencyHz": 880, "shortMs": 140, "longMs": 350, "volumePct": 100 }
 * Commands: /beep [on|off] | settled on|off | question on|off | vol <0-100> — no arg shows state.
 *
 * Sound: Windows = synthesized WAV played via PowerShell SoundPlayer (no deps).
 *        Other platforms = terminal bell (\x07) fallback (no volume control there).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

interface BeepConfig {
	enabled?: boolean;
	beepOnSettled?: boolean; // settled (run finished) beep
	beepOnQuestion?: boolean; // ask_user_question beep
	minRunMs?: number; // don't beep for runs shorter than this (settled only)
	frequencyHz?: number;
	shortMs?: number;
	longMs?: number;
	volumePct?: number;
}

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
const CONFIG_PATH = path.join(AGENT_DIR, "extensions", "beep.json");
// Fixed temp file: overwritten on every beep, so no cleanup needed.
const WAV_PATH = path.join(os.tmpdir(), "pi-beep.wav");

// The audio backend for this session (detected once). Volume rides in the WAV
// amplitude itself, so no per-backend volume flag is needed.
type Backend = { cmd: string; args: string[] } | "bell";
let backendCache: Backend | undefined;

function detectBackend(): Backend {
	if (backendCache) return backendCache;
	const p = process.platform;
	let b: Backend;
	if (p === "win32") {
		b = { cmd: "powershell.exe", args: ["-NoProfile", "-Command", `(New-Object System.Media.SoundPlayer '${WAV_PATH}').PlaySync()`] };
	} else if (p === "darwin") {
		hasBinary("afplay") ? (b = { cmd: "afplay", args: [WAV_PATH] }) : (b = "bell");
	} else if (hasBinary("paplay")) {
		b = { cmd: "papley", args: [WAV_PATH] };
	} else if (hasBinary("aplay")) {
		b = { cmd: "aplay", args: [WAV_PATH] };
	} else {
		b = "bell"; // no audio player found — terminal bell fallback
	}
	backendCache = b;
	return b;
}

function hasBinary(name: string): boolean {
	try {
		execFileSync("sh", ["-c", `command -v ${name} >/dev/null 2>&1`]);
		return true;
	} catch {
		return false;
	}
}

const SAMPLE_RATE = 16000; // plenty for an ~880Hz tone
const GAP_MS = 160; // silence between the two tones
const FADE_MS = 5; // short ramp at tone edges to avoid clicks

function loadConfig(): Required<BeepConfig> {
	const defaults: Required<BeepConfig> = { enabled: true, beepOnSettled: true, beepOnQuestion: true, minRunMs: 15000, frequencyHz: 880, shortMs: 140, longMs: 350, volumePct: 100 };
	try {
		return { ...defaults, ...(JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as BeepConfig) };
	} catch {
		return defaults;
	}
}

let config = loadConfig();

// Timestamp of the first agent_start in the current settled run (retries/
// compaction fire agent_start again, so only record while null).
let runStart: number | null = null;

function saveConfig(): void {
	fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

/** Build a mono 16-bit PCM WAV: tone A, silent gap, tone B. */
function synthesizeWav(): Buffer {
	const { frequencyHz: f, shortMs: a, longMs: b, volumePct } = config;
	const vol = Math.min(100, Math.max(0, volumePct)) / 100;

	const segments: number[] = [];
	for (const ms of [a, GAP_MS, b]) {
		const count = Math.round((SAMPLE_RATE * ms) / 1000);
		const isTone = ms !== GAP_MS;
		let phase = 0;
		const fadeCount = Math.min(count, Math.round((SAMPLE_RATE * FADE_MS) / 1000));
		for (let i = 0; i < count; i++) {
			if (!isTone) {
				segments.push(0);
				continue;
			}
			const sample = 32767 * vol * Math.sin(phase);
			phase += (2 * Math.PI * f) / SAMPLE_RATE;
			// linear fade in/out to kill click artifacts
			const ramp = i < fadeCount ? i / fadeCount : i > count - fadeCount ? (count - i) / fadeCount : 1;
			segments.push(Math.round(sample * ramp));
		}
	}

	const dataLen = segments.length * 2;
	const buf = Buffer.alloc(44 + dataLen);
	buf.write("RIFF", 0);
	buf.writeUInt32LE(36 + dataLen, 4);
	buf.write("WAVE", 8);
	buf.write("fmt ", 12);
	buf.writeUInt32LE(16, 16); // fmt chunk size
	buf.writeUInt16LE(1, 20); // PCM
	buf.writeUInt16LE(1, 22); // mono
	buf.writeUInt32LE(SAMPLE_RATE, 24);
	buf.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
	buf.writeUInt16LE(2, 32); // block align
	buf.writeUInt16LE(16, 34); // bits per sample
	buf.write("data", 36);
	buf.writeUInt32LE(dataLen, 40);
	segments.forEach((s, i) => buf.writeInt16LE(s, 44 + i * 2));
	return buf;
}

function beep(): void {
	if (!config.enabled) return;

	const backend = detectBackend();
	if (backend === "bell") {
		// No audio player available — terminal bell (sound depends on terminal settings)
		process.stdout.write("\x07\x07");
		return;
	}

	fs.writeFileSync(WAV_PATH, synthesizeWav());
	execFile(backend.cmd, backend.args, () => {}); // fire and forget; never crash pi
}

function statusLine(): string {
	const { frequencyHz: f, shortMs: a, longMs: b, volumePct } = config;
	return `Beep ${config.enabled ? "ON" : "OFF"} — settled: ${config.beepOnSettled ? `on (runs ≥${(config.minRunMs / 1000).toFixed(config.minRunMs % 1000 ? 1 : 0)}s)` : "off"}, question: ${config.beepOnQuestion ? "on" : "off"} (${f}Hz, ${a}/${b}ms, vol ${volumePct}%)`;
}

export default function (pi: ExtensionAPI) {
	// First start of the current run (retries re-fire this; keep the earliest).
	pi.on("agent_start", () => {
		if (runStart === null) runStart = Date.now();
	});

	// Full run finished, Pi will not continue automatically.
	// Do NOT use agent_end — it fires per low-level run and can ring mid-retry/compact.
	pi.on("agent_settled", () => {
		const elapsed = runStart === null ? Infinity : Date.now() - runStart;
		runStart = null;
		if (!config.beepOnSettled || elapsed < config.minRunMs) return; // toggle off or quick answer — stay quiet
		beep();
	});

	// Agent stopped to ask the user a question (blocks on input). Never
	// duration-gated: the agent is blocked and needs you either way.
	pi.on("tool_call", (event) => {
		if (event.toolName === "ask_user_question" && config.beepOnQuestion) beep();
	});

	// Sub-command toggles: "settled" → beepOnSettled, "question" → beepOnQuestion
	const TOGGLES = new Map<string, "beepOnSettled" | "beepOnQuestion">([ ["settled", "beepOnSettled"], ["question", "beepOnQuestion"] ]);

	pi.registerCommand("beep", {
		description: "Beep notifier: /beep on|off | settled on|off | question on|off | vol <0-100>; no arg shows state",
		getArgumentCompletions: (prefix) => {
			const p = prefix.trim();
			// Once a volume number is being typed, stop suggesting so the picker
			// never replaces what was already entered.
			if (p.startsWith("vol")) {
				return /^\d/.test(p.slice(3).trim())
					? null
					: [{ value: "vol ", label: "vol <0-100>", description: "set volume % (0–100), e.g. vol 50" }];
			}
			// Per-event toggles: suggest on/off once the keyword is typed.
			for (const kind of TOGGLES.keys()) {
				if (p === kind || p.startsWith(kind + " ")) {
					return /^[a-z]/.test(p.slice(kind.length).trim())
						? null
						: [
							{ value: `${kind} on`, label: `${kind} on`, description: `enable the ${kind} beep` },
							{ value: `${kind} off`, label: `${kind} off`, description: `disable the ${kind} beep` },
						];
				}
			}
			return [
				{ value: "on", label: "on", description: "enable beeps" },
				{ value: "off", label: "off", description: "disable beeps" },
				{ value: "settled ", label: "settled on|off", description: "toggle the run-finished beep (only for runs ≥ minRunMs)" },
				{ value: "question ", label: "question on|off", description: "toggle the ask-question beep" },
				{ value: "vol ", label: "vol <0-100>", description: "set volume % (0–100), e.g. vol 50" },
			];
		},
		handler: async (args, ctx) => {
			const a = (args ?? "").trim().toLowerCase();
			if (a === "" || a === "status") {
				ctx.ui.notify(`${statusLine()} — /beep on|off | settled on|off | question on|off | vol <0-100>`, "info");
			} else if (a === "on" || a === "off") {
				config.enabled = a === "on";
				saveConfig();
				ctx.ui.notify(`Beep ${config.enabled ? "enabled" : "disabled"} — saved to beep.json. ${statusLine()}`, "info");
				if (config.enabled) beep(); // confirm with a sound so you can hear it works
			} else if (a.startsWith("vol")) {
				const n = Number.parseInt(a.slice(3).trim(), 10);
				if (!Number.isFinite(n) || n < 0 || n > 100) {
					ctx.ui.notify("Usage: /beep vol <0-100>", "error");
					return;
				}
				config.volumePct = n;
				saveConfig();
				ctx.ui.notify(`Volume set to ${n}% — saved to beep.json`, "info");
				beep(); // hear it at the new volume right away (silence if off)
			} else {
				const [word, val] = a.split(/\s+/);
				if (TOGGLES.has(word) && (val === "on" || val === "off")) {
					config[TOGGLES.get(word)!] = val === "on";
					saveConfig();
					ctx.ui.notify(`${statusLine()} — saved to beep.json`, "info");
					if (val === "on") beep(); // confirm with a sound so you can hear it works
				} else {
					ctx.ui.notify(`Usage: /beep on|off | settled on|off | question on|off | vol <0-100>`, "error");
				}
			}
		},
	});
}
