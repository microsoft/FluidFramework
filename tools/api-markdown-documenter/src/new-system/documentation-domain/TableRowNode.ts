/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { ParentNodeBase } from "./DocumentionNode";
import { TableCellNode } from "./TableCellNode";

export class TableRowNode extends ParentNodeBase<TableCellNode> {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.TableRow;

	public constructor(cells: TableCellNode[]) {
		super(cells);
	}
}
