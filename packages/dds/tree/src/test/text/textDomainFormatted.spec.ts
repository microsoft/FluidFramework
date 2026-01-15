/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// Allow importing file being tested
// eslint-disable-next-line import-x/no-internal-modules
import { FormattedTextAsTree } from "../../text/textDomainFormatted.js";

describe("textDomainFormatted", () => {
	it("basic unformatted use", () => {
		const text = FormattedTextAsTree.Tree.fromString("hello");
		assert.equal(text.fullString(), "hello");
		assert.deepEqual([...text.characters()], ["h", "e", "l", "l", "o"]);
		text.insertAt(5, " world");
		assert.equal(text.fullString(), "hello world");
		text.removeRange(0, 6);
		assert.equal(text.fullString(), "world");
	});

	it("formatting", () => {
		const text = FormattedTextAsTree.Tree.fromString("hello");
		text.formatRange(1, 3, { bold: true });
		assert.equal(text.fullString(), "hello");
		assert.deepEqual(
			[...text.charactersFormatted()].map((atom) => [atom.content.content, atom.format.bold]),
			[
				["h", false],
				["e", true],
				["l", true],
				["l", true],
				["o", false],
			],
		);
	});

	it("insertFormattedAt", () => {
		const text = FormattedTextAsTree.Tree.fromString("ab");
		text.insertFormattedAt(1, [
			{ content: { content: "c" }, format: { ...text.defaultFormat, italic: true } },
		]);
		assert.equal(text.fullString(), "acb");
		assert.deepEqual(
			[...text.charactersFormatted()].map((atom) => [
				atom.content.content,
				atom.format.italic,
			]),
			[
				["a", false],
				["c", true],
				["b", false],
			],
		);
	});

	it("defaultFormat", () => {
		const text = FormattedTextAsTree.Tree.fromString("ab");
		text.defaultFormat.underline = true;
		text.insertAt(2, "cd");
		assert.deepEqual(
			[...text.charactersFormatted()].map((atom) => [
				atom.content.content,
				atom.format.underline,
			]),
			[
				["a", false],
				["b", false],
				["c", true],
				["d", true],
			],
		);
	});
});
