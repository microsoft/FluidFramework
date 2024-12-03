/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DocumentationParentNodeBase,
	type MultiLineDocumentationNode,
} from "./DocumentationNode.js";
import { DocumentationNodeType } from "./DocumentationNodeType.js";
import type { TableBodyRowNode, TableHeaderRowNode } from "./TableRowNode.js";

// TODOs:
// - Support alignment properties in Table, TableRow and TableCell (inherit pattern for resolution)

/**
 * A table, created from a series of {@link TableRowNode | row}s, and an optional {@link TableNode.headerRow | heading row}.
 *
 * @example Markdown
 *
 * ```md
 * | Header A | Header CB | Header C |
 * | --- | --- | --- |
 * | Foo | Bar | Baz |
 * | A | B | C |
 * | 1 | 2| 3 |
 * ```
 *
 * @example HTML
 *
 * ```html
 * <table>
 * 	<thead>
 * 		<tr>
 * 			<th>Header A</th>
 * 			<th>Header B</th>
 * 			<th>Header C</th>
 * 		</tr>
 * 	</thead>
 * 	<tbody>
 * 		<tr>
 * 			<td>Foo</td>
 * 			<td>Bar</td>
 * 			<td>Baz</td>
 * 		</tr>
 * 		<tr>
 * 			<td>A</td>
 * 			<td>B</td>
 * 			<td>C</td>
 * 		</tr>
 * 		<tr>
 * 			<td>1</td>
 * 			<td>2</td>
 * 			<td>3</td>
 * 		</tr>
 * 	</tbody>
 * </table>
 * ```
 *
 * @see
 *
 * - {@link TableCellNode}
 *
 * - {@link TableRowNode}
 *
 * @public
 */
export class TableNode
	extends DocumentationParentNodeBase<TableBodyRowNode>
	implements MultiLineDocumentationNode
{
	/**
	 * Static singleton representing an empty Table node.
	 */
	public static readonly Empty = new TableNode([]);

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.Table;

	/**
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	public override get singleLine(): false {
		return false;
	}

	/**
	 * Optional table header row.
	 */
	public readonly headerRow?: TableHeaderRowNode;

	public constructor(bodyRows: TableBodyRowNode[], headingRow?: TableHeaderRowNode) {
		super(bodyRows);
		this.headerRow = headingRow;
	}
}
