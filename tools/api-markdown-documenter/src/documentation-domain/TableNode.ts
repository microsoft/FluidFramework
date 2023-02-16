/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { MultiLineDocumentationNode, ParentNodeBase } from "./DocumentationNode";
import { DocumentationNodeType } from "./DocumentationNodeType";
import { TableRowNode } from "./TableRowNode";

// TODOs:
// - Support alignment properties in Table, TableRow and TableCell (inherit pattern for resolution)

/**
 * TODO
 *
 * @example Markdown
 *
 * ```md
 *
 * ```
 *
 * @example HTML
 *
 * ```html
 *
 * ```
 *
 * @see
 *
 * - {@link TableCellNode}
 * - {@link TableRowNode}
 */
export class TableNode extends ParentNodeBase<TableRowNode> implements MultiLineDocumentationNode {
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

	public readonly headingRow?: TableRowNode;

	public constructor(bodyRows: TableRowNode[], headingRow?: TableRowNode) {
		super(bodyRows);
		this.headingRow = headingRow;
	}
}
