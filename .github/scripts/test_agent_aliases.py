"""Offline checks for Copilot launcher arguments and installation failures."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
BASH = shutil.which("bash")
pytestmark = pytest.mark.skipif(BASH is None, reason="Bash is required")


def bash(script: str, *args: str, **kwargs: object) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        [BASH, "-eo", "pipefail", "-c", script, "tooling-test", *args],
        check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kwargs,
    )


@pytest.mark.parametrize(("alias", "args", "expected"), [
    ("dev", [], [
        "copilot", "--profile", "nori", "--mcp", "ado --org fluidframework",
        "--mcp", "workiq", "--mcp", "enghub", "--", "-i", "/yolo auto",
    ]),
    ("dev", ["--", "--model", "user-model"], [
        "copilot", "--profile", "nori", "--mcp", "ado --org fluidframework",
        "--mcp", "workiq", "--mcp", "enghub",
        "--", "-i", "/yolo auto", "--model", "user-model",
    ]),
    ("dev", ["--mcp", "server with spaces", "--", "--model", "user-model"], [
        "copilot", "--profile", "nori", "--mcp", "ado --org fluidframework",
        "--mcp", "workiq", "--mcp", "enghub", "--mcp", "server with spaces",
        "--", "-i", "/yolo auto", "--model", "user-model",
    ]),
    ("copilot", ["--", "--model", "user-model"], [
        "copilot", "--", "--model", "user-model",
    ]),
    ("oce", [], [
        "copilot", "--profile", "ff-oce", "--", "--agent", "ff-oce:ff-oce",
        "-i", "/yolo auto",
    ]),
    ("oce", ["--mcp", "server with spaces", "--", "--model", "user-model"], [
        "copilot", "--profile", "ff-oce", "--mcp", "server with spaces",
        "--", "--agent", "ff-oce:ff-oce", "-i", "/yolo auto", "--model", "user-model",
    ]),
])
def test_alias_arguments(alias: str, args: list[str], expected: list[str]) -> None:
    result = bash(
        'source "$1"; _ensure_agency() { :; }; '
        'agency() { printf "%s\\0" "$@"; }; "$2" "${@:3}"',
        (ROOT / "scripts/codespace-setup/agent-aliases.sh").as_posix(), alias, *args,
    )
    assert result.stdout.decode("utf-8").split("\0")[:-1] == expected


@pytest.mark.parametrize("alias", ["dev", "oce"])
def test_alias_install_failure_stops_launch(alias: str) -> None:
    result = bash(
        'source "$1"; _ensure_agency() { return 7; }; '
        'agency() { echo "unexpected launch"; }; "$2" || result=$?; '
        '[ "$result" = 1 ]',
        (ROOT / "scripts/codespace-setup/agent-aliases.sh").as_posix(), alias,
    )
    assert not result.stdout
