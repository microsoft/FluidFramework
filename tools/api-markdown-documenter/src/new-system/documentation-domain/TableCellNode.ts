/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase } from "./DocumentionNode";
import { compareNodeArrays, createNodesFromPlainText } from "./Utilities";

export class TableCellNode extends ParentNodeBase {
    /**
     * {@inheritDoc DocumentationNode."type"}
     */
    public readonly type = DocumentationNodeType.TableCell;

    public static readonly Empty = new TableCellNode([]);

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

    /**
     * {@inheritDoc DocumentationNode.equals}
     */
    public equals(other: DocumentationNode): boolean {
        if (this.type !== other.type) {
            return false;
        }

        const otherCell = other as TableCellNode;

        return compareNodeArrays(this.children, otherCell.children);
    }
}
