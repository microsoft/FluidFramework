/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentNodeType } from "./DocumentationNodeType";
import { ParentNodeBase } from "./DocumentionNode";
import { TableRowNode } from "./TableRowNode";

export class TableNode extends ParentNodeBase<TableRowNode> {
    public readonly type = DocumentNodeType.Table;

    public readonly headingRow?: TableRowNode;

    public constructor(bodyRows: TableRowNode[], headingRow?: TableRowNode) {
        super(bodyRows);
        this.headingRow = headingRow;
    }
}
