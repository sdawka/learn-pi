#!/usr/bin/env bash
# Launch pi with the model pinned to openrouter/elephant-alpha.
#
# pi-mono's saved-default resolver requires models to exist in pi-ai's static
# registry; cloaked OpenRouter releases like elephant-alpha do not, so we have
# to pass --model on the CLI where the "custom model id" fallback kicks in.
#
# Usage:
#   ./learn-pi/scripts/run.sh --vault .
#   ./learn-pi/scripts/run.sh --vault . /start-session es
#
# Env:
#   OPENROUTER_API_KEY         required for openrouter/elephant-alpha
#   LEARN_PI_TELEGRAM_TOKEN    required for the telegram-gateway extension

set -euo pipefail

: "${OPENROUTER_API_KEY:?OPENROUTER_API_KEY must be set (https://openrouter.ai/keys)}"

if [[ -z "${LEARN_PI_TELEGRAM_TOKEN:-}" ]]; then
  echo "warn: LEARN_PI_TELEGRAM_TOKEN not set — telegram-gateway will no-op" >&2
fi

exec pi --model openrouter/elephant-alpha "$@"
