#!/usr/bin/env bash
# ── sentinel guard: npm install interceptor ──────────────────────────────
# Source this file from ~/.bashrc or ~/.zshrc:
#
#   export SENTINEL_DIR="/path/to/sentinel-ai"
#   source "$SENTINEL_DIR/scripts/guard-npm.sh"
#
# It intercepts `npm install`, `npm i`, and `npm add` and runs the guard
# check on the package names before allowing the real npm command.

guard-npm() {
  # skip if SENTINEL_DIR is not set or we are inside sentinel-ai itself
  if [[ -z "$SENTINEL_DIR" || "$PWD" == "$SENTINEL_DIR"* ]]; then
    command npm "$@"
    return $?
  fi

  local cmd="$1"
  if [[ "$cmd" == "install" || "$cmd" == "i" || "$cmd" == "add" ]]; then
    shift
    local pkgs=()
    for arg in "$@"; do
      if [[ "$arg" == -* ]]; then
        case "$arg" in
          --registry|--scope|-e|--engine-strict|-d|-s|-f|-g|-o|-D|-P|-E|-B)
            # single-letter flags followed by a value: -d, -s, -f, -g, -o, -D, -P, -E, -B
            if [[ ${#arg} -eq 2 ]]; then shift; fi
            ;;
          --save-dev|--save-prod|--save-exact|--save-bundle|--global|--no-save|--dry-run|--force)
            ;;
          --registry|--scope|--tag|--engine-strict|--git-tag-version|--sign-git-tag)
            shift ;;
        esac
        continue
      fi
      pkgs+=("$arg")
    done
    if [[ ${#pkgs[@]} -gt 0 ]]; then
      npx tsx "$SENTINEL_DIR/src/guard.ts" "${pkgs[@]}" || return 1
    fi
  fi
  command npm "$@"
}

alias npm='guard-npm'
