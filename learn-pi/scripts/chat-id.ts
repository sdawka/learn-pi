// Prints the chat IDs currently visible to the bot so you can pin one into
// settings/telegram.yaml instead of relying on first-message auto-binding.
//
// Usage:  npx tsx learn-pi/scripts/chat-id.ts <vault-path>
//
// Reads bot_token_env from the vault's settings/telegram.yaml, then calls
// getUpdates with no offset so it does NOT consume updates — safe to run
// while the live gateway is polling. Prints one line per distinct chat.

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

type TelegramSettings = { bot_token_env: string };

type TgUpdate = {
  message?: {
    chat: { id: number; type: string; title?: string; username?: string; first_name?: string };
  };
};

async function main(): Promise<void> {
  const vaultPath = process.argv[2];
  if (!vaultPath) {
    console.error("usage: tsx scripts/chat-id.ts <vault-path>");
    process.exit(2);
  }

  const settingsPath = path.join(vaultPath, "settings/telegram.yaml");
  if (!fs.existsSync(settingsPath)) {
    console.error(`not found: ${settingsPath}`);
    process.exit(2);
  }
  const settings = yaml.load(fs.readFileSync(settingsPath, "utf8")) as TelegramSettings;
  const envName = settings.bot_token_env ?? "LEARN_PI_TELEGRAM_TOKEN";
  const token = process.env[envName];
  if (!token) {
    console.error(`env ${envName} is not set`);
    process.exit(2);
  }

  // No offset → peek at buffered updates without acking them.
  const res = await fetch(
    `https://api.telegram.org/bot${token}/getUpdates?timeout=1`,
  );
  const body = (await res.json()) as { ok: boolean; description?: string; result?: TgUpdate[] };
  if (!body.ok) {
    console.error(`telegram error: ${body.description ?? "unknown"}`);
    process.exit(1);
  }

  const seen = new Map<number, string>();
  for (const u of body.result ?? []) {
    const chat = u.message?.chat;
    if (!chat) continue;
    const label =
      chat.title ??
      chat.username ??
      chat.first_name ??
      `(${chat.type})`;
    seen.set(chat.id, label);
  }

  if (seen.size === 0) {
    console.log("No updates buffered. Send the bot any message, then rerun.");
    return;
  }

  console.log("chat_id          label");
  console.log("---------------  -----");
  for (const [id, label] of seen) {
    console.log(`${String(id).padEnd(15)}  ${label}`);
  }
  console.log("\nPin one by setting `chat_id:` in settings/telegram.yaml.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
