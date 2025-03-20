/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { h } from "hastscript";

import { CodeSpanNode, PlainTextNode } from "../../documentation-domain/index.js";

import { assertTransformation } from "./Utilities.js";

describe("CodeSpan HTML rendering tests", () => {
	it("Empty CodeSpan", () => {
		assertTransformation(CodeSpanNode.Empty, h("code", []));
	});

	it("Simple CodeSpan", () => {
		const input = new CodeSpanNode([new PlainTextNode("console.log('hello world');")]);
		const expected = h("code", [{ type: "text", value: "console.log('hello world');" }]);

		assertTransformation(input, expected);
	});
});
