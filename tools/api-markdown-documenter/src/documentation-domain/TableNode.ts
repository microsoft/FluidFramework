/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { ParentNodeBase } from "./DocumentionNode";
import { TableRowNode } from "./TableRowNode";

// TODOs:
// - Support alignment properties in Table, TableRow and TableCell (inherit pattern for resolution)

export class TableNode extends ParentNodeBase<TableRowNode> {
	/**
	 * Static singleton representing an empty Table node.
	 */
	public static readonly Empty = new TableNode([]);

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.Table;

	public readonly headingRow?: TableRowNode;

	public constructor(bodyRows: TableRowNode[], headingRow?: TableRowNode) {
		super(bodyRows);
		this.headingRow = headingRow;
	}
}
