/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { h } from "hastscript";

import { FencedCodeBlockNode } from "../../documentation-domain/index.js";

import { assertTransformation } from "./Utilities.js";

const brElement = h("br");

describe("FencedCodeBlock HTML rendering tests", () => {
	it("Simple FencedCodeBlock", () => {
		const input = new FencedCodeBlockNode("console.log('hello world');", "typescript");

		// Note: HTML <code> elements don't support a language specification like Markdown fenced code blocks do.
		const expected = h("code", [{ type: "text", value: "console.log('hello world');" }]);

		assertTransformation(input, expected);
	});

	it("Multi-line FencedCodeBlock", () => {
		const input = new FencedCodeBlockNode(
			'const foo = "Hello world!";\nconsole.log(foo);\nreturn foo;',
			"typescript",
		);

		// Note: HTML <code> elements don't support a language specification like Markdown fenced code blocks do.
		const expected = h("code", [
			{ type: "text", value: 'const foo = "Hello world!";' },
			brElement,
			{ type: "text", value: "console.log(foo);" },
			brElement,
			{ type: "text", value: "return foo;" },
		]);

		assertTransformation(input, expected);
	});
});
