#!/usr/bin/env bash
# Return early if sourced by a shell that doesn't support these aliases (e.g. /bin/sh).
[ -n "${BASH_VERSION:-}" ] || [ -n "${ZSH_VERSION:-}" ] || return 0

# shopt -s expand_aliases is bash-only; zsh expands aliases by default in interactive shells.
[ -n "${BASH_VERSION:-}" ] && shopt -s expand_aliases

alias claude="repoverlay switch --copy ff-claude && agency claude --mcp 'ado --org fluidframework'"
alias haiku="repoverlay switch --copy ff-claude && agency claude --mcp 'ado --org fluidframework' -- --model haiku"
alias sonnet="repoverlay switch --copy ff-claude && agency claude --mcp 'ado --org fluidframework' -- --model sonnet"
alias opus="repoverlay switch --copy ff-claude && agency claude --mcp 'ado --org fluidframework' -- --model opus"

alias nori="repoverlay switch --copy nori && agency claude --mcp 'ado --org fluidframework'"

alias copilot="agency copilot"
alias copilot-ado="agency copilot --mcp 'ado --org fluidframework'"
alias copilot-kusto="agency copilot --mcp 'kusto --service-uri https://kusto.aria.microsoft.com'"
alias copilot-oce="repoverlay switch --copy ff-oce && copilot -- --agent ff-oce"
alias copilot-work="agency copilot --mcp 'workiq'"

alias ai-reset="repoverlay remove --all"
