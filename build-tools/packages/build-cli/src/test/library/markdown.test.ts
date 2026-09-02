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

import {
	ADMONITION_REGEX,
	stripSoftBreaks,
	TRAILING_ADMONITION_REGEX,
} from "../../library/markdown.js";

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

describe("TRAILING_ADMONITION_REGEX", () => {
	/**
	 * Applies {@link TRAILING_ADMONITION_REGEX} the way `stripSoftBreaks` does.
	 */
	function splitTrailingTitle(input: string): string {
		return input.replace(TRAILING_ADMONITION_REGEX, "$1\n");
	}

	describe("splits a title left at the end of the string", () => {
		const cases: [name: string, input: string][] = [
			["with no trailing whitespace", "[!NOTE]"],
			["with a trailing space", "[!NOTE] "],
			["with trailing spaces", "[!NOTE]   "],
			["with a trailing line break", "[!NOTE]\n"],
			["after other content", "Leading text. [!NOTE] "],
		];

		for (const [name, input] of cases) {
			it(name, () => {
				assert.equal(splitTrailingTitle(input), `${input.trimEnd()}\n`);
			});
		}
	});

	it("is idempotent, so an already-split title does not gain a second line break", () => {
		assert.equal(splitTrailingTitle(splitTrailingTitle("[!NOTE] ")), "[!NOTE]\n");
	});

	describe("leaves the string alone", () => {
		const cases: [name: string, input: string][] = [
			["when the title is followed by content", "[!NOTE] Body text."],
			["when there is no title", "Body text."],
			["when the type is not supported", "[!DANGER] "],
			["when the type is lowercase", "[!note] "],
		];

		for (const [name, input] of cases) {
			it(name, () => {
				assert.equal(splitTrailingTitle(input), input);
			});
		}
	});

	it("is not multiline, so a title at the end of an inner line is left alone", () => {
		assert.equal(splitTrailingTitle("[!NOTE]\nBody text."), "[!NOTE]\nBody text.");
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

	describe("keeps the title on its own line when the body starts with formatting", () => {
		// Markdown parsers put the title and the body in sibling nodes when the body starts with anything other than
		// plain text, which leaves the title alone at the end of its own text node. The title still needs its line
		// break, otherwise the alert collapses onto one line and GitHub stops rendering it as an alert.
		const cases: [name: string, markdown: string, expected: string[]][] = [
			[
				"bold text",
				"> [!NOTE]\n> **Bold body** and more.\n",
				["[!NOTE]\n", "Bold body", " and more."],
			],
			[
				"a link",
				"> [!TIP]\n> [a link](https://example.com) then text.\n",
				["[!TIP]\n", "a link", " then text."],
			],
			["inline code", "> [!WARNING]\n> `code` first.\n", ["[!WARNING]\n", " first."]],
		];

		for (const [name, markdown, expected] of cases) {
			it(name, () => {
				assert.deepEqual(stripAndCollectText(markdown), expected);
			});
		}
	});

	it("does not add a line break to a title that has no body", () => {
		assert.deepEqual(stripAndCollectText("> [!NOTE]\n"), ["[!NOTE]"]);
	});

	it("does not add a line break when a hard break already follows the title", () => {
		// The two trailing spaces produce a `break` node, which already supplies the line break the alert needs.
		assert.deepEqual(stripAndCollectText("> [!NOTE]  \n> **Bold body**\n"), [
			"[!NOTE]",
			"Bold body",
		]);
	});

	it("leaves a blockquote that is not an admonition alone", () => {
		assert.deepEqual(stripAndCollectText("> Regular quote with **bold** text.\n"), [
			"Regular quote with ",
			"bold",
			" text.",
		]);
	});
});
