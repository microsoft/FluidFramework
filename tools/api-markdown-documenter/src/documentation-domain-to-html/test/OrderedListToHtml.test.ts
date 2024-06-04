/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { h } from "hastscript";

import { OrderedListNode } from "../../documentation-domain/index.js";
import { assertTransformation } from "./Utilities.js";

describe("OrderedListNode HTML rendering tests", () => {
	it("Empty list", () => {
		assertTransformation(OrderedListNode.Empty, h("ol"));
	});

	it("Simple list", () => {
		const text1 = "Item 1";
		const text2 = "Item 2";
		const text3 = "Item 3";

		const input = OrderedListNode.createFromPlainTextEntries([text1, text2, text3]);

		const expected = h("ol", [h("li", text1), h("li", text2), h("li", text3)]);

		assertTransformation(input, expected);
	});
});
