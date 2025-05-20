/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BlockContent } from "./BlockContent.js";
import { DocumentationParentNodeBase } from "./DocumentationNode.js";
import { DocumentationNodeType } from "./DocumentationNodeType.js";
import type { PhrasingContent } from "./PhrasingContent.js";
import { createNodesFromPlainText } from "./Utilities.js";

/**
 * Kind of Table Cell.
 *
 * @public
 */
export enum TableCellKind {
	/**
	 * A cell that lives in the table's header row.
	 *
	 * @see {@link TableHeaderCellNode}
	 */
	Header = "Header",

	/**
	 * A cell that lives in one of the table's body rows.
	 *
	 * @see {@link TableBodyCellNode}
	 */
	Body = "Body",
}

/**
 * The types of child nodes that can be contained within a {@link TableCellNode}.
 *
 * @public
 */
export type TableCellContent = PhrasingContent | BlockContent;

/**
 * A cell within a table.
 *
 * @example Markdown
 *
 * ```md
 * | I'm in a table cell! |
 * ```
 *
 * @example HTML ()
 *
 * ```html
 * <td>I'm in a table cell!</td>
 * ```
 *
 * @see
 *
 * - {@link TableNode}
 *
 * - {@link TableRowNode}
 *
 * @public
 */
export abstract class TableCellNode extends DocumentationParentNodeBase<TableCellContent> {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.TableCell;

	/**
	 * The kind of row this node represents.
	 */
	public readonly cellKind: TableCellKind;

	protected constructor(children: TableCellContent[], cellKind: TableCellKind) {
		super(children);
		this.cellKind = cellKind;
	}
}

/**
 * A {@link TableCellNode} that lives in the heading row of a {@link TableNode}.
 *
 * @public
 */
export class TableHeaderCellNode extends TableCellNode {
	/**
	 * Static singleton representing an empty Table Heading Cell.
	 */
	public static readonly Empty = new TableHeaderCellNode([]);

	public constructor(children: TableCellContent[]) {
		super(children, TableCellKind.Header);
	}

	/**
	 * Generates an `TableCellNode` from the provided string.
	 * @param text - The node contents.
	 */
	public static createFromPlainText(text: string): TableHeaderCellNode {
		return text.length === 0
			? TableHeaderCellNode.Empty
			: new TableHeaderCellNode(createNodesFromPlainText(text));
	}
}

/**
 * A {@link TableCellNode} that lives in the body of a {@link TableNode}.
 *
 * @public
 */
export class TableBodyCellNode extends TableCellNode {
	/**
	 * Static singleton representing an empty Table Body Cell.
	 */
	public static readonly Empty = new TableBodyCellNode([]);

	public constructor(children: TableCellContent[]) {
		super(children, TableCellKind.Body);
	}

	/**
	 * Generates an `TableCellNode` from the provided string.
	 * @param text - The node contents.
	 */
	public static createFromPlainText(text: string): TableBodyCellNode {
		return text.length === 0
			? TableBodyCellNode.Empty
			: new TableBodyCellNode(createNodesFromPlainText(text));
	}
}
