/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase } from "./DocumentionNode";
import { TableRowNode } from "./TableRowNode";
import { compareNodeArrays } from "./Utilities";

// TODOs:
// - Support alignment properties in Table, TableRow and TableCell (inherit pattern for resolution)

export class TableNode extends ParentNodeBase<TableRowNode> {
    /**
     * {@inheritDoc DocumentationNode."type"}
     */
    public readonly type = DocumentationNodeType.Table;

    public readonly headingRow?: TableRowNode;

    public constructor(bodyRows: TableRowNode[], headingRow?: TableRowNode) {
        super(bodyRows);
        this.headingRow = headingRow;
    }

    /**
     * {@inheritDoc DocumentationNode.equals}
     */
    public equals(other: DocumentationNode): boolean {
        if (this.type !== other.type) {
            return false;
        }

        const otherTable = other as TableNode;

        if (this.headingRow === undefined) {
            if (otherTable.headingRow !== undefined) {
                return false;
            }
        } else {
            if (otherTable.headingRow === undefined) {
                return false;
            }
            if (!this.headingRow.equals(otherTable.headingRow)) {
                return false;
            }
        }

        return compareNodeArrays(this.children, otherTable.children);
    }
}
