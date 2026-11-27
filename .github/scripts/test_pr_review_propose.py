#!/usr/bin/env python3
"""Tests for the current PR review proposal and confirmation flow."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import pytest

from pr_review_propose import (
    REVIEWERS,
    _ID_TO_LABEL,
    _LABEL_TO_ID,
    cmd_build_comment,
    diff_metrics,
    get_selected,
    is_start_checked,
    main,
    parse_checked_ids,
)


def test_reviewer_registry() -> None:
    assert len({reviewer.id for reviewer in REVIEWERS}) == len(REVIEWERS)
    for reviewer in REVIEWERS:
        assert reviewer.id and reviewer.label and reviewer.description
        assert _ID_TO_LABEL[reviewer.id] == reviewer.label
        assert _LABEL_TO_ID[reviewer.label.lower()] == reviewer.id
    assert _LABEL_TO_ID["api compatibility"] == "api-compatibility"


@pytest.mark.parametrize("count", [0, 1, 3, 5, 6, 20])
def test_default_selection(count: int) -> None:
    assert get_selected(count) == {reviewer.id for reviewer in REVIEWERS[:count]}


@pytest.mark.parametrize("count", [0, 1, 3, 5, 6, 20])
def test_build_comment(count: int, capsys: pytest.CaptureFixture[str]) -> None:
    cmd_build_comment(argparse.Namespace(
        reviewer_count=count, lines=247, files=8, from_existing_body=None
    ))
    body = capsys.readouterr().out
    assert "<!-- pr-review-confirm -->" in body
    assert "247 lines, 8 files" in body
    assert parse_checked_ids(body) == [reviewer.id for reviewer in REVIEWERS[:count]]
    assert "- [ ] **Start review**" in body
    assert not is_start_checked(body)
    for reviewer in REVIEWERS:
        assert reviewer.description in body


@pytest.mark.parametrize("prior", [
    "- [x] **Documentation / Developer Experience**\n- [x] **Start review**",
    "- [ ] **Correctness**\n- [ ] **Security**",
])
def test_preserves_prior_selection_and_resets_start(
    prior: str, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    path = tmp_path / "prior.md"
    path.write_text(prior, encoding="utf-8")
    cmd_build_comment(argparse.Namespace(
        reviewer_count=3, lines=1, files=1, from_existing_body=str(path)
    ))
    body = capsys.readouterr().out
    assert parse_checked_ids(body) == parse_checked_ids(prior)
    assert not is_start_checked(body)


def test_missing_prior_uses_default(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    cmd_build_comment(argparse.Namespace(
        reviewer_count=1, lines=1, files=1,
        from_existing_body=str(tmp_path / "missing.md"),
    ))
    assert parse_checked_ids(capsys.readouterr().out) == ["correctness"]


@pytest.mark.parametrize(("body", "expected"), [
    ("", []),
    ("- [ ] **Correctness**", []),
    ("- [x] **Unknown**", []),
    ("- [X] **Security**", ["security"]),
    ("- [x] **API Compatibility**", ["api-compatibility"]),
    ("- [x] **Correctness**\n- [x] **Correctness**", ["correctness"]),
    ("- [x] **Security**\n- [x] **Correctness**", ["security", "correctness"]),
])
def test_parse_checked_ids(body: str, expected: list[str]) -> None:
    assert parse_checked_ids(body) == expected


@pytest.mark.parametrize(("body", "expected"), [
    ("", False),
    ("- [ ] **Start review**", False),
    ("- [x] **Start review**", True),
    ("- [X] **Start review**", True),
    ("- [x] **Correctness**", False),
])
def test_start_checkbox(body: str, expected: bool) -> None:
    assert is_start_checked(body) == expected


@pytest.mark.parametrize(("args", "expected"), [
    (["parse-checkboxes"], '["security"]'),
    (["is-start-checked"], "true"),
    (["reset-start"], "- [x] **Security**\n- [ ] **Start review**"),
])
def test_confirmation_cli(
    args: list[str], expected: str, tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str],
) -> None:
    path = tmp_path / "body.md"
    path.write_text("- [x] **Security**\n- [X] **Start review**", encoding="utf-8")
    monkeypatch.setattr("sys.argv", ["pr_review_propose.py", *args, str(path)])
    main()
    assert capsys.readouterr().out.strip() == expected


def test_build_comment_cli(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr("sys.argv", [
        "pr_review_propose.py", "build-comment",
        "--reviewer-count", "3", "--lines", "120", "--files", "4",
    ])
    main()
    body = capsys.readouterr().out
    assert "120 lines, 4 files" in body
    assert body.count("- [x]") == 3
    assert body.count("- [ ]") == len(REVIEWERS) - 3 + 1


def test_format_names_cli(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr("sys.argv", [
        "pr_review_propose.py", "format-names", '["correctness", "security"]',
    ])
    main()
    assert capsys.readouterr().out.strip() == "Correctness, Security"


@pytest.mark.parametrize(("numstat", "expected"), [
    (b"", {"lines": 0, "files": 0, "packages": 0}),
    (b"1\t2\tdocs/guide.md\0", {"lines": 3, "files": 1, "packages": 0}),
    (b"-\t-\tdocs/image.png\0", {"lines": 0, "files": 1, "packages": 0}),
    (b"1\t0\tpackages/dds/a.ts\0" b"0\t2\tpackages/dds/b.ts\0",
     {"lines": 3, "files": 2, "packages": 1}),
    (b"1\t2\tpackages/dds/a \t\nb.ts\0" b"1\t0\texamples/dds/c.ts\0",
     {"lines": 4, "files": 2, "packages": 2}),
    (b"0\t0\t\0packages/dds/old.ts\0examples/foo/new.ts\0",
     {"lines": 0, "files": 1, "packages": 2}),
])
def test_diff_metrics(numstat: bytes, expected: dict[str, int]) -> None:
    assert diff_metrics(numstat) == expected


@pytest.mark.parametrize("numstat", [b"bad\0", b"1\t2\t\0", b"x\t2\ta.ts\0"])
def test_invalid_numstat_fails(numstat: bytes) -> None:
    with pytest.raises((ValueError, StopIteration)):
        diff_metrics(numstat)


def test_metrics_cli_with_git_diff(tmp_path: Path) -> None:
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    for name in ["docs/guide.md", "packages/dds/a file.ts"]:
        path = tmp_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("first\nsecond\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(tmp_path), "add", "."], check=True)
    numstat = subprocess.check_output(
        ["git", "-C", str(tmp_path), "diff", "--cached", "--numstat", "-z"]
    )
    path = tmp_path / "numstat.bin"
    path.write_bytes(numstat)
    result = subprocess.check_output([
        sys.executable, str(Path(__file__).with_name("pr_review_propose.py")),
        "metrics", str(path),
    ], text=True, encoding="utf-8")
    assert json.loads(result) == {"lines": 4, "files": 2, "packages": 1}
