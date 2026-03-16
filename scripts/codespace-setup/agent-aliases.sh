#!/usr/bin/env bash
shopt -s expand_aliases

alias claude="agency claude"
alias haiku="agency claude --model haiku"
alias sonnet="agency claude --model sonnet"
alias opus="agency claude --model opus"

alias copilot="agency copilot"
alias copilot-ado="agency copilot --mcp 'ado --org fluidframework'"
alias copilot-kusto="agency copilot --mcp 'kusto --service-uri https://kusto.aria.microsoft.com'"
alias copilot-work="agency copilot --mcp 'workiq'"

alias copilot-oce="repoverlay switch ff-oce && copilot-kusto"
