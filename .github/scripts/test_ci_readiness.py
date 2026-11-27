"""Offline regression checks for CI readiness detection and build recovery."""

from __future__ import annotations

import json
import os
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


@pytest.mark.parametrize("file_count", [1, 600])
def test_ci_readiness_deleted_files_and_large_previews(
    file_count: int, tmp_path: Path
) -> None:
    def git(*args: str) -> None:
        subprocess.run(
            ["git", "-c", f"core.hooksPath={tmp_path / 'no-hooks'}", *args],
            cwd=tmp_path, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )

    git("init", "-q", "-b", "main")
    git("config", "core.longpaths", "true")
    git("config", "user.name", "Tooling Tests")
    git("config", "user.email", "tooling-tests@example.invalid")
    (tmp_path / "pnpm-workspace.yaml").write_text("packages: []\n", encoding="utf-8")
    (tmp_path / "fluidBuild.config.cjs").write_text(
        'module.exports = { repoPackages: { client: { directory: "" } } };\n',
        encoding="utf-8",
    )
    package = tmp_path / "packages/fixture"
    package.mkdir(parents=True)
    (package / "package.json").write_text('{"name":"fixture"}', encoding="utf-8")
    (tmp_path / "node_modules").mkdir()
    files = [package / f"{'x' * 120}{index:04}.ts" for index in range(file_count)]
    for path in files:
        path.write_text("export {};\n", encoding="utf-8")
    git("add", ".")
    git("-c", "commit.gpgsign=false", "commit", "-qm", "fixture")
    for path in files:
        path.unlink()
    calls = tmp_path / "pnpm-calls"
    result = bash(
        'pnpm() { printf "%s\\n" "$*" >> "$CALLS"; }; '
        'export -f pnpm; bash "$1" main',
        (ROOT / ".github/skills/ci-readiness-check/ci-readiness-check.sh").as_posix(),
        cwd=tmp_path, env={**os.environ, "CALLS": calls.as_posix()},
    )
    assert "Changed packages (1)" in result.stdout.decode("utf-8")
    commands = calls.read_text()
    assert "exec fluid-build --help\n" in commands
    assert "install --frozen-lockfile" not in commands
    assert "exec fluid-build --task checks:fix packages/fixture" in commands
    assert "exec fluid-build --task checks packages/fixture" in commands
    if file_count > 20:
        assert f"... and {file_count - 20} more files" in result.stdout.decode("utf-8")


@pytest.mark.parametrize("failure", ["none", "install", "scheduled", "independent", "missing-script"])
def test_ci_readiness_workspace_routing_and_partial_install(
    failure: str, tmp_path: Path
) -> None:
    def git(*args: str) -> None:
        subprocess.run(
            ["git", "-c", f"core.hooksPath={tmp_path / 'no-hooks'}", *args],
            cwd=tmp_path, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )

    git("init", "-q", "-b", "main")
    git("config", "user.name", "Tooling Tests")
    git("config", "user.email", "tooling-tests@example.invalid")
    (tmp_path / "pnpm-workspace.yaml").write_text("packages: []\n", encoding="utf-8")
    (tmp_path / "fluidBuild.config.cjs").write_text(
        'module.exports = { repoPackages: { client: { directory: "" } } };\n',
        encoding="utf-8",
    )
    scheduled = tmp_path / "packages/fixture"
    independent = tmp_path / "docs with spaces"
    for package in [scheduled, independent]:
        package.mkdir(parents=True)
        (package / "node_modules").mkdir()
        (package / "package.json").write_text(json.dumps({
            "name": package.name, "scripts": (
                {} if failure == "missing-script" else {"lint:fix": "fix", "lint": "check"}
            ),
        }), encoding="utf-8")
        (package / "file.md").write_text("before\n", encoding="utf-8")
    (independent / "pnpm-workspace.yaml").write_text("packages: ['.']\n", encoding="utf-8")
    # A leftover directory alone must not count as a successful installation.
    (tmp_path / "node_modules").mkdir()
    git("add", ".")
    git("-c", "commit.gpgsign=false", "commit", "-qm", "fixture")
    for package in [scheduled, independent]:
        (package / "file.md").write_text("after\n", encoding="utf-8")
    calls = tmp_path / "pnpm-calls"
    marker = tmp_path / "installed"
    script = r'''
pnpm() {
    printf "%s|%s\n" "$PWD" "$*" >> "$CALLS"
    case "$*" in
        "exec fluid-build --help") [ -f "$MARKER" ];;
        "install --frozen-lockfile")
            [ "$FAILURE" != install ] || return 1
            touch "$MARKER";;
        "exec fluid-build --task checks"*)
            [ "$FAILURE" != scheduled ];;
        "run lint"*) [ "$FAILURE" != independent ];;
    esac
}
export -f pnpm
bash "$1" main
'''
    args = [
        BASH, "-eo", "pipefail", "-c", script, "tooling-test",
        (ROOT / ".github/skills/ci-readiness-check/ci-readiness-check.sh").as_posix(),
    ]
    result = subprocess.run(
        args, cwd=tmp_path, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env={
            **os.environ, "CALLS": calls.as_posix(), "MARKER": marker.as_posix(),
            "FAILURE": failure,
        },
    )
    assert result.returncode == (0 if failure == "none" else 1), result.stderr.decode("utf-8")
    commands = calls.read_text()
    assert "|exec fluid-build --help\n" in commands
    assert "|install --frozen-lockfile" in commands
    if failure == "install":
        assert "--task" not in commands
        return
    assert marker.exists()
    assert "|exec fluid-build --task checks:fix packages/fixture\n" in commands
    assert "|exec fluid-build --task checks packages/fixture\n" in commands
    assert "--task checks docs with spaces" not in commands
    if failure == "missing-script":
        assert "No checks:fix or lint:fix script" in result.stderr.decode("utf-8")
    else:
        assert "/docs with spaces|run lint:fix\n" in commands.replace("\\", "/")
        assert "/docs with spaces|run lint\n" in commands.replace("\\", "/")
