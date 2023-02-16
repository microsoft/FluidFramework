/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase } from "./DocumentionNode";
import { createNodesFromPlainText } from "./Utilities";

/**
 * A cell within a table.
 *
 * @example Markdown
 *
 * ```md
 * | I'm in a table cell! |
 * ```
 *
 * @example HTML
 *
 * ```html
 * <td>I'm in a table cell!</td>
 * ```
 *
 * @see
 *
 * - {@link TableNode}
 * - {@link TableRowNode}
 */
export class TableCellNode extends ParentNodeBase {
	/**
	 * Static singleton representing an empty Plain Text node.
	 */
	public static readonly Empty = new TableCellNode([]);

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.TableCell;

	public constructor(children: DocumentationNode[]) {
		super(children);
	}

	/**
	 * Generates an `TableCellNode` from the provided string.
	 * @param text - The node contents.
	 */
	public static createFromPlainText(text: string): TableCellNode {
		return text.length === 0
			? TableCellNode.Empty
			: new TableCellNode(createNodesFromPlainText(text));
	}
}
