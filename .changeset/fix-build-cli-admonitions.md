---
"@fluid-tools/build-cli": patch
"__section": fix
---
Preserve valid GitHub admonitions when transforming release notes

The release notes Markdown transform now preserves the required line break after an admonition marker without treating marker-like text elsewhere in a blockquote as an admonition.
