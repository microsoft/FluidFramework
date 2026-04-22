#!/usr/bin/env python3
"""Tests for pr_review_propose.py."""

from __future__ import annotations

import argparse
import io
import json
from pathlib import Path

import pytest

from pr_review_propose import (
    REVIEWERS,
    _ID_TO_LABEL,
    _LABEL_TO_ID,
    cmd_build_comment,
    cmd_build_qa_context,
    cmd_format_names,
    cmd_parse_checkboxes,
    get_selected,
)


# ── Module-level invariants ──────────────────────────────────────────────────


class TestReviewerRegistry:
    def test_every_reviewer_has_all_fields(self) -> None:
        for r in REVIEWERS:
            assert r.id
            assert r.label
            assert r.description

    def test_ids_are_unique(self) -> None:
        ids = [r.id for r in REVIEWERS]
        assert len(ids) == len(set(ids))

    def test_label_to_id_uses_lowercase_keys(self) -> None:
        for r in REVIEWERS:
            assert _LABEL_TO_ID[r.label.lower()] == r.id

    def test_api_compatibility_resolves_with_space(self) -> None:
        # The checkbox regex captures the literal bold text, so "API Compatibility"
        # lowercased ("api compatibility") must map back to the hyphenated ID.
        assert _LABEL_TO_ID["api compatibility"] == "api-compatibility"

    def test_id_to_label_covers_every_reviewer(self) -> None:
        for r in REVIEWERS:
            assert _ID_TO_LABEL[r.id] == r.label


# ── get_selected ─────────────────────────────────────────────────────────────


class TestGetSelected:
    def test_zero_selects_nothing(self) -> None:
        assert get_selected(0) == set()

    def test_count_below_registry_picks_priority_prefix(self) -> None:
        assert get_selected(2) == {REVIEWERS[0].id, REVIEWERS[1].id}

    def test_count_equal_to_registry_selects_all(self) -> None:
        assert get_selected(len(REVIEWERS)) == {r.id for r in REVIEWERS}

    def test_count_beyond_registry_is_capped_at_all(self) -> None:
        assert get_selected(len(REVIEWERS) + 5) == {r.id for r in REVIEWERS}


# ── build-comment ────────────────────────────────────────────────────────────


def _ns(**kwargs: object) -> argparse.Namespace:
    return argparse.Namespace(**kwargs)


