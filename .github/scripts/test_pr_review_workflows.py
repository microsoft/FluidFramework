"""Offline regression tests for PR review workflow sizing and permissions."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
BASH = shutil.which("bash")


def bash(script: str, *args: str, **kwargs: object) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        [BASH, "-eo", "pipefail", "-c", script, "tooling-test", *args],
        check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kwargs,
    )


@pytest.mark.skipif(BASH is None, reason="Bash is required")
@pytest.mark.parametrize(("lines", "files", "packages", "count"), [
    (0, 0, 0, 1), (100, 5, 1, 1), (101, 5, 1, 3),
    (100, 6, 1, 3), (100, 5, 2, 3), (500, 30, 5, 3),
    (501, 1, 1, 5), (1, 31, 1, 5), (1, 1, 6, 5),
])
def test_fleet_thresholds(
    lines: int, files: int, packages: int, count: int, tmp_path: Path
) -> None:
    workflow = yaml.safe_load(
        (ROOT / ".github/workflows/pr-review-auto-route.yml").read_text(encoding="utf-8")
    )
    step = next(step for step in workflow["jobs"]["route"]["steps"] if step.get("id") == "size")
    output = tmp_path / "output"
    bash(step["run"], env={
        **os.environ, "LINES": str(lines), "FILES": str(files), "PACKAGES": str(packages),
        "GITHUB_OUTPUT": output.as_posix(),
    })
    assert output.read_text().strip() == f"reviewer_count={count}"


def test_fleet_reviewer_permission_boundary() -> None:
    workflow = yaml.safe_load(
        (ROOT / ".github/workflows/pr-review-fleet.yml").read_text(encoding="utf-8")
    )
    step = next(
        step for step in workflow["jobs"]["review"]["steps"]
        if step.get("name") == "Run reviewer"
    )
    assert set(step["env"]) == {"COPILOT_GITHUB_TOKEN", "COPILOT_MODEL", "PROMPT_FILE"}
    for flag in [
        "--no-custom-instructions", "--disable-builtin-mcps",
        "--allow-tool=read", "--allow-tool=write",
        "--deny-tool=shell", "--deny-tool=url", "--no-ask-user",
    ]:
        assert flag in step["run"]
    assert "--allow-all" not in step["run"]
