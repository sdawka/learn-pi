#!/usr/bin/env bash
# Launch pi with the model pinned to openrouter/elephant-alpha.
#
# pi-mono's saved-default resolver requires models to exist in pi-ai's static
# registry; cloaked OpenRouter releases like elephant-alpha do not, so we have
# to pass --model on the CLI where the "custom model id" fallback kicks in.
#
# The learn-pi extensions (`learn-loop.ts`, `telegram-gateway.ts`) derive the
# vault path from pi-mono's `ctx.cwd`, so you run this script from inside the
# vault. There is no --vault flag on pi itself.
#
# Usage:
#   cd ~/LearnVault && /path/to/run.sh
#   cd ~/LearnVault && /path/to/run.sh /start-session es
#
# Secrets: sourced from ./.env (keep it gitignored). Required keys:
#   OPENROUTER_API_KEY         https://openrouter.ai/keys
#   LEARN_PI_TELEGRAM_TOKEN    from @BotFather (optional; gateway no-ops without it)

set -euo pipefail

if [[ -f ".env" ]]; then
  # shellcheck source=/dev/null
  set -a; . ./.env; set +a
fi

: "${OPENROUTER_API_KEY:?OPENROUTER_API_KEY must be set (put it in ./.env, or cd into your vault first)}"

if [[ -z "${LEARN_PI_TELEGRAM_TOKEN:-}" ]]; then
  echo "warn: LEARN_PI_TELEGRAM_TOKEN not set — telegram-gateway will no-op" >&2
fi

exec pi --model openrouter/elephant-alpha "$@"
