/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import {
	FencedCodeBlockNode,
	LineBreakNode,
	PlainTextNode,
} from "../../../documentation-domain/index.js";

import { testRender } from "./Utilities.js";

describe("FencedCodeBlock Markdown rendering tests", () => {
	describe("Standard context", () => {
		it("Simple FencedCodeBlock", () => {
			const input = new FencedCodeBlockNode(
				[new PlainTextNode("console.log('hello world');")],
				"typescript",
			);
			const result = testRender(input);

			const expected = [
				"",
				"```typescript",
				"console.log('hello world');",
				"```",
				"",
				"",
			].join("\n");

			expect(result).to.equal(expected);
		});

		it("Multi-line FencedCodeBlock", () => {
			const input = new FencedCodeBlockNode(
				[
					new PlainTextNode('const foo = "Hello world!"'),
					LineBreakNode.Singleton,
					new PlainTextNode("console.log(foo);"),
					LineBreakNode.Singleton,
					new PlainTextNode("return foo;"),
				],
				"typescript",
			);
			const result = testRender(input);

			const expected = [
				"",
				"```typescript",
				'const foo = "Hello world!"',
				"console.log(foo);",
				"return foo;",
				"```",
				"",
				"",
			].join("\n");

			expect(result).to.equal(expected);
		});
	});

	describe("Table context", () => {
		it("Simple FencedCodeBlock", () => {
			const input = new FencedCodeBlockNode(
				[new PlainTextNode("console.log('hello world');")],
				"typescript",
			);
			const result = testRender(input, { insideTable: true });

			const expected = ["<code>", "console.log('hello world');", "</code>"].join("");

			expect(result).to.equal(expected);
		});

		it("Multi-line FencedCodeBlock", () => {
			const input = new FencedCodeBlockNode(
				[
					new PlainTextNode('const foo = "Hello world!";'),
					LineBreakNode.Singleton,
					new PlainTextNode("console.log(foo);"),
					LineBreakNode.Singleton,
					new PlainTextNode("return foo;"),
				],
				"typescript",
			);
			const result = testRender(input, { insideTable: true });

			const expected = [
				"<code>",
				'const foo = "Hello world!";',
				"<br>",
				"console.log(foo);",
				"<br>",
				"return foo;",
				"</code>",
			].join("");

			expect(result).to.equal(expected);
		});
	});
});
