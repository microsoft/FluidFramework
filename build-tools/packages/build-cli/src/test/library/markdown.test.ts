/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { describe, it } from "mocha";
import { remark } from "remark";
import remarkGfm from "remark-gfm";

import { stripSoftBreaks } from "../../library/markdown.js";

/**
 * Runs markdown through `stripSoftBreaks` the same way the release notes commands do, and returns the resulting
 * markdown.
 */
function process(markdown: string): string {
	return String(remark().use(remarkGfm).use(stripSoftBreaks).processSync(markdown));
}

/**
 * The five alert types GitHub supports.
 */
const alertTypes = ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"] as const;

/**
 * These tests describe what GitHub actually does, rather than what the current implementation does. Every expectation
 * below was verified by rendering the markdown through GitHub's own renderer (`POST /markdown`) and checking whether
 * the result carried a `markdown-alert` class.
 *
 * The rules that came out of that exercise:
 *
 * 1. An alert is a blockquote whose first paragraph begins with a `[!TYPE]` marker.
 * 2. The marker must be the very first thing in the blockquote. Text in front of it means it is not an alert.
 * 3. The marker must be alone on its line. Body content on the marker's line means it is not an alert.
 * 4. Matching is case-insensitive: `[!note]` and `[!Note]` are alerts just like `[!NOTE]`.
 * 5. Only NOTE, TIP, IMPORTANT, WARNING and CAUTION are alert types.
 * 6. An alert needs a body. A marker on its own is just a blockquote.
 * 7. Trailing whitespace after the marker is fine, as is a blank line between the marker and the body.
 * 8. A backslash-escaped marker (`\[!NOTE]`) still renders as an alert, so the escaping that remark-stringify applies
 * on output is harmless.
 * 9. Nested blockquotes are not alerts, and neither is a marker outside a blockquote.
 *
 * `stripSoftBreaks` collapses single line breaks, which would otherwise pull the body up onto the marker's line and
 * break rule 3. So the contract under test is: markdown that GitHub renders as an alert must still be rendered as an
 * alert afterwards, and markdown that is not an alert must not be rewritten into something that looks like one.
 */
describe("stripSoftBreaks and GitHub alerts", () => {
	describe("keeps the marker on its own line for every alert type", () => {
		for (const type of alertTypes) {
			it(type, () => {
				assert.equal(
					process(`> [!${type}]\n> Body line one.\n> Body line two.\n`),
					`> \\[!${type}]\n> Body line one. Body line two.\n`,
				);
			});
		}
	});

	describe("treats the marker case-insensitively, as GitHub does", () => {
		const cases: [name: string, marker: string][] = [
			["all lowercase", "[!note]"],
			["capitalised", "[!Note]"],
			["mixed case", "[!nOtE]"],
			["lowercase tip", "[!tip]"],
			["lowercase important", "[!important]"],
			["lowercase warning", "[!warning]"],
			["lowercase caution", "[!caution]"],
		];

		for (const [name, marker] of cases) {
			it(name, () => {
				assert.equal(
					process(`> ${marker}\n> Body line one.\n> Body line two.\n`),
					`> \\${marker}\n> Body line one. Body line two.\n`,
				);
			});
		}
	});

	describe("keeps the marker on its own line when the body starts with formatting", () => {
		const cases: [name: string, body: string, expected: string][] = [
			["bold", "**Bold** and more.", "**Bold** and more."],
			["emphasis", "_Emphasised_ and more.", "*Emphasised* and more."],
			[
				"a link",
				"[a link](https://example.com) then text.",
				"[a link](https://example.com) then text.",
			],
			["inline code", "`code` first.", "`code` first."],
			["strikethrough", "~~struck~~ then text.", "~~struck~~ then text."],
		];

		for (const [name, body, expected] of cases) {
			it(name, () => {
				assert.equal(process(`> [!NOTE]\n> ${body}\n`), `> \\[!NOTE]\n> ${expected}\n`);
			});
		}
	});

	describe("does not rewrite markdown that GitHub does not treat as an alert", () => {
		const cases: [name: string, input: string, expected: string][] = [
			[
				"marker preceded by text",
				"> Please read [!NOTE] and continue.\n",
				"> Please read \\[!NOTE] and continue.\n",
			],
			[
				"marker preceded by text, body starts with formatting",
				"> Please read [!NOTE] **carefully**.\n",
				"> Please read \\[!NOTE] **carefully**.\n",
			],
			[
				"marker with body already on its line",
				"> [!NOTE] Body on the marker line.\n",
				"> \\[!NOTE] Body on the marker line.\n",
			],
			["unsupported alert type", "> [!DANGER]\n> Body text.\n", "> \\[!DANGER] Body text.\n"],
			["marker outside a blockquote", "[!NOTE]\nBody text.\n", "\\[!NOTE] Body text.\n"],
		];

		for (const [name, input, expected] of cases) {
			it(name, () => {
				assert.equal(process(input), expected);
			});
		}
	});

	it("does not split a marker that has no body, because that is not an alert", () => {
		assert.equal(process("> [!NOTE]\n"), "> \\[!NOTE]\n");
	});

	it("keeps an alert whose body is separated by a blank line", () => {
		// GitHub still renders this as an alert. The marker and body are separate paragraphs, so there is no soft break
		// between them to lose in the first place.
		assert.equal(process("> [!NOTE]\n>\n> Body text.\n"), "> \\[!NOTE]\n>\n> Body text.\n");
	});

	describe("does not treat a marker as an alert where GitHub would not", () => {
		const cases: [name: string, input: string, expected: string][] = [
			[
				"inside a nested blockquote",
				"> > [!NOTE]\n> > Body text.\n",
				"> > \\[!NOTE] Body text.\n",
			],
			[
				"in a paragraph other than the first",
				"> Intro.\n>\n> [!NOTE]\n> Body text.\n",
				"> Intro.\n>\n> \\[!NOTE] Body text.\n",
			],
		];

		for (const [name, input, expected] of cases) {
			it(name, () => {
				assert.equal(process(input), expected);
			});
		}
	});

	it("leaves an ordinary blockquote alone apart from collapsing its soft breaks", () => {
		assert.equal(
			process("> Regular quote with **bold**.\n> A second line.\n"),
			"> Regular quote with **bold**. A second line.\n",
		);
	});
});
