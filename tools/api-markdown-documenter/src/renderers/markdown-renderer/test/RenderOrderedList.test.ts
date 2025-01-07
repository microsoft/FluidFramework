/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { OrderedListNode } from "../../../documentation-domain/index.js";

import { testRender } from "./Utilities.js";

describe("OrderedListNode Markdown rendering tests", () => {
	describe("Standard context", () => {
		it("Empty list", () => {
			expect(testRender(OrderedListNode.Empty)).to.equal("\n");
		});

		it("Simple list", () => {
			const text1 = "Item 1";
			const text2 = "Item 2";
			const text3 = "Item 3";

			const input = OrderedListNode.createFromPlainTextEntries([text1, text2, text3]);
			const result = testRender(input);

			const expected = ["", `1. ${text1}`, `1. ${text2}`, `1. ${text3}`, "", ""].join("\n");

			expect(result).to.equal(expected);
		});
	});

	describe("Table context", () => {
		it("Empty list", () => {
			expect(testRender(OrderedListNode.Empty, { insideTable: true })).to.equal("<ol></ol>");
		});

		it("Simple list", () => {
			const text1 = "Item 1";
			const text2 = "Item 2";
			const text3 = "Item 3";

			const input = OrderedListNode.createFromPlainTextEntries([text1, text2, text3]);
			const result = testRender(input, { insideTable: true });

			const expected = [
				"<ol>",
				"<li>",
				`${text1}`,
				"</li>",
				"<li>",
				`${text2}`,
				"</li>",
				"<li>",
				`${text3}`,
				"</li>",
				"</ol>",
			].join("");

			expect(result).to.equal(expected);
		});
	});
});
