"""Offline checks for native Copilot skill metadata."""

from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


def test_native_skill_frontmatter() -> None:
    for path in (ROOT / ".github/skills").glob("*/SKILL.md"):
        _, frontmatter, _ = path.read_text(encoding="utf-8").split("---", 2)
        metadata = yaml.safe_load(frontmatter)
        assert metadata["name"] == path.parent.name
        assert isinstance(metadata["description"], str) and metadata["description"].strip()
        assert "model" not in metadata
