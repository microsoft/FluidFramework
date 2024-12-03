/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { h } from "hastscript";

import {
	TableBodyCellNode,
	TableBodyRowNode,
	TableHeaderCellNode,
	TableHeaderRowNode,
	TableNode,
} from "../../documentation-domain/index.js";

import { assertTransformation } from "./Utilities.js";

describe("Table HTML rendering tests", () => {
	it("Empty table", () => {
		assertTransformation(TableNode.Empty, h("table"));
	});

	it("Simple table without header", () => {
		const input = new TableNode([
			new TableBodyRowNode([
				TableBodyCellNode.createFromPlainText("Cell 1A"),
				TableBodyCellNode.createFromPlainText("Cell 1B"),
				TableBodyCellNode.createFromPlainText("Cell 1C"),
			]),
			new TableBodyRowNode([
				TableBodyCellNode.createFromPlainText("Cell 2A"),
				TableBodyCellNode.createFromPlainText("Cell 2B"),
			]),
		]);

		const expected = h("table", [
			h("tbody", [
				h("tr", [h("td", "Cell 1A"), h("td", "Cell 1B"), h("td", "Cell 1C")]),
				h("tr", [h("td", "Cell 2A"), h("td", "Cell 2B")]),
			]),
		]);
		assertTransformation(input, expected);
	});

	it("Simple table with header", () => {
		const input = new TableNode(
			[
				new TableBodyRowNode([
					TableBodyCellNode.createFromPlainText("Cell 1A"),
					TableBodyCellNode.createFromPlainText("Cell 1B"),
				]),
				new TableBodyRowNode([
					TableBodyCellNode.createFromPlainText("Cell 2A"),
					TableBodyCellNode.createFromPlainText("Cell 2B"),
					TableBodyCellNode.createFromPlainText("Cell 2C"),
				]),
			],
			/* headingRow: */ new TableHeaderRowNode([
				TableHeaderCellNode.createFromPlainText("Header A"),
				TableHeaderCellNode.createFromPlainText("Header B"),
				TableHeaderCellNode.createFromPlainText("Header C"),
			]),
		);

		const expected = h("table", [
			h("thead", [h("tr", [h("th", "Header A"), h("th", "Header B"), h("th", "Header C")])]),
			h("tbody", [
				h("tr", [h("td", "Cell 1A"), h("td", "Cell 1B")]),
				h("tr", [h("td", "Cell 2A"), h("td", "Cell 2B"), h("td", "Cell 2C")]),
			]),
		]);

		assertTransformation(input, expected);
	});
});
