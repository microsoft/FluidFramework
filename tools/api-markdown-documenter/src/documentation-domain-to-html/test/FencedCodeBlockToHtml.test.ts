/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { h } from "hastscript";

import {
	FencedCodeBlockNode,
	LineBreakNode,
	PlainTextNode,
} from "../../documentation-domain/index.js";

import { assertTransformation } from "./Utilities.js";

const brElement = h("br");

describe("FencedCodeBlock HTML rendering tests", () => {
	it("Simple FencedCodeBlock", () => {
		const input = new FencedCodeBlockNode(
			[new PlainTextNode("console.log('hello world');")],
			"typescript",
		);

		// Note: HTML <code> elements don't support a language specification like Markdown fenced code blocks do.
		const expected = h("code", [{ type: "text", value: "console.log('hello world');" }]);

		assertTransformation(input, expected);
	});

	it("Multi-line FencedCodeBlock", () => {
		const input = new FencedCodeBlockNode(
			[
				new PlainTextNode('const foo = "Hello world!'),
				LineBreakNode.Singleton,
				new PlainTextNode("console.log(foo);"),
				LineBreakNode.Singleton,
				new PlainTextNode("return foo;"),
			],
			"typescript",
		);

		// Note: HTML <code> elements don't support a language specification like Markdown fenced code blocks do.
		const expected = h("code", [
			{ type: "text", value: 'const foo = "Hello world!' },
			brElement,
			{ type: "text", value: "console.log(foo);" },
			brElement,
			{ type: "text", value: "return foo;" },
		]);

		assertTransformation(input, expected);
	});
});
