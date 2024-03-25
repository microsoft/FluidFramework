/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import {
	TableBodyCellNode,
	TableBodyRowNode,
	TableHeaderCellNode,
	TableHeaderRowNode,
	TableNode,
} from "../../../documentation-domain/index.js";
import { testRender } from "./Utilities.js";

describe("Table HTML rendering tests", () => {
	it("Empty table", () => {
		expect(testRender(TableNode.Empty)).to.equal("<table>\n</table>\n");
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

		const result = testRender(input);

		const expected = [
			"<table>",
			"  <tbody>",
			"    <tr>",
			"      <td>",
			"        Cell 1A",
			"      </td>",
			"      <td>",
			"        Cell 1B",
			"      </td>",
			"      <td>",
			"        Cell 1C",
			"      </td>",
			"    </tr>",
			"    <tr>",
			"      <td>",
			"        Cell 2A",
			"      </td>",
			"      <td>",
			"        Cell 2B",
			"      </td>",
			"    </tr>",
			"  </tbody>",
			"</table>",
			"",
		].join("\n");

		expect(result).to.equal(expected);
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

		const result = testRender(input);

		const expected = [
			"<table>",
			"  <thead>",
			"    <tr>",
			"      <th>",
			"        Header A",
			"      </th>",
			"      <th>",
			"        Header B",
			"      </th>",
			"      <th>",
			"        Header C",
			"      </th>",
			"    </tr>",
			"  </thead>",
			"  <tbody>",
			"    <tr>",
			"      <td>",
			"        Cell 1A",
			"      </td>",
			"      <td>",
			"        Cell 1B",
			"      </td>",
			"    </tr>",
			"    <tr>",
			"      <td>",
			"        Cell 2A",
			"      </td>",
			"      <td>",
			"        Cell 2B",
			"      </td>",
			"      <td>",
			"        Cell 2C",
			"      </td>",
			"    </tr>",
			"  </tbody>",
			"</table>",
			"",
		].join("\n");

		expect(result).to.equal(expected);
	});
});
