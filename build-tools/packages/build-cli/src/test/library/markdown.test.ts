/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "mocha";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import admonitions from "remark-github-beta-blockquote-admonitions";
import { stripSoftBreaks } from "../../library/markdown.js";

const alertTypes = ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"] as const;

/**
 * Runs Markdown through the same relevant plugins and configuration used by the release notes commands.
 */
function process(markdown: string): string {
	return String(
		remark()
			.use(remarkGfm)
			.use(stripSoftBreaks)
			.use(admonitions, {
				titleTextMap: (title) => ({
					displayTitle: title,
					checkedTitle: title,
				}),
			})
			.processSync(markdown),
	);
}

describe("stripSoftBreaks and GitHub alerts", () => {
	it("replaces soft breaks in ordinary prose with spaces", () => {
		assert.strictEqual(process("First line\nsecond line"), "First line second line\n");
	});

	describe("preserves the title boundary for every supported alert type", () => {
		for (const type of alertTypes) {
			it(type, () => {
				assert.strictEqual(
					process(`> [!${type}]\n> First body line\n> Second body line`),
					`> \\[!${type}]\n>\n> First body line Second body line\n`,
				);
			});
		}
	});

	describe("matches alert types case-insensitively", () => {
		for (const marker of ["[!note]", "[!Note]", "[!nOtE]", "[!tip]", "[!important]"]) {
			it(marker, () => {
				assert.strictEqual(
					process(`> ${marker}\n> First body line\n> Second body line`),
					`> \\${marker}\n> First body line Second body line\n`,
				);
			});
		}
	});

	it("allows trailing whitespace after an alert marker", () => {
		assert.strictEqual(
			process("> [!NOTE] \t\n> Alert body"),
			"> \\[!NOTE]\n>\n> Alert body\n",
		);
	});

	describe("preserves the title boundary when the body starts with formatting", () => {
		const cases: [name: string, body: string, expected: string][] = [
			["bold text", "**Bold** and more.", "**Bold** and more."],
			["emphasis", "_Emphasized_ and more.", "*Emphasized* and more."],
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
				assert.strictEqual(process(`> [!NOTE]\n> ${body}`), `> \\[!NOTE]\n>\n> ${expected}\n`);
			});
		}
	});

	describe("does not rewrite Markdown that GitHub does not treat as an alert", () => {
		const cases: [name: string, input: string, expected: string][] = [
			[
				"marker preceded by text",
				"> Please read [!NOTE]\n> More text",
				"> Please read \\[!NOTE] More text\n",
			],
			[
				"marker with body on the same line",
				"> [!NOTE] Same-line content\n> Continuation",
				"> \\[!NOTE] Same-line content Continuation\n",
			],
			[
				"marker in a later blockquote paragraph",
				"> Introductory paragraph\n>\n> [!NOTE]\n> More text",
				"> Introductory paragraph\n>\n> \\[!NOTE] More text\n",
			],
			["unsupported alert type", "> [!INFO]\n> More text", "> \\[!INFO] More text\n"],
			["marker outside a blockquote", "[!NOTE]\nMore text", "\\[!NOTE] More text\n"],
			[
				"marker in a nested blockquote",
				"> > [!NOTE]\n> > More text",
				"> > \\[!NOTE] More text\n",
			],
		];

		for (const [name, input, expected] of cases) {
			it(name, () => {
				assert.strictEqual(process(input), expected);
			});
		}
	});

	it("does not turn a marker without a body into an alert", () => {
		assert.strictEqual(process("> [!NOTE]"), "> \\[!NOTE]\n>\n>\n");
	});

	it("preserves an alert whose body is separated from the marker by a blank line", () => {
		assert.strictEqual(
			process("> [!NOTE]\n>\n> Alert body"),
			"> \\[!NOTE]\n>\n>\n>\n> Alert body\n",
		);
	});

	it("does not introduce a break before marker-like text in an alert body", () => {
		assert.strictEqual(
			process("> [!NOTE]\n> First line\n> A literal [!WARNING] remains inline"),
			"> \\[!NOTE]\n>\n> First line A literal \\[!WARNING] remains inline\n",
		);
	});
});
