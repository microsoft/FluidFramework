/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { h } from "hastscript";
import { FencedCodeBlockNode, PlainTextNode } from "../../documentation-domain/index.js";
import { assertTransformation } from "./Utilities.js";

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
});
