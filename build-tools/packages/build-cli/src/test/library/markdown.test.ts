/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { Blockquote, Root } from "mdast";
import { describe, it } from "mocha";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import admonitions from "remark-github-beta-blockquote-admonitions";
import { visit } from "unist-util-visit";
import { stripSoftBreaks } from "../../library/markdown.js";

const supportedAdmonitionTypes = ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"] as const;

async function processMarkdown(markdown: string, parseAdmonitions = false): Promise<Root> {
	const processor = remark().use(remarkGfm).use(stripSoftBreaks);
	if (parseAdmonitions) {
		processor.use(admonitions, {
			titleTextMap: (title) => ({
				displayTitle: title,
				checkedTitle: title,
			}),
		});
	}

	const tree = await processor.run(processor.parse(markdown));
	assert.strictEqual(tree.type, "root");
	return tree as Root;
}

function getOnlyBlockquote(tree: Root): Blockquote {
	assert.strictEqual(tree.children.length, 1);
	const blockquote = tree.children[0];
	assert(blockquote !== undefined && blockquote.type === "blockquote");
	return blockquote;
}

function getTextValues(tree: Root | Blockquote): string[] {
	const values: string[] = [];
	visit(tree, "text", (node) => {
		values.push(node.value);
	});
	return values;
}

function assertIsAdmonition(blockquote: Blockquote): void {
	assert.strictEqual(
		(blockquote.data as { hName?: unknown } | undefined)?.hName,
		"div",
		"expected the blockquote to be parsed as an admonition",
	);
}

function assertIsBlockquote(blockquote: Blockquote): void {
	assert.notStrictEqual(
		(blockquote.data as { hName?: unknown } | undefined)?.hName,
		"div",
		"expected an ordinary blockquote",
	);
}

describe("stripSoftBreaks", () => {
	it("replaces soft breaks in ordinary prose with spaces", async () => {
		const tree = await processMarkdown("First line\nsecond line");

		assert.deepStrictEqual(getTextValues(tree), ["First line second line"]);
	});

	for (const type of supportedAdmonitionTypes) {
		it(`preserves the title boundary for ${type} admonitions`, async () => {
			const tree = await processMarkdown(`> [!${type}]\n> Admonition body`, true);
			const blockquote = getOnlyBlockquote(tree);

			assertIsAdmonition(blockquote);
			assert.deepStrictEqual(getTextValues(blockquote), [`[!${type}]`, "Admonition body"]);
		});
	}

	it("allows trailing whitespace after an admonition marker", async () => {
		const tree = await processMarkdown("> [!NOTE] \t\n> Admonition body", true);
		const blockquote = getOnlyBlockquote(tree);

		assertIsAdmonition(blockquote);
		assert.deepStrictEqual(getTextValues(blockquote), ["[!NOTE]", "Admonition body"]);
	});

	it("recognizes an admonition containing block content", async () => {
		const tree = await processMarkdown("> [!NOTE]\n>\n> - First item\n> - Second item", true);
		const blockquote = getOnlyBlockquote(tree);

		assertIsAdmonition(blockquote);
		assert.deepStrictEqual(getTextValues(blockquote), [
			"[!NOTE]",
			"First item",
			"Second item",
		]);
	});

	it("normalizes soft breaks in the admonition body", async () => {
		const tree = await processMarkdown(
			"> [!NOTE]\n> First body line\n> Second body line\n> A literal [!WARNING] remains inline",
			true,
		);
		const blockquote = getOnlyBlockquote(tree);

		assertIsAdmonition(blockquote);
		assert.deepStrictEqual(getTextValues(blockquote), [
			"[!NOTE]",
			"First body line Second body line A literal [!WARNING] remains inline",
		]);
	});

	it("does not recognize an admonition marker followed by content on the same line", async () => {
		const tree = await processMarkdown("> [!NOTE] Same-line content\n> Continuation", true);
		const blockquote = getOnlyBlockquote(tree);

		assertIsBlockquote(blockquote);
		assert.deepStrictEqual(getTextValues(blockquote), [
			"[!NOTE] Same-line content Continuation",
		]);
	});

	it("does not introduce a break before marker-like text in a blockquote", async () => {
		const tree = await processMarkdown("> Introductory text\n> [!NOTE]\n> More text", true);
		const blockquote = getOnlyBlockquote(tree);

		assertIsBlockquote(blockquote);
		assert.deepStrictEqual(getTextValues(blockquote), ["Introductory text [!NOTE] More text"]);
	});

	it("does not recognize an admonition marker in a later blockquote paragraph", async () => {
		const tree = await processMarkdown(
			"> Introductory paragraph\n>\n> [!NOTE]\n> More text",
			true,
		);
		const blockquote = getOnlyBlockquote(tree);

		assertIsBlockquote(blockquote);
		assert.deepStrictEqual(getTextValues(blockquote), [
			"Introductory paragraph",
			"[!NOTE] More text",
		]);
	});

	it("does not recognize unsupported or incorrectly cased admonition markers", async () => {
		for (const marker of ["[!note]", "[!INFO]"]) {
			const tree = await processMarkdown(`> ${marker}\n> More text`, true);
			const blockquote = getOnlyBlockquote(tree);

			assertIsBlockquote(blockquote);
			assert.deepStrictEqual(getTextValues(blockquote), [`${marker} More text`]);
		}
	});
});
