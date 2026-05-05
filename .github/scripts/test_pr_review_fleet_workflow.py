#!/usr/bin/env python3
"""Static security checks for pr-review-fleet.yml."""

from __future__ import annotations

from pathlib import Path


WORKFLOW = Path(__file__).parents[1] / "workflows" / "pr-review-fleet.yml"


def test_copilot_reviewer_has_no_shell_tool() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")

    assert "--allow-tool='shell(git:*)'" not in text
    assert '--allow-tool="shell(git:*)"' not in text
    assert "--allow-tool=shell" not in text


def test_copilot_reviewer_keeps_read_write_tools() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")

    assert "--allow-tool=read" in text
    assert "--allow-tool=write" in text


def test_copilot_token_is_only_in_run_reviewer_step() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")

    assert text.count("COPILOT_GITHUB_TOKEN: ${{ secrets.COPILOT_GITHUB_TOKEN }}") == 1
    run_reviewer = text.index("- name: Run reviewer")
    token = text.index("COPILOT_GITHUB_TOKEN: ${{ secrets.COPILOT_GITHUB_TOKEN }}")
    assert run_reviewer < token


def test_precomputed_context_files_are_available_to_reviewer() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")

    assert "pr-diff.patch" in text
    assert "changed-files.txt" in text
    assert "api-report-files.txt" in text


def test_pr_head_checkout_does_not_persist_credentials() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")

    checkout = text.index("- name: Checkout PR head")
    next_section = text.index("# ── Prepare review context ──", checkout)
    checkout_block = text[checkout:next_section]

    assert "persist-credentials: false" in checkout_block


def test_pr_head_checkout_uses_captured_head_sha() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")

    checkout = text.index("- name: Checkout PR head")
    next_section = text.index("# ── Prepare review context ──", checkout)
    checkout_block = text[checkout:next_section]

    assert "ref: ${{ needs.setup.outputs.head_sha }}" in checkout_block
    assert "refs/pull/${{ needs.setup.outputs.pr_number }}/head" not in checkout_block


def test_fleet_concurrency_groups_workflow_run_by_pr_number() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")

    assert "github.event.workflow_run.pull_requests[0].number" in text
