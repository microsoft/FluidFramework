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

import { ADMONITION_REGEX, stripSoftBreaks } from "../../library/markdown.js";

/**
 * The admonition types that GitHub supports, and that the regular expression is expected to recognize.
 */
const admonitionTypes = ["CAUTION", "IMPORTANT", "NOTE", "TIP", "WARNING"] as const;

/**
 * Applies {@link ADMONITION_REGEX} exactly the way `stripSoftBreaks` does, so these tests exercise the regular
 * expression through its real usage instead of an approximation of it.
 */
function splitAdmonitionTitles(input: string): string {
	return input.replace(ADMONITION_REGEX, "$1\n");
}

describe("ADMONITION_REGEX", () => {
	describe("splits the title onto its own line when the body shares the line", () => {
		for (const type of admonitionTypes) {
			it(`[!${type}]`, () => {
				assert.equal(splitAdmonitionTitles(`[!${type}] Body text.`), `[!${type}]\nBody text.`);
			});
		}
	});

	describe("leaves the title alone when it is the only thing on its line", () => {
		const cases: [name: string, input: string][] = [
			["at the end of the string", "[!NOTE]"],
			["with only trailing whitespace at the end of the string", "[!NOTE]   "],
			["followed by a line break", "[!NOTE]\nBody text."],
			["followed by trailing spaces and a line break", "[!NOTE]  \nBody text."],
			["followed by a CRLF line break", "[!NOTE]\r\nBody text."],
			["followed by a blank line", "[!NOTE]\n\nBody text."],
		];

		for (const [name, input] of cases) {
			it(name, () => {
				assert.equal(splitAdmonitionTitles(input), input);
			});
		}
	});

	describe("consumes the whitespace between the title and the body", () => {
		const cases: [name: string, input: string][] = [
			["no whitespace", "[!NOTE]Body text."],
			["a single space", "[!NOTE] Body text."],
			["multiple spaces", "[!NOTE]     Body text."],
			["a tab", "[!NOTE]\tBody text."],
			["mixed spaces and tabs", "[!NOTE] \t  \tBody text."],
		];

		for (const [name, input] of cases) {
			it(name, () => {
				assert.equal(splitAdmonitionTitles(input), "[!NOTE]\nBody text.");
			});
		}
	});

	describe("ignores tokens that are not GitHub admonition titles", () => {
		const cases: [name: string, input: string][] = [
			["an unsupported admonition type", "[!DANGER] Body text."],
			["a lowercase type", "[!note] Body text."],
			["a mixed-case type", "[!Note] Body text."],
			["a missing exclamation point", "[NOTE] Body text."],
			["an unterminated title", "[!NOTE Body text."],
			["a space after the exclamation point", "[! NOTE] Body text."],
			["a space before the closing bracket", "[!NOTE ] Body text."],
			["extra brackets around the type", "[![NOTE]] Body text."],
		];

		for (const [name, input] of cases) {
			it(name, () => {
				assert.equal(splitAdmonitionTitles(input), input);
			});
		}
	});

	it("splits every admonition title in a multi-line string", () => {
		assert.equal(
			splitAdmonitionTitles("[!NOTE] First body.\n[!TIP] Second body."),
			"[!NOTE]\nFirst body.\n[!TIP]\nSecond body.",
		);
	});

	it("puts the title in capture group 1 and the consumed whitespace in the full match", () => {
		// ADMONITION_REGEX is global, so exec/test would mutate the shared instance's lastIndex. Copy it instead.
		const match = new RegExp(ADMONITION_REGEX).exec("[!WARNING]  \tBody text.");

		assert.notEqual(match, null);
		assert.equal(match?.[1], "[!WARNING]");
		assert.equal(match?.[0], "[!WARNING]  \t");
	});
});

describe("stripSoftBreaks", () => {
	/**
	 * Parses markdown into an mdast tree, applies the `stripSoftBreaks` plugin to it, and returns the values of every
	 * text node in the resulting tree, in document order.
	 */
	function stripAndCollectText(markdown: string): string[] {
		const tree: Root = remark().use(remarkGfm).parse(markdown);
		stripSoftBreaks()(tree);

		const values: string[] = [];
		visit(tree, "text", (node: { value: string }) => {
			values.push(node.value);
		});
		return values;
	}

	it("keeps an admonition title on its own line while collapsing soft breaks in the body", () => {
		// Without the admonition pass, the line break after the title would be collapsed into a space along with the
		// rest of the body's soft breaks, and GitHub would stop rendering the blockquote as an alert.
		assert.deepEqual(stripAndCollectText("> [!NOTE]\n> Body line one.\n> Body line two.\n"), [
			"[!NOTE]\nBody line one. Body line two.",
		]);
	});

	it("only splits admonition titles inside blockquotes", () => {
		// The admonition pass only visits blockquote nodes, so an alert-looking token in an ordinary paragraph keeps
		// the collapsed soft break and is not split back onto its own line.
		assert.deepEqual(stripAndCollectText("[!NOTE]\nBody line one.\n"), [
			"[!NOTE] Body line one.",
		]);
	});
});
