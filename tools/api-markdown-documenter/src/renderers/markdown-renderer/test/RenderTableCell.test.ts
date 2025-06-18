/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import {
	LineBreakNode,
	PlainTextNode,
	SpanNode,
	TableBodyCellNode,
	TableHeaderCellNode,
} from "../../../documentation-domain/index.js";

import { testRender } from "./Utilities.js";

describe("Table Markdown rendering tests", () => {
	describe("Standard context", () => {
		it("Empty table cell", () => {
			expect(testRender(TableBodyCellNode.Empty)).to.equal("");
			expect(testRender(TableHeaderCellNode.Empty)).to.equal("");
		});

		it("Simple table cell", () => {
			const input = TableBodyCellNode.createFromPlainText("Hello World!");

			const result = testRender(input);

			const expected = ["Hello World!"].join("\n");

			expect(result).to.equal(expected);
		});

		it("Cell with complex, multi-line content", () => {
			const input = new TableBodyCellNode([
				new PlainTextNode("Hello world!"),
				LineBreakNode.Singleton,
				new SpanNode([
					SpanNode.createFromPlainText("Meaning of life", { bold: true }),
					new PlainTextNode(": "),
					SpanNode.createFromPlainText("42", { italic: true }),
				]),
			]);

			const result = testRender(input);

			const expected = "Hello world!<br>**Meaning of life**: _42_";
			expect(result).to.equal(expected);
		});
	});
});
