<#
.SYNOPSIS
    Parse an ADO pipeline log (as saved by the ADO MCP `build_log get_content` tool) and extract
    the mocha test summary and failure block. Cuts a multi-thousand-line report log down to the
    ~couple-dozen relevant lines.

.DESCRIPTION
    The ADO MCP `ado-pipelines_build_log action=get_content` saves large logs to a temp file as a
    JSON array of strings (one per line), each prefixed with an ISO timestamp and often containing
    ANSI color codes. This script:
      - loads and JSON-decodes that file,
      - strips ANSI escapes and the leading "<timestamp>Z " prefix,
      - reports the report-step command (test:realsvc:<driver>:report ...),
      - prints the "N passing / N pending / N failing" summary,
      - prints each numbered failure block with its 1-based log line number
        (usable directly in a  ...?startLine=&endLine=  log link).

.PARAMETER Path
    Path to the temp file produced by get_content (a JSON array of log line strings).
    Also accepts a plain newline-delimited log file (auto-detected).

.PARAMETER Context
    Lines of context to print for each failure block. Default 25.

.PARAMETER Raw
    If set, emit the cleaned (de-ANSI'd, de-timestamped) lines to stdout instead of the digest.

.EXAMPLE
    ./Parse-AdoTestLog.ps1 -Path C:\Users\me\AppData\Local\Temp\1783-...-tool-output-x.txt

.EXAMPLE
    # Just get the clean lines to grep yourself:
    ./Parse-AdoTestLog.ps1 -Path <file> -Raw | Select-String 'Injected error'
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Path,
    [int]$Context = 25,
    [switch]$Raw
)

if (-not (Test-Path $Path)) { throw "File not found: $Path" }

$content = Get-Content $Path -Raw

# The MCP get_content output is a JSON array of strings. Fall back to line-split for plain logs.
$lines = $null
try {
    $parsed = $content | ConvertFrom-Json -ErrorAction Stop
    if ($parsed -is [System.Array]) { $lines = $parsed }
} catch { }
if ($null -eq $lines) { $lines = $content -split "`r?`n" }

# Strip ANSI color codes and the leading "<ISO-timestamp>Z " prefix ADO adds to every line.
$clean = $lines |
    ForEach-Object { $_ -replace '\u001b\[[0-9;]*m', '' -replace '^.*?Z ', '' }

if ($Raw) { $clean; return }

function Write-Section($title) {
    Write-Output ''
    Write-Output "==== $title ===="
}

# 1) Which report step(s) this log is (driver + compat version).
Write-Section 'Report step(s)'
$reportCmds = for ($i = 0; $i -lt $clean.Count; $i++) {
    if ($clean[$i] -match 'Starting: \[test\] (test:realsvc:[^ ]+.*)$') { $Matches[1].Trim() }
}
if ($reportCmds) { $reportCmds | ForEach-Object { "  $_" } } else { "  (no test:realsvc report step found in this log)" }

# 2) Mocha summary counts.
Write-Section 'Summary'
for ($i = 0; $i -lt $clean.Count; $i++) {
    if ($clean[$i] -match '^\s*\d+ (passing|failing|pending)') { "  {0}: {1}" -f ($i + 1), $clean[$i].Trim() }
}

# 3) npm return codes / task errors (infra signal).
Write-Section 'Task errors (infra signal)'
$infra = for ($i = 0; $i -lt $clean.Count; $i++) {
    if ($clean[$i] -match 'Npm failed with return code|##\[error\]|Process exit code: [1-9]') { "  {0}: {1}" -f ($i + 1), $clean[$i].Trim() }
}
if ($infra) { $infra } else { "  (none)" }

# 4) Numbered failure blocks with line numbers.
Write-Section 'Failure blocks'
$found = $false
for ($i = 0; $i -lt $clean.Count; $i++) {
    if ($clean[$i] -match '^\s*\d+ failing') {
        $found = $true
        $end = [Math]::Min($i + $Context, $clean.Count)
        for ($j = $i; $j -lt $end; $j++) { "  {0}: {1}" -f ($j + 1), $clean[$j] }
        break
    }
}
if (-not $found) { "  (no failing block — this leg/driver passed)" }

Write-Output ''
Write-Output "Line numbers above are 1-based and match the log's line index."
Write-Output "Build a direct link with:  .../builds/{ID}/logs/{LOG}?startLine={A}&endLine={B}"