class TestBuildComment:
    def test_includes_marker_and_metrics(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        cmd_build_comment(_ns(reviewer_count=3, lines=247, files=8))
        out = capsys.readouterr().out
        assert "<!-- pr-review-confirm -->" in out
        assert "247 lines" in out
        assert "8 files" in out

    def test_pre_checks_exactly_reviewer_count_boxes_in_priority_order(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        cmd_build_comment(_ns(reviewer_count=2, lines=10, files=1))
        out = capsys.readouterr().out
        # First two reviewers checked, rest unchecked.
        assert f"- [x] **{REVIEWERS[0].label}**" in out
        assert f"- [x] **{REVIEWERS[1].label}**" in out
        for r in REVIEWERS[2:]:
            assert f"- [ ] **{r.label}**" in out

    def test_count_zero_checks_nothing(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        cmd_build_comment(_ns(reviewer_count=0, lines=0, files=0))
        out = capsys.readouterr().out
        assert "[x]" not in out
        for r in REVIEWERS:
            assert f"- [ ] **{r.label}**" in out

    def test_count_beyond_registry_checks_all(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        cmd_build_comment(_ns(reviewer_count=len(REVIEWERS) + 2, lines=1000, files=50))
        out = capsys.readouterr().out
        assert "[ ]" not in out
        for r in REVIEWERS:
            assert f"- [x] **{r.label}**" in out

    def test_lists_all_reviewers_with_descriptions(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        cmd_build_comment(_ns(reviewer_count=3, lines=100, files=5))
        out = capsys.readouterr().out
        for r in REVIEWERS:
            assert r.label in out
            assert r.description in out


# ── parse-checkboxes ─────────────────────────────────────────────────────────


def _write_body(tmp_path: Path, body: str) -> Path:
    path = tmp_path / "body.txt"
    path.write_text(body)
    return path


class TestParseCheckboxes:
    def test_parses_checked_boxes(
        self, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        body = _write_body(
            tmp_path, "- [x] **Correctness** — desc\n- [ ] **Security** — desc\n"
        )
        cmd_parse_checkboxes(_ns(body_file=str(body)))
        assert json.loads(capsys.readouterr().out) == ["correctness"]

    def test_uppercase_x_also_counts_as_checked(
        self, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        body = _write_body(tmp_path, "- [X] **Security** — desc\n")
        cmd_parse_checkboxes(_ns(body_file=str(body)))
        assert json.loads(capsys.readouterr().out) == ["security"]

    def test_parses_api_compatibility_with_space(
        self, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        body = _write_body(tmp_path, "- [x] **API Compatibility** — desc\n")
        cmd_parse_checkboxes(_ns(body_file=str(body)))
        assert json.loads(capsys.readouterr().out) == ["api-compatibility"]

    def test_parses_all_five_reviewers(
        self, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        lines = [f"- [x] **{r.label}** — desc" for r in REVIEWERS]
        body = _write_body(tmp_path, "\n".join(lines))
        cmd_parse_checkboxes(_ns(body_file=str(body)))
        assert json.loads(capsys.readouterr().out) == [r.id for r in REVIEWERS]

    def test_deduplicates_repeated_entries(
        self, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        body = _write_body(
            tmp_path, "- [x] **Correctness** — a\n- [x] **Correctness** — b\n"
        )
        cmd_parse_checkboxes(_ns(body_file=str(body)))
        assert json.loads(capsys.readouterr().out) == ["correctness"]

    def test_preserves_order_of_first_occurrence(
        self, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        body = _write_body(
            tmp_path, "- [x] **Security** — a\n- [x] **Correctness** — b\n"
        )
        cmd_parse_checkboxes(_ns(body_file=str(body)))
        assert json.loads(capsys.readouterr().out) == ["security", "correctness"]

    def test_ignores_unchecked(
        self, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        body = _write_body(
            tmp_path, "- [ ] **Correctness** — desc\n- [ ] **Security** — desc\n"
        )
        cmd_parse_checkboxes(_ns(body_file=str(body)))
        assert json.loads(capsys.readouterr().out) == []

    def test_ignores_unknown_labels(
        self, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        body = _write_body(
            tmp_path, "- [x] **Unknown** — desc\n- [x] **Correctness** — desc\n"
        )
        cmd_parse_checkboxes(_ns(body_file=str(body)))
        assert json.loads(capsys.readouterr().out) == ["correctness"]

    def test_empty_body_returns_empty(
        self, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        body = _write_body(tmp_path, "")
        cmd_parse_checkboxes(_ns(body_file=str(body)))
        assert json.loads(capsys.readouterr().out) == []

    def test_reads_from_stdin_when_path_is_dash(
        self,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        monkeypatch.setattr("sys.stdin", io.StringIO("- [x] **Testing** — desc\n"))
        cmd_parse_checkboxes(_ns(body_file="-"))
        assert json.loads(capsys.readouterr().out) == ["testing"]


# ── format-names ─────────────────────────────────────────────────────────────


class TestFormatNames:
    def test_single_id(self, capsys: pytest.CaptureFixture[str]) -> None:
        cmd_format_names(_ns(reviewers_json=json.dumps(["correctness"])))
        assert capsys.readouterr().out.strip() == "Correctness"

    def test_multiple_ids_comma_separated_preserving_order(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        cmd_format_names(_ns(reviewers_json=json.dumps(["security", "correctness"])))
        assert capsys.readouterr().out.strip() == "Security, Correctness"

    def test_api_compatibility_renders_with_space(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        cmd_format_names(_ns(reviewers_json=json.dumps(["api-compatibility"])))
        assert capsys.readouterr().out.strip() == "API Compatibility"

    def test_empty_array_prints_empty_line(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        cmd_format_names(_ns(reviewers_json="[]"))
        assert capsys.readouterr().out.strip() == ""

    def test_unknown_id_passes_through(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        cmd_format_names(_ns(reviewers_json=json.dumps(["unknown-reviewer"])))
        assert capsys.readouterr().out.strip() == "unknown-reviewer"


# ── build-qa-context ─────────────────────────────────────────────────────────


class TestBuildQAContext:
    def test_selected_marked_with_check(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        cmd_build_qa_context(_ns(selected_json=json.dumps(["correctness", "security"])))
        out = capsys.readouterr().out
        assert "✓ Correctness" in out
        assert "✓ Security" in out

    def test_unselected_marked_with_circle(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        cmd_build_qa_context(_ns(selected_json=json.dumps(["correctness"])))
        out = capsys.readouterr().out
        assert "○ Security" in out
        assert "○ Performance" in out
        assert "○ Testing" in out

    def test_empty_selected_marks_all_unselected(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        cmd_build_qa_context(_ns(selected_json="[]"))
        out = capsys.readouterr().out
        assert "✓" not in out
        for r in REVIEWERS:
            assert f"○ {r.label}" in out

    def test_full_selected_marks_all_checked(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        cmd_build_qa_context(_ns(selected_json=json.dumps([r.id for r in REVIEWERS])))
        out = capsys.readouterr().out
        assert "○" not in out
        for r in REVIEWERS:
            assert f"✓ {r.label}" in out

    def test_includes_reviewer_descriptions(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        cmd_build_qa_context(_ns(selected_json="[]"))
        out = capsys.readouterr().out
        for r in REVIEWERS:
            assert r.description in out


# ── CLI wiring ───────────────────────────────────────────────────────────────
# These tests round-trip through `main()` so a bug in `_build_parser`'s
# `set_defaults(func=...)` wiring (e.g., a subcommand pointing at the wrong
# handler) would surface here, where unit tests on `cmd_*` directly cannot
# catch it.


class TestCLI:
    def test_build_comment_via_cli(
        self,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        from pr_review_propose import main

        monkeypatch.setattr(
            "sys.argv",
            [
                "pr_review_propose.py",
                "build-comment",
                "--reviewer-count",
                "3",
                "--lines",
                "120",
                "--files",
                "4",
            ],
        )
        main()
        out = capsys.readouterr().out
        assert "<!-- pr-review-confirm -->" in out
        assert "120 lines, 4 files" in out
        # 3 boxes checked, the rest unchecked
        assert out.count("- [x]") == 3
        assert out.count("- [ ]") == len(REVIEWERS) - 3

    def test_parse_checkboxes_via_cli(
        self,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
        tmp_path: Path,
    ) -> None:
        from pr_review_propose import main

        body = tmp_path / "body.md"
        body.write_text("- [x] **Correctness** — foo\n- [ ] **Security** — bar\n")
        monkeypatch.setattr(
            "sys.argv", ["pr_review_propose.py", "parse-checkboxes", str(body)]
        )
        main()
        out = capsys.readouterr().out.strip()
        assert json.loads(out) == ["correctness"]

    def test_format_names_via_cli(
        self,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        from pr_review_propose import main

        monkeypatch.setattr(
            "sys.argv",
            [
                "pr_review_propose.py",
                "format-names",
                json.dumps(["correctness", "security"]),
            ],
        )
        main()
        out = capsys.readouterr().out.strip()
        assert out == "Correctness, Security"

    def test_build_qa_context_via_cli(
        self,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        from pr_review_propose import main

        monkeypatch.setattr(
            "sys.argv",
            [
                "pr_review_propose.py",
                "build-qa-context",
                json.dumps(["correctness"]),
            ],
        )
        main()
        out = capsys.readouterr().out
        assert "✓ Correctness" in out
        assert "○ Security" in out
