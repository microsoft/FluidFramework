/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationParentNodeBase } from "./DocumentationNode";
import { DocumentationNodeType } from "./DocumentationNodeType";
import { TableCellNode, TableHeaderCellNode } from "./TableCellNode";

/**
 * Kind of Table Row.
 */
export enum TableRowKind {
	/**
	 * A row that represents the header of a table.
	 *
	 * @see {@link TableHeaderRowNode}
	 */
	Header = "Header",

	/**
	 * A row that lives in the body of a table.
	 *
	 * @see {@link TableBodyRowNode}
	 */
	Body = "Body",
}

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
export abstract class TableRowNode extends DocumentationParentNodeBase<TableCellNode> {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.TableRow;

	/**
	 * The kind of row this node represents.
	 */
	public readonly rowKind: TableRowKind;

	protected constructor(cells: TableCellNode[], rowKind: TableRowKind) {
		super(cells);
		this.rowKind = rowKind;
	}
}

/**
 * A {@link TableRowNode} that represents the header row of a {@link TableNode}.
 */
export class TableHeaderRowNode extends TableRowNode {
	/**
	 * Static singleton representing an empty Table Header Row.
	 */
	public static readonly Empty = new TableHeaderRowNode([]);

	public constructor(cells: TableHeaderCellNode[]) {
		super(cells, TableRowKind.Header);
	}
}

/**
 * A {@link TableRowNode} that lives in the body of a {@link TableNode}.
 */
export class TableBodyRowNode extends TableRowNode {
	/**
	 * Static singleton representing an empty Table Body Row.
	 */
	public static readonly Empty = new TableBodyRowNode([]);

	public constructor(cells: TableCellNode[]) {
		super(cells, TableRowKind.Body);
	}
}
