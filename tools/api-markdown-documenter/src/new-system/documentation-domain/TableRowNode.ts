/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase } from "./DocumentionNode";
import { TableCellNode } from "./TableCellNode";
import { compareNodeArrays } from "./Utilities";

export class TableRowNode extends ParentNodeBase<TableCellNode> {
    /**
     * {@inheritDoc DocumentationNode."type"}
     */
    public readonly type = DocumentationNodeType.TableRow;

    public constructor(cells: TableCellNode[]) {
        super(cells);
    }

    /**
     * {@inheritDoc DocumentationNode.equals}
     */
    public equals(other: DocumentationNode): boolean {
        if (this.type !== other.type) {
            return false;
        }

        const otherRow = other as TableRowNode;

        return compareNodeArrays(this.children, otherRow.children);
    }
}
