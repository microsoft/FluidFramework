/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { UnorderedListNode } from "../../../documentation-domain/index.js";

import { testRender } from "./Utilities.js";

describe("UnorderedListNode Markdown rendering tests", () => {
	describe("Standard context", () => {
		it("Empty list", () => {
			expect(testRender(UnorderedListNode.Empty)).to.equal("\n");
		});

		it("Simple list", () => {
			const text1 = "Item 1";
			const text2 = "Item 2";
			const text3 = "Item 3";

			const input = UnorderedListNode.createFromPlainTextEntries([text1, text2, text3]);
			const result = testRender(input);

			const expected = ["", `- ${text1}`, `- ${text2}`, `- ${text3}`, "", ""].join("\n");

			expect(result).to.equal(expected);
		});
	});

	describe("Table context", () => {
		it("Empty list", () => {
			expect(testRender(UnorderedListNode.Empty, { insideTable: true })).to.equal(
				"<ul></ul>",
			);
		});

		it("Simple list", () => {
			const text1 = "Item 1";
			const text2 = "Item 2";
			const text3 = "Item 3";

			const input = UnorderedListNode.createFromPlainTextEntries([text1, text2, text3]);
			const result = testRender(input, { insideTable: true });

			const expected = `<ul><li>${text1}</li><li>${text2}</li><li>${text3}</li></ul>`;

			expect(result).to.equal(expected);
		});
	});
});
