/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { h } from "hastscript";

import { ListNode } from "../../documentation-domain/index.js";

import { assertTransformation } from "./Utilities.js";

describe("List HTML transformation tests", () => {
	describe("Ordered", () => {
		it("Empty list", () => {
			assertTransformation(new ListNode([], true), h("ol"));
		});

		it("Simple list", () => {
			const text1 = "Item 1";
			const text2 = "Item 2";
			const text3 = "Item 3";

			const input = ListNode.createFromPlainTextEntries([text1, text2, text3], true);

			const expected = h("ol", [h("li", text1), h("li", text2), h("li", text3)]);

			assertTransformation(input, expected);
		});
	});

	describe("Unordered", () => {
		it("Empty list", () => {
			assertTransformation(new ListNode([], false), h("ul"));
		});

		it("Simple list", () => {
			const text1 = "Item 1";
			const text2 = "Item 2";
			const text3 = "Item 3";

			const input = ListNode.createFromPlainTextEntries([text1, text2, text3], false);

			const expected = h("ul", [h("li", text1), h("li", text2), h("li", text3)]);

			assertTransformation(input, expected);
		});
	});
});
