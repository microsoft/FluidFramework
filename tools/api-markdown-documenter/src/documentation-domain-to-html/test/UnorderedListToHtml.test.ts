/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UnorderedListNode } from "../../documentation-domain/index.js";
import { assertExpectedHtml } from "./Utilities.js";

describe("UnorderedListNode HTML rendering tests", () => {
	it("Empty list", () => {
		assertExpectedHtml(UnorderedListNode.Empty, "<ul />");
	});

	it("Simple list", () => {
		const text1 = "Item 1";
		const text2 = "Item 2";
		const text3 = "Item 3";

		const input = UnorderedListNode.createFromPlainTextEntries([text1, text2, text3]);

		assertExpectedHtml(input, `<ul><li>${text1}</li><li>${text2}</li><li>${text3}</li></ul>`);
	});
});
