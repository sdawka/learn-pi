// telegram-gateway.ts — bridges the active pi-mono session to Telegram.
//
// Inbound: long-polls getUpdates; each text message is forwarded into the pi
// session via `pi.sendUserMessage(...)`, which drives a full agent turn.
//
// Outbound: on `agent_end`, the last assistant message is read from
// `ctx.sessionManager.getEntries()` and sent to Telegram.
//
// Proactive: a timer honors active_window, quiet_hours, and min_gap_minutes
// from settings/schedule.yaml; when it fires it calls `pi.sendUserMessage("")`
// to ask the agent to produce a natural proactive turn.
//
// Env: requires $LEARN_PI_TELEGRAM_TOKEN (name configurable via telegram.yaml).

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { inWindow } from "../lib/time-window.ts";

type ExtensionAPI = {
  on(event: string, handler: (event: any, ctx: any) => any): void;
  sendUserMessage(text: string): void;
};

type TelegramSettings = {
  bot_token_env: string;
  chat_id: number | null;
  quiet_hours: string;
  timezone: string;
};

type ScheduleSettings = {
  cadence: string;
  active_window: string;
  min_gap_minutes: number;
  on_demand: boolean;
};

type Update = {
  update_id: number;
  message?: { chat: { id: number }; text?: string };
};

function readYaml<T>(abs: string): T | null {
  if (!fs.existsSync(abs)) return null;
  return yaml.load(fs.readFileSync(abs, "utf8")) as T;
}

function parseCadence(c: string): number {
  const m = c.match(/every\s+(\d+)\s*([hm])/i);
  if (!m) return 3 * 60 * 60 * 1000;
  const n = Number(m[1]);
  return (m[2].toLowerCase() === "h" ? n * 60 : n) * 60 * 1000;
}

async function tg(token: string, method: string, body?: unknown): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export default function telegramGateway(pi: ExtensionAPI): void {
  let token: string | null = null;
  let tgSettings: TelegramSettings | null = null;
  let schedule: ScheduleSettings | null = null;
  let boundChatId: number | null = null;
  let lastProactiveAt = 0;
  let lastAssistantSent = "";
  let polling = false;

  pi.on("session_start", async (_event, ctx) => {
    const vaultPath: string = ctx.cwd;
    tgSettings = readYaml<TelegramSettings>(path.join(vaultPath, "settings/telegram.yaml"));
    schedule = readYaml<ScheduleSettings>(path.join(vaultPath, "settings/schedule.yaml"));
    if (!tgSettings || !schedule) return;

    token = process.env[tgSettings.bot_token_env] ?? null;
    if (!token) {
      ctx.ui?.notify?.(
        `telegram-gateway: env ${tgSettings.bot_token_env} not set, skipping`,
        "warn",
      );
      return;
    }
    boundChatId = tgSettings.chat_id;

    // Inbound long-poll
    if (!polling) {
      polling = true;
      (async function poll() {
        let offset = 0;
        for (;;) {
          try {
            const res = await tg(token!, "getUpdates", { offset, timeout: 25 });
            const updates: Update[] = res.result ?? [];
            for (const u of updates) {
              offset = u.update_id + 1;
              const msg = u.message;
              if (!msg?.text) continue;
              if (boundChatId === null) boundChatId = msg.chat.id;
              if (msg.chat.id !== boundChatId) continue;
              pi.sendUserMessage(msg.text);
            }
          } catch { /* transient — retry */ }
        }
      })();
    }

    // Proactive timer — ticks every minute, fires when all conditions pass.
    const gapMs = schedule.min_gap_minutes * 60 * 1000;
    const cadenceMs = parseCadence(schedule.cadence);
    setInterval(() => {
      if (!boundChatId || !token || !tgSettings || !schedule) return;
      const now = new Date();
      const tz = tgSettings.timezone;
      if (!inWindow(now, schedule.active_window, tz)) return;
      if (inWindow(now, tgSettings.quiet_hours, tz)) return;
      if (Date.now() - lastProactiveAt < Math.max(gapMs, cadenceMs)) return;
      lastProactiveAt = Date.now();
      pi.sendUserMessage(""); // empty → agent composes a proactive turn
    }, 60_000);
  });

  // Outbound: after each agent turn, send the latest assistant message.
  pi.on("agent_end", async (_event, ctx) => {
    if (!token || !boundChatId) return;
    const entries: Array<{ role?: string; content?: any; customType?: string }> =
      ctx.sessionManager?.getEntries?.() ?? [];
    // Find the most recent assistant text entry.
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (e.customType) continue;
      if (e.role !== "assistant") continue;
      const text =
        typeof e.content === "string"
          ? e.content
          : Array.isArray(e.content)
          ? e.content
              .filter((p: any) => p.type === "text")
              .map((p: any) => p.text)
              .join("\n")
          : "";
      // Skip empty assistant entries (tool-only messages, empty wraps after
      // tool-calls, flaky model returning zero-token content). Walk back to
      // find the most recent assistant entry that actually has text.
      if (!text) continue;
      // Dedup against what we already sent — if it matches, we've forwarded
      // this turn's text already on a prior agent_end, so stop walking.
      if (text === lastAssistantSent) return;
      lastAssistantSent = text;
      try {
        await tg(token, "sendMessage", { chat_id: boundChatId, text });
      } catch { /* transient */ }
      return;
    }
  });
}
