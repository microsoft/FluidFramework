/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentNodeType } from "./DocumentationNodeType";
import { ParentNodeBase } from "./DocumentionNode";
import { TableCellNode } from "./TableCellNode";

export class TableRowNode extends ParentNodeBase<TableCellNode> {
    public readonly type = DocumentNodeType.TableRow;

    public constructor(cells: TableCellNode[]) {
        super(cells);
    }
}
