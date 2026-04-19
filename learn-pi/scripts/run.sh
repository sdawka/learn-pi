#!/usr/bin/env bash
# Launch pi with the model pinned to openrouter/elephant-alpha.
#
# pi-mono's saved-default resolver requires models to exist in pi-ai's static
# registry; cloaked OpenRouter releases like elephant-alpha do not, so we have
# to pass --model on the CLI where the "custom model id" fallback kicks in.
#
# Usage:
#   cd ~/LearnVault && /path/to/run.sh --vault .
#   /path/to/run.sh --vault ~/LearnVault /start-session es
#
# Secrets: sourced from <vault>/.env if present (keep it gitignored).
# Required keys:
#   OPENROUTER_API_KEY         https://openrouter.ai/keys
#   LEARN_PI_TELEGRAM_TOKEN    from @BotFather (optional; gateway no-ops without it)

set -euo pipefail

# Resolve the vault path from --vault <path>, or default to $PWD. We walk the
# args so we don't care about ordering relative to other pi flags.
vault="$PWD"
args=("$@")
for (( i=0; i<${#args[@]}; i++ )); do
  if [[ "${args[i]}" == "--vault" && $((i+1)) -lt ${#args[@]} ]]; then
    vault="${args[i+1]}"
    break
  fi
done

if [[ -f "$vault/.env" ]]; then
  # shellcheck source=/dev/null
  set -a; . "$vault/.env"; set +a
fi

: "${OPENROUTER_API_KEY:?OPENROUTER_API_KEY must be set (put it in $vault/.env)}"

if [[ -z "${LEARN_PI_TELEGRAM_TOKEN:-}" ]]; then
  echo "warn: LEARN_PI_TELEGRAM_TOKEN not set — telegram-gateway will no-op" >&2
fi

exec pi --model openrouter/elephant-alpha "$@"
