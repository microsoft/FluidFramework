/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { Root } from "mdast";
import { describe, it } from "mocha";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";

import { stripSoftBreaks } from "../../library/markdown.js";

/**
 * Parses markdown, applies `stripSoftBreaks` to the tree, and returns the value of every text node in document order.
 *
 * Text node values are what the plugin actually edits, so they show its effect directly. A line break in a value means
 * the text is still split across two lines; a space where the source had a line break means the soft break was
 * collapsed.
 */
function strippedText(markdown: string): string[] {
	const tree: Root = remark().use(remarkGfm).parse(markdown);
	stripSoftBreaks()(tree);

	const values: string[] = [];
	visit(tree, "text", (node: { value: string }) => {
		values.push(node.value);
	});
	return values;
}

/**
 * Parses markdown, applies `stripSoftBreaks`, and serializes the result back to markdown.
 */
function strippedMarkdown(markdown: string): string {
	return String(remark().use(remarkGfm).use(stripSoftBreaks).processSync(markdown));
}

/**
 * The five alert types GitHub supports.
 */
const alertTypes = ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"] as const;

/**
 * GitHub renders a blockquote as an alert only when all of the following hold:
 *
 * - The blockquote's first paragraph begins with a `[!TYPE]` marker, where the type is one of NOTE, TIP, IMPORTANT,
 * WARNING or CAUTION. The type is matched case-insensitively, so `[!note]` and `[!Note]` are alerts too.
 * - The marker is the very first thing in the blockquote. Text in front of it means the blockquote is ordinary prose.
 * - The marker is alone on its line. Body content on the marker's line means the blockquote is ordinary prose.
 * - The alert has a body. A marker on its own is just a blockquote.
 * - The blockquote is at the top level of the document, because alerts do not nest inside other elements.
 *
 * Trailing whitespace after the marker is allowed, as is a blank line between the marker and the body.
 *
 * `stripSoftBreaks` collapses single line breaks, which would otherwise pull the body up onto the marker's line and
 * stop the alert from rendering. So the contract is twofold: an alert must keep the line break that ends its marker,
 * and anything that is not an alert must have its line breaks collapsed like any other text.
 */
describe("stripSoftBreaks and GitHub alerts", () => {
	describe("keeps the line break after the marker, for every alert type", () => {
		for (const type of alertTypes) {
			it(type, () => {
				assert.deepEqual(strippedText(`> [!${type}]\n> Line one.\n> Line two.\n`), [
					`[!${type}]\nLine one. Line two.`,
				]);
			});
		}
	});

	describe("matches the marker case-insensitively, as GitHub does", () => {
		const markers = ["[!note]", "[!Note]", "[!nOtE]", "[!tip]", "[!important]", "[!caution]"];

		for (const marker of markers) {
			it(marker, () => {
				assert.deepEqual(strippedText(`> ${marker}\n> Line one.\n> Line two.\n`), [
					`${marker}\nLine one. Line two.`,
				]);
			});
		}
	});

	describe("keeps the line break when the body starts with formatting", () => {
		// The marker and the body land in sibling nodes here, so the marker ends up alone in its own text node.
		const cases: [name: string, body: string, expected: string[]][] = [
			["bold", "**Bold** and more.", ["[!NOTE]\n", "Bold", " and more."]],
			["emphasis", "_Emphasised_ and more.", ["[!NOTE]\n", "Emphasised", " and more."]],
			[
				"a link",
				"[a link](https://example.com) then text.",
				["[!NOTE]\n", "a link", " then text."],
			],
			["inline code", "`code` first.", ["[!NOTE]\n", " first."]],
			["strikethrough", "~~struck~~ then text.", ["[!NOTE]\n", "struck", " then text."]],
		];

		for (const [name, body, expected] of cases) {
			it(name, () => {
				assert.deepEqual(strippedText(`> [!NOTE]\n> ${body}\n`), expected);
			});
		}
	});

	describe("collapses the line break instead, when the blockquote is not an alert", () => {
		// Each input has a real line break after the marker. An alert would keep that break; these are not alerts, so
		// it is collapsed to a space like any other soft break.
		const cases: [name: string, input: string, expected: string[]][] = [
			[
				"the marker is preceded by text",
				"> Please read [!NOTE]\n> and continue.\n",
				["Please read [!NOTE] and continue."],
			],
			[
				"the alert type is not one GitHub supports",
				"> [!DANGER]\n> Body text.\n",
				["[!DANGER] Body text."],
			],
			["the marker is not in a blockquote", "[!NOTE]\nBody text.\n", ["[!NOTE] Body text."]],
			[
				"the blockquote is nested inside another",
				"> > [!NOTE]\n> > Body text.\n",
				["[!NOTE] Body text."],
			],
			[
				"the marker is in a paragraph other than the first",
				"> Intro.\n>\n> [!NOTE]\n> Body text.\n",
				["Intro.", "[!NOTE] Body text."],
			],
		];

		for (const [name, input, expected] of cases) {
			it(name, () => {
				assert.deepEqual(strippedText(input), expected);
			});
		}
	});

	describe("leaves the text as it is when there is no line break to act on", () => {
		it("a marker written inline with its body, which GitHub does not treat as an alert", () => {
			assert.deepEqual(strippedText("> [!NOTE] Body on the marker line.\n"), [
				"[!NOTE] Body on the marker line.",
			]);
		});

		it("a marker with no body, which GitHub does not treat as an alert", () => {
			assert.deepEqual(strippedText("> [!NOTE]\n"), ["[!NOTE]"]);
		});

		it("an alert whose body is a separate paragraph", () => {
			// GitHub still renders this as an alert, and the marker and body are separate paragraphs, so there is no
			// soft break between them in the first place.
			assert.deepEqual(strippedText("> [!NOTE]\n>\n> Body text.\n"), [
				"[!NOTE]",
				"Body text.",
			]);
		});
	});

	it("collapses soft breaks in an ordinary blockquote", () => {
		assert.deepEqual(strippedText("> Regular quote with **bold**.\n> A second line.\n"), [
			"Regular quote with ",
			"bold",
			". A second line.",
		]);
	});

	describe("serializes back to markdown that GitHub still renders as an alert", () => {
		// remark-stringify escapes a leading `[` as `\[` on any text, so that re-parsing cannot mistake `[text]` for a
		// link reference. It does that with no plugins loaded, and to ordinary prose brackets alike, and GitHub renders
		// the escaped marker as an alert regardless. The escape below is therefore expected, and is not something
		// `stripSoftBreaks` introduces.
		it("keeps the marker on its own line", () => {
			assert.equal(
				strippedMarkdown("> [!NOTE]\n> Line one.\n> Line two.\n"),
				"> \\[!NOTE]\n> Line one. Line two.\n",
			);
		});

		it("keeps the marker on its own line when the body starts with formatting", () => {
			assert.equal(
				strippedMarkdown("> [!NOTE]\n> **Bold** and more.\n"),
				"> \\[!NOTE]\n> **Bold** and more.\n",
			);
		});

		it("does not give a marker in ordinary prose a line of its own", () => {
			assert.equal(
				strippedMarkdown("> Please read [!NOTE]\n> and continue.\n"),
				"> Please read \\[!NOTE] and continue.\n",
			);
		});
	});
});
