#!/bin/bash
# SessionStart hook: install the `gog` Google CLI and restore Google auth so
# Sheets/Gmail/etc. work in Claude Code on the web sessions.
#
# Secrets are NEVER committed. They are read from environment variables that
# you configure in your Claude Code on the web environment settings:
#   GOG_KEYRING_PASSWORD  - keyring password for the gog secret store
#   GOG_CLIENT_JSON       - OAuth client (the downloaded "installed" JSON)
#   GOG_TOKEN_JSON        - exported refresh-token JSON (from `gog auth tokens export`)
set -euo pipefail

# Only run in the remote (web) environment.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

GOG_VERSION="0.29.0"
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
log() { echo "[gog-setup] $*"; }

# 1) Install gog if missing (checksum-verified, idempotent) -------------------
if ! "$BIN_DIR/gog" --version >/dev/null 2>&1; then
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64)  garch=amd64; sha=2001ab8e8e2dfb97916af0df25b273763ec26b49e3c425961e66893ca7d0069f ;;
    aarch64|arm64) garch=arm64; sha=dbac3938ed5d54435453101d5c60ce2d1c2c72feda3b53f4b75a395bc50f09b9 ;;
    *) log "unsupported arch: $arch"; exit 0 ;;
  esac
  url="https://github.com/openclaw/gogcli/releases/download/v${GOG_VERSION}/gogcli_${GOG_VERSION}_linux_${garch}.tar.gz"
  tmp="$(mktemp -d)"
  curl -sSL --max-time 120 -o "$tmp/g.tgz" "$url"
  echo "${sha}  $tmp/g.tgz" | sha256sum -c - >/dev/null
  tar xzf "$tmp/g.tgz" -C "$tmp" gog
  install -m 0755 "$tmp/gog" "$BIN_DIR/gog"
  rm -rf "$tmp"
  log "installed gog v${GOG_VERSION}"
else
  log "gog already present ($("$BIN_DIR/gog" --version 2>/dev/null | head -1))"
fi

# Make sure ~/.local/bin is on PATH for the rest of the session.
case ":$PATH:" in
  *":$BIN_DIR:"*) : ;;
  *) [ -n "${CLAUDE_ENV_FILE:-}" ] && echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$CLAUDE_ENV_FILE" ;;
esac

# 2) Restore Google auth from secrets (skip cleanly if not configured) --------
if [ -n "${GOG_KEYRING_PASSWORD:-}" ] && [ -n "${GOG_CLIENT_JSON:-}" ] && [ -n "${GOG_TOKEN_JSON:-}" ]; then
  umask 077
  mkdir -p "$HOME/.local/share/gogcli"
  cfile="$(mktemp)"; tfile="$(mktemp)"
  printf '%s' "$GOG_CLIENT_JSON" > "$cfile"
  printf '%s' "$GOG_TOKEN_JSON"  > "$tfile"
  "$BIN_DIR/gog" auth credentials set "$cfile" >/dev/null 2>&1 || log "WARN: credentials set failed"
  "$BIN_DIR/gog" auth tokens import "$tfile"   >/dev/null 2>&1 || log "WARN: token import failed"
  rm -f "$cfile" "$tfile"
  if "$BIN_DIR/gog" auth list 2>/dev/null | grep -q "teamt1diabetes@gmail.com"; then
    log "Google auth restored (teamt1diabetes@gmail.com) — Sheets ready"
  else
    log "WARN: auth not restored; check GOG_KEYRING_PASSWORD / GOG_CLIENT_JSON / GOG_TOKEN_JSON"
  fi
else
  log "gog installed but not authenticated (set GOG_* env secrets to enable Sheets)"
fi
