/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import { TableCellNode, TableNode, TableRowNode } from "../../documentation-domain";
import { testRender } from "./Utilities";

describe("Table rendering tests", () => {
	describe("Markdown", () => {
		it("Empty table", () => {
			expect(testRender(TableNode.Empty)).to.equal("\n");
		});

		it("Simple table without header", () => {
			const input = new TableNode([
				new TableRowNode([
					TableCellNode.createFromPlainText("Cell 1A"),
					TableCellNode.createFromPlainText("Cell 1B"),
					TableCellNode.createFromPlainText("Cell 1C"),
				]),
				new TableRowNode([
					TableCellNode.createFromPlainText("Cell 2A"),
					TableCellNode.createFromPlainText("Cell 2B"),
				]),
			]);

			const result = testRender(input);

			const expected = [
				"",
				"| Cell 1A | Cell 1B | Cell 1C |",
				"| Cell 2A | Cell 2B |",
				"",
				"",
			].join("\n");

			expect(result).to.equal(expected);
		});

		it("Simple table with header", () => {
			const input = new TableNode(
				[
					new TableRowNode([
						TableCellNode.createFromPlainText("Cell 1A"),
						TableCellNode.createFromPlainText("Cell 1B"),
					]),
					new TableRowNode([
						TableCellNode.createFromPlainText("Cell 2A"),
						TableCellNode.createFromPlainText("Cell 2B"),
						TableCellNode.createFromPlainText("Cell 2C"),
					]),
				],
				/* headingRow: */ new TableRowNode([
					TableCellNode.createFromPlainText("Header A"),
					TableCellNode.createFromPlainText("Header B"),
					TableCellNode.createFromPlainText("Header C"),
				]),
			);

			const result = testRender(input);

			const expected = [
				"",
				"| Header A | Header B | Header C |",
				"| --- | --- | --- |",
				"| Cell 1A | Cell 1B |",
				"| Cell 2A | Cell 2B | Cell 2C |",
				"",
				"",
			].join("\n");

			expect(result).to.equal(expected);
		});
	});

	describe("HTML", () => {
		it("Empty table", () => {
			expect(testRender(TableNode.Empty, undefined, { insideHtml: true })).to.equal(
				"<table>\n</table>\n",
			);
		});

		it("Simple table without header", () => {
			const input = new TableNode([
				new TableRowNode([
					TableCellNode.createFromPlainText("Cell 1A"),
					TableCellNode.createFromPlainText("Cell 1B"),
					TableCellNode.createFromPlainText("Cell 1C"),
				]),
				new TableRowNode([
					TableCellNode.createFromPlainText("Cell 2A"),
					TableCellNode.createFromPlainText("Cell 2B"),
				]),
			]);

			const result = testRender(input, undefined, { insideHtml: true });

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
					new TableRowNode([
						TableCellNode.createFromPlainText("Cell 1A"),
						TableCellNode.createFromPlainText("Cell 1B"),
					]),
					new TableRowNode([
						TableCellNode.createFromPlainText("Cell 2A"),
						TableCellNode.createFromPlainText("Cell 2B"),
						TableCellNode.createFromPlainText("Cell 2C"),
					]),
				],
				/* headingRow: */ new TableRowNode([
					TableCellNode.createFromPlainText("Header A"),
					TableCellNode.createFromPlainText("Header B"),
					TableCellNode.createFromPlainText("Header C"),
				]),
			);

			const result = testRender(input, undefined, { insideHtml: true });

			const expected = [
				"<table>",
				"  <thead>",
				"    <tr>",
				"      <td>",
				"        Header A",
				"      </td>",
				"      <td>",
				"        Header B",
				"      </td>",
				"      <td>",
				"        Header C",
				"      </td>",
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
});
