#!/usr/bin/env python3
"""Static checks for pr-review-dispatch.yml."""

from __future__ import annotations

from pathlib import Path


WORKFLOW = Path(__file__).parents[1] / "workflows" / "pr-review-dispatch.yml"


def test_dispatcher_runs_only_when_fleet_label_is_added() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")

    assert "- labeled" in text
    assert "- synchronize" not in text
    assert "github.event.action == 'labeled'" in text
    assert "github.event.action == 'synchronize'" not in text
    assert "github.event.label.name == 'fleet-review'" in text
    assert "contains(github.event.pull_request.labels.*.name, 'fleet-review')" not in text


def test_dispatcher_uploads_current_pr_head_sha() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")

    assert '--arg head_sha "${{ github.event.pull_request.head.sha }}"' in text
    assert "head_sha: $head_sha" in text
