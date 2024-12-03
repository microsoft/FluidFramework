/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { h } from "hastscript";

import { ParagraphNode, PlainTextNode } from "../../documentation-domain/index.js";

import { assertTransformation } from "./Utilities.js";

describe("ParagraphNode HTML rendering tests", () => {
	it("Empty paragraph", () => {
		assertTransformation(ParagraphNode.Empty, h("p", []));
	});

	it("Simple paragraph", () => {
		const text1 = "This is some text. ";
		const text2 = "This is more text!";

		const input = new ParagraphNode([new PlainTextNode(text1), new PlainTextNode(text2)]);
		const expected = h("p", [
			{ type: "text", value: text1 },
			{ type: "text", value: text2 },
		]);
		assertTransformation(input, expected);
	});
});
