/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { Root } from "mdast";
import { toString } from "mdast-util-to-string";
import { describe, it } from "mocha";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import { normalizeReleaseNoteHeadings } from "../../library/markdown.js";

describe("normalizeReleaseNoteHeadings", () => {
	const processor = remark().use(remarkGfm).use(normalizeReleaseNoteHeadings);

	/**
	 * Normalizes a fresh body using the shared processor, whose transforms edit the parsed tree in place.
	 */
	function normalize(source: string): Root {
		const tree = processor.parse(source);
		processor.runSync(tree);
		return tree;
	}

	for (const depth of [1, 2, 3, 4, 5, 6]) {
		it(`normalizes a level-${depth} body heading to level 4`, () => {
			const headings = normalize(`${"#".repeat(depth)} Examples`).children.filter(
				(node) => node.type === "heading",
			);
			assert.deepEqual(
				headings.map((node) => node.depth),
				[4],
			);
		});
	}

	it("preserves relative nesting and converts overflowing headings to bold labels", () => {
		const tree = normalize(
			"# Examples\n\n## Measurements\n\n### Details\n\n#### Deep details\n\n###### Deeper details",
		);

		// Readers have three real heading levels available beneath each changeset title.
		assert.deepEqual(
			tree.children.filter((node) => node.type === "heading").map((node) => node.depth),
			[4, 5, 6],
		);
		const labels = tree.children.filter((node) => node.type === "paragraph");

		// Deeper sections must remain readable as bold labels without adding invalid headings to the outline.
		assert.deepEqual(
			labels.map((node) => toString(node)),
			["Deep details", "Deeper details"],
		);
		assert.ok(labels.every((node) => node.children[0]?.type === "strong"));
	});

	it("preserves adjacent prose, indented code, and rules after serializing bold labels", () => {
		const output = String(
			processor.processSync(
				"# Examples\n\nIntro.\n#### Details\n    const value = 1;\n#### Rule\n---",
			),
		);
		const blocks = remark().parse(output).children;

		// The AST-based release-note path must keep the same block boundaries protected by the changelog formatter.
		// Parse its serialized output so an indented example becoming prose or a rule becoming an underline cannot pass.
		assert.deepEqual(
			blocks.map((node) => node.type),
			["heading", "paragraph", "paragraph", "code", "paragraph", "thematicBreak"],
		);
		for (const index of [2, 4]) {
			const label = blocks[index];
			assert.ok(label?.type === "paragraph");
			assert.equal(label.children[0]?.type, "strong");
		}
		const code = blocks[3];
		assert.ok(code?.type === "code");
		assert.equal(code.value, "const value = 1;");
	});

	it("uses the shallowest heading even when it appears later and preserves level gaps", () => {
		const tree = normalize("###### Deep details\n\n## Examples\n\n#### Details");

		// The early level-6 heading overflows, while the later levels 2 and 4 must remain two levels apart.
		// Using the first heading as the baseline or collapsing gaps would change the author's hierarchy.
		assert.deepEqual(
			tree.children.map((node) => (node.type === "heading" ? node.depth : node.type)),
			["paragraph", 4, 6],
		);
	});

	// A previous changeset's heading levels must not determine how the next changeset is rendered.
	it("normalizes each body independently when the processor is reused", () => {
		for (const source of ["# First body", "###### Second body", "### Third body"]) {
			const heading = normalize(source).children[0];
			assert.ok(heading?.type === "heading");
			assert.equal(heading.depth, 4);
		}
	});

	it("preserves inline formatting in overflowing headings", () => {
		const tree = normalize(
			"# Examples\n\n#### Compare `before` with [after](https://example.com)",
		);
		const label = tree.children[1];
		assert.ok(label?.type === "paragraph");
		const strong = label.children[0];
		assert.ok(strong?.type === "strong");

		// Overflow changes the section's presentation, not its inline content: code spans and links must remain formatted.
		assert.deepEqual(
			strong.children.map((node) => node.type),
			["text", "inlineCode", "text", "link"],
		);
	});

	it("does not turn empty overflowing headings into thematic breaks", () => {
		const tree = normalize("# Examples\n\n####");

		// Serializing an empty bold label as "****" would introduce a horizontal rule the author did not request.
		assert.equal(processor.stringify(tree).trimEnd(), "#### Examples");
	});

	it("ignores heading-like content in fenced and indented code blocks", () => {
		const tree = normalize(
			"```markdown\n# Fenced example\n```\n\n    ## Indented example\n\n##### Actual heading",
		);

		// The shallower hash-prefixed lines are code, so only the actual level-5 heading may determine the offset.
		assert.deepEqual(
			tree.children.filter((node) => node.type === "heading").map((node) => node.depth),
			[4],
		);

		// Code examples must retain their literal contents so readers can copy them without heading rewrites.
		assert.deepEqual(
			tree.children.filter((node) => node.type === "code").map((node) => node.value),
			["# Fenced example", "## Indented example"],
		);
	});

	it("normalizes headings inside blockquotes and list items", () => {
		const result = String(
			processor.processSync("> ## Quoted heading\n\n- ### Nested heading"),
		);

		// Headings inside containers must also fit beneath the changeset title, not just headings at the document root.
		assert.ok(result.includes("> #### Quoted heading"));
		assert.match(result, /##### Nested heading/);
	});

	it("preserves relative levels of Setext headings", () => {
		const tree = normalize("Examples\n========\n\nDetails\n-------");

		// Underline-style headings express the same hierarchy as hash-prefixed headings and must normalize the same way.
		assert.deepEqual(
			tree.children.filter((node) => node.type === "heading").map((node) => node.depth),
			[4, 5],
		);
	});

	it("retains content without headings, including GFM tables", () => {
		const tree = normalize(
			"Details.\n\n- First\n- Second\n\n| Before | After |\n| --- | --- |\n| 2 | 1 |",
		);

		// A body does not need headings; ordinary paragraphs, lists, and GitHub-flavored Markdown tables remain ordinary blocks.
		assert.deepEqual(
			tree.children.map((node) => node.type),
			["paragraph", "list", "table"],
		);
	});
});
