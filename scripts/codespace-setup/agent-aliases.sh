#!/usr/bin/env bash
# Return early if sourced by a shell that doesn't support these aliases (e.g. /bin/sh).
[ -n "${BASH_VERSION:-}" ] || [ -n "${ZSH_VERSION:-}" ] || return 0

# Ensures agency is installed and in PATH; installs it (via the repo-approved pnpm script) if not.
_ensure_agency() {
	local AGENCY_DIR="$HOME/.config/agency/CurrentVersion"
	if [[ ! -x "$AGENCY_DIR/agency" ]]; then
		echo "Agency is not installed. Installing now..."
		echo "  A browser window will open for authentication!"
		pnpm install:agency || return 1
		echo "Please wait..."
	fi
	if [[ ! -x "$AGENCY_DIR/agency" ]]; then
		echo "Agency is still not available at $AGENCY_DIR/agency after installation." >&2
		return 1
	fi
	# Always ensure agency is in PATH (whether just installed or pre-existing).
	if [[ ":$PATH:" != *":$AGENCY_DIR:"* ]]; then
		export PATH="$AGENCY_DIR:$PATH"
	fi
}

# Agent launcher functions. Extra args (e.g. --mcp 'kusto ...') are inserted
# before the -- separator so they reach agency, not Claude/Copilot directly.
claude() {
	_ensure_agency || return 1
	{ repoverlay remove --all 2>/dev/null; true; }
	agency claude --mcp 'ado --org fluidframework' --mcp 'workiq' --mcp 'enghub' "$@" -- --model opus
}

dev() {
	_ensure_agency || return 1
	repoverlay switch --copy nori
	agency claude --mcp 'ado --org fluidframework' --mcp 'workiq' --mcp 'enghub' "$@" -- --model opus
}

copilot() {
	_ensure_agency || return 1
	{ repoverlay remove --all 2>/dev/null; true; }
	agency copilot "$@"
}

oce() {
	_ensure_agency || return 1
	repoverlay switch --copy ff-oce
	agency copilot "$@" -- --agent ff-oce
}

ai-reset() {
	repoverlay remove --all
}

start() {
	_ensure_agency || return 1
	flub-ai "$@"
}

obiwan() {
	start "$@"
}

# Interactive launcher: runs `flub ai` to pick an alias, then executes it as a
# separate top-level process (flub and the Copilot CLI server are fully stopped
# before the alias starts).
flub-ai() {
	local launch_file
	launch_file=$(mktemp "${TMPDIR:-/tmp}/flub-ai-XXXXXX") || {
		echo "Failed to create a temporary launch file." >&2
		return 1
	}
	flub ai --launch-file "$launch_file" "$@"
	local rc=$?
	if [ "$rc" -eq 0 ] && [ -s "$launch_file" ]; then
		local cmd
		cmd=$(<"$launch_file")
		rm -f "$launch_file"
		eval "$cmd"
	else
		rm -f "$launch_file"
		return $rc
	fi
}
