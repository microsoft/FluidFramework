#!/usr/bin/env python3
"""Tests for consolidate_reviews.py."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from consolidate_reviews import (
    MARKER,
    Finding,
    _sanitize_cell,
    build_report,
    deduplicate,
    determine_verdict,
    main,
    parse_review_file,
    severity_labels_for_pr,
)


class TestParseReviewFile:
    def test_parses_findings(self, tmp_path: Path) -> None:
        review = tmp_path / "review-correctness.json"
        review.write_text(json.dumps({"findings": [
            {"severity": "HIGH", "location": "src/core/tree.ts:142", "description": "getNode() returns undefined", "fix": "Add undefined check"},
            {"severity": "MEDIUM", "location": "src/core/tree.ts:200", "description": "Off-by-one in loop", "fix": "Use < instead of <="},
        ]}))
        findings = parse_review_file(review, "Correctness")
        assert len(findings) == 2
        assert findings[0].severity == "HIGH"
        assert findings[0].location == "src/core/tree.ts:142"
        assert findings[0].area == "Correctness"
        assert "getNode()" in findings[0].description
        assert "undefined check" in findings[0].fix

    def test_empty_findings_returns_empty(self, tmp_path: Path) -> None:
        review = tmp_path / "review-security.json"
        review.write_text(json.dumps({"findings": []}))
        findings = parse_review_file(review, "Security")
        assert findings == []

    def test_skips_invalid_severity(self, tmp_path: Path) -> None:
        review = tmp_path / "review-correctness.json"
        review.write_text(json.dumps({"findings": [
            {"severity": "LOW", "location": "src/foo.ts:10", "description": "desc", "fix": "fix"},
            {"severity": "HIGH", "location": "src/foo.ts:20", "description": "real bug", "fix": "real fix"},
        ]}))
        findings = parse_review_file(review, "Correctness")
        assert len(findings) == 1
        assert findings[0].location == "src/foo.ts:20"

    def test_handles_malformed_json(self, tmp_path: Path) -> None:
        review = tmp_path / "review-correctness.json"
        review.write_text("this is not json")
        assert parse_review_file(review, "Correctness") is None

    def test_handles_non_object_json(self, tmp_path: Path) -> None:
        review = tmp_path / "review-correctness.json"
        review.write_text("[]")
        assert parse_review_file(review, "Correctness") is None

    def test_skips_non_dict_finding_items(self, tmp_path: Path) -> None:
        review = tmp_path / "review-correctness.json"
        review.write_text(json.dumps({"findings": [
            "not a dict",
            {"severity": "HIGH", "location": "src/foo.ts:10", "description": "real", "fix": "fix it"},
        ]}))
        findings = parse_review_file(review, "Correctness")
        assert len(findings) == 1
        assert findings[0].location == "src/foo.ts:10"

    def test_null_findings_key_returns_empty(self, tmp_path: Path) -> None:
        review = tmp_path / "review-correctness.json"
        review.write_text(json.dumps({"findings": None}))
        findings = parse_review_file(review, "Correctness")
        assert findings == []

    def test_skips_finding_with_empty_required_field(self, tmp_path: Path) -> None:
        review = tmp_path / "review-correctness.json"
        review.write_text(json.dumps({"findings": [
            {"severity": "HIGH", "location": "", "description": "desc", "fix": "fix"},
            {"severity": "HIGH", "location": "src/foo.ts:10", "description": "desc", "fix": "fix"},
        ]}))
        findings = parse_review_file(review, "Correctness")
        assert len(findings) == 1
        assert findings[0].location == "src/foo.ts:10"

    def test_preserves_full_fix_text(self, tmp_path: Path) -> None:
        long_fix = "x" * 300
        review = tmp_path / "review-correctness.json"
        review.write_text(json.dumps({"findings": [
            {"severity": "HIGH", "location": "src/foo.ts:1", "description": "desc", "fix": long_fix},
        ]}))
        findings = parse_review_file(review, "Correctness")
        assert findings[0].fix == long_fix


class TestDeduplicate:
    def test_keeps_highest_severity(self) -> None:
        findings = [
            Finding("CRITICAL", "src/a.ts:10", "desc1", "fix1", "Security"),
            Finding("HIGH", "src/a.ts:10", "desc2", "fix2", "Correctness"),
        ]
        result = deduplicate(findings)
        assert len(result) == 1
        assert result[0].severity == "CRITICAL"

    def test_keeps_findings_without_location(self) -> None:
        findings = [
            Finding("HIGH", "general-concern", "desc1", "fix1", "Testing"),
            Finding("MEDIUM", "another-concern", "desc2", "fix2", "Testing"),
        ]
        result = deduplicate(findings)
        assert len(result) == 2

    def test_different_locations_kept(self) -> None:
        findings = [
            Finding("HIGH", "src/a.ts:10", "desc1", "fix1", "Correctness"),
            Finding("HIGH", "src/b.ts:20", "desc2", "fix2", "Correctness"),
        ]
        result = deduplicate(findings)
        assert len(result) == 2


class TestSanitizeCell:
    def test_escapes_pipes(self) -> None:
        assert _sanitize_cell("a | b") == "a \\| b"

    def test_collapses_newlines(self) -> None:
        assert _sanitize_cell("line1\nline2") == "line1 line2"

    def test_collapses_crlf(self) -> None:
        assert _sanitize_cell("line1\r\nline2") == "line1 line2"

    def test_collapses_bare_cr(self) -> None:
        assert _sanitize_cell("line1\rline2") == "line1 line2"

    def test_plain_text_unchanged(self) -> None:
        assert _sanitize_cell("no special chars") == "no special chars"


class TestDetermineVerdict:
    def test_critical_means_request_changes(self) -> None:
        findings = [Finding("CRITICAL", "src/a.ts:10", "d", "f", "Security")]
        text, emoji = determine_verdict(findings)
        assert text == "Request Changes"
        assert emoji == "❌"

    def test_high_in_promoted_area_means_request_changes(self) -> None:
        findings = [Finding("HIGH", "src/a.ts:10", "d", "f", "Correctness")]
        text, _ = determine_verdict(findings)
        assert text == "Request Changes"

    def test_high_in_api_compat_means_request_changes(self) -> None:
        findings = [Finding("HIGH", "src/a.ts:10", "d", "f", "API Compat")]
        text, _ = determine_verdict(findings)
        assert text == "Request Changes"

    def test_high_in_non_promoted_area_means_approve_with_suggestions(self) -> None:
        findings = [Finding("HIGH", "src/a.ts:10", "d", "f", "Performance")]
        text, emoji = determine_verdict(findings)
        assert text == "Approve with Suggestions"
        assert emoji == "⚠️"

    def test_three_high_in_non_promoted_means_request_changes(self) -> None:
        findings = [
            Finding("HIGH", "src/a.ts:10", "d", "f", "Performance"),
            Finding("HIGH", "src/b.ts:20", "d", "f", "Testing"),
            Finding("HIGH", "src/c.ts:30", "d", "f", "Performance"),
        ]
        text, _ = determine_verdict(findings)
        assert text == "Request Changes"

    def test_medium_only_means_approve_with_suggestions(self) -> None:
        findings = [Finding("MEDIUM", "src/a.ts:10", "d", "f", "Testing")]
        text, emoji = determine_verdict(findings)
        assert text == "Approve with Suggestions"
        assert emoji == "⚠️"

    def test_zero_means_approve(self) -> None:
        text, emoji = determine_verdict([])
        assert text == "Approve"
        assert emoji == "✔️"


class TestBuildReport:
    def test_contains_marker(self) -> None:
        findings = [Finding("HIGH", "src/a.ts:10", "desc", "fix", "Correctness")]
        report = build_report(findings, "https://example.com/run/1")
        assert report.startswith(MARKER)

    def test_contains_findings_table(self) -> None:
        findings = [
            Finding("CRITICAL", "src/a.ts:10", "critical bug", "fix it", "Security"),
            Finding("MEDIUM", "src/b.ts:20", "minor issue", "tweak it", "Testing"),
        ]
        pr_number = 27071
        critical_title = severity_labels_for_pr(pr_number)["CRITICAL"]["title"]
        high_title = severity_labels_for_pr(pr_number)["HIGH"]["title"]
        medium_title = severity_labels_for_pr(pr_number)["MEDIUM"]["title"]
        report = build_report(findings, "https://example.com/run/1", pr_number=pr_number)
        assert f"1 {critical_title}, 0 {high_title}, 1 {medium_title}" in report
        assert "critical bug" in report
        assert "minor issue" in report
        assert "Request Changes" in report

    def test_severity_labels_numbered_per_type(self) -> None:
        findings = [
            Finding("HIGH", "src/a.ts:10", "first", "fix1", "Correctness"),
            Finding("HIGH", "src/b.ts:20", "second", "fix2", "Security"),
        ]
        report = build_report(findings, "https://example.com/run/1")
        assert "H1" in report
        assert "H2" in report

    def test_uses_pr_hashed_emoji_set(self) -> None:
        findings = [Finding("CRITICAL", "src/a.ts:10", "desc", "fix", "Security")]
        level = severity_labels_for_pr(27071)["CRITICAL"]
        report = build_report(findings, "https://example.com/run/1", pr_number=27071)
        assert f"| {level['emoji']} {level['title']} | C1 |" in report

    def test_same_pr_number_yields_same_emoji_set(self) -> None:
        assert severity_labels_for_pr(12345) == severity_labels_for_pr(12345)

    def test_commit_count_is_deterministic(self) -> None:
        assert severity_labels_for_pr(42, commit_count=7) == severity_labels_for_pr(42, commit_count=7)

    def test_commit_count_affects_selection(self) -> None:
        """Commit count must actually change the hash input, not be silently ignored."""
        for pr in range(1, 200):
            labels_without_commit_count = severity_labels_for_pr(pr)
            for cc in range(1, 10):
                if labels_without_commit_count != severity_labels_for_pr(pr, commit_count=cc):
                    return
        pytest.fail("Could not find PR/commit combination that changes emoji set")

    def test_summary_uses_selected_set_titles(self) -> None:
        findings = [Finding("CRITICAL", "src/a.ts:10", "desc", "fix", "Security")]
        critical_title = severity_labels_for_pr(27071)["CRITICAL"]["title"]
        report = build_report(findings, "https://example.com/run/1", pr_number=27071)
        assert f"1 {critical_title}" in report

    def test_sanitizes_pipes_and_newlines_in_table_cells(self) -> None:
        findings = [Finding("HIGH", "src/a.ts:10", "desc with | pipe", "fix\nwith newline", "Correctness")]
        report = build_report(findings, "https://example.com/run/1")
        assert "desc with \\| pipe" in report
        assert "fix\nwith newline" not in report
        assert "fix with newline" in report


class TestMain:
    def test_no_findings_exits_2(self, tmp_path: Path) -> None:
        review = tmp_path / "review-correctness.json"
        review.write_text(json.dumps({"findings": []}))
        output = tmp_path / "report.md"
        result = main([str(tmp_path), "https://example.com/run/1", "-o", str(output)])
        assert result == 2
        assert not output.exists()

    def test_findings_exits_0(self, tmp_path: Path) -> None:
        review = tmp_path / "review-correctness.json"
        review.write_text(json.dumps({"findings": [
            {"severity": "HIGH", "location": "src/foo.ts:10", "description": "Bug", "fix": "Fix it"},
        ]}))
        output = tmp_path / "report.md"
        result = main([str(tmp_path), "https://example.com/run/1", "-o", str(output)])
        assert result == 0
        assert output.exists()
        content = output.read_text()
        assert MARKER in content
        assert "Bug" in content

    def test_deduplicates_across_reviewers(self, tmp_path: Path) -> None:
        (tmp_path / "review-correctness.json").write_text(json.dumps({"findings": [
            {"severity": "HIGH", "location": "src/foo.ts:10", "description": "Bug from correctness", "fix": "Fix A"},
        ]}))
        (tmp_path / "review-security.json").write_text(json.dumps({"findings": [
            {"severity": "CRITICAL", "location": "src/foo.ts:10", "description": "Same spot from security", "fix": "Fix B"},
        ]}))
        output = tmp_path / "report.md"
        result = main([str(tmp_path), "https://example.com/run/1", "-o", str(output)])
        assert result == 0
        content = output.read_text()
        # CRITICAL should win (sorted first), HIGH de-duped away
        assert "Same spot from security" in content
        assert "Bug from correctness" not in content

    def test_commit_count_arg_accepted(self, tmp_path: Path) -> None:
        (tmp_path / "review-correctness.json").write_text(json.dumps({"findings": [
            {"severity": "HIGH", "location": "src/foo.ts:10", "description": "Bug", "fix": "Fix it"},
        ]}))
        output = tmp_path / "report.md"
        result = main([str(tmp_path), "https://example.com/run/1", "--pr-number", "123", "--commit-count", "5", "-o", str(output)])
        assert result == 0
        assert output.exists()

    def test_invalid_reviewer_output_does_not_count_as_clean(self, tmp_path: Path) -> None:
        # Invalid JSON from one reviewer should not suppress findings from another
        (tmp_path / "review-correctness.json").write_text("not json")
        (tmp_path / "review-security.json").write_text(json.dumps({"findings": [
            {"severity": "HIGH", "location": "src/foo.ts:10", "description": "Bug", "fix": "Fix it"},
        ]}))
        output = tmp_path / "report.md"
        result = main([str(tmp_path), "https://example.com/run/1", "-o", str(output)])
        assert result == 0
        assert output.exists()
        assert "Bug" in output.read_text()

    def test_all_skipped_exits_1_not_2(self, tmp_path: Path) -> None:
        # All files present but all invalid — must not look like a clean run
        for reviewer in ["correctness", "security", "performance", "testing", "api-compatibility"]:
            (tmp_path / f"review-{reviewer}.json").write_text("not json")
        output = tmp_path / "report.md"
        result = main([str(tmp_path), "https://example.com/run/1", "-o", str(output)])
        assert result == 1
        assert not output.exists()

    def test_missing_review_files_skipped(self, tmp_path: Path) -> None:
        # Only one reviewer has output
        (tmp_path / "review-performance.json").write_text(json.dumps({"findings": [
            {"severity": "MEDIUM", "location": "src/hot.ts:50", "description": "O(n^2) loop", "fix": "Use a Map"},
        ]}))
        output = tmp_path / "report.md"
        result = main([str(tmp_path), "https://example.com/run/1", "-o", str(output)])
        assert result == 0
        content = output.read_text()
        assert "O(n^2)" in content
