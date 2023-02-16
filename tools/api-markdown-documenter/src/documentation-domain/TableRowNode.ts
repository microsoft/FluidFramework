/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { ParentNodeBase } from "./DocumentionNode";
import { TableCellNode } from "./TableCellNode";

/**
 * A row in a table.
 *
 * @example Markdown
 *
 * ```md
 * | Cell A | Cell B | Cell C |
 * ```
 *
 * @example HTML
 *
 * ```html
 * <tr>
 * 	<td>Cell A</td>
 * 	<td>Cell B</td>
 * 	<td>Cell C</td>
 * </tr>
 * ```
 *
 * @see
 *
 * - {@link TableNode}
 * - {@link TableCellNode}
 */
export class TableRowNode extends ParentNodeBase<TableCellNode> {
	/**
	 * Static singleton representing an empty Table Row node.
	 */
	public static readonly Empty = new TableRowNode([]);

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.TableRow;

	public constructor(cells: TableCellNode[]) {
		super(cells);
	}
}
