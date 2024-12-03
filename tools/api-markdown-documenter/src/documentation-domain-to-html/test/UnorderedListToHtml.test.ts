/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { h } from "hastscript";

import { UnorderedListNode } from "../../documentation-domain/index.js";

import { assertTransformation } from "./Utilities.js";

describe("UnorderedListNode HTML rendering tests", () => {
	it("Empty list", () => {
		assertTransformation(UnorderedListNode.Empty, h("ul"));
	});

	it("Simple list", () => {
		const text1 = "Item 1";
		const text2 = "Item 2";
		const text3 = "Item 3";

		const input = UnorderedListNode.createFromPlainTextEntries([text1, text2, text3]);

		const expected = h("ul", [h("li", text1), h("li", text2), h("li", text3)]);

		assertTransformation(input, expected);
	});
});
