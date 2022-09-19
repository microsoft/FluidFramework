/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase } from "./DocumentionNode";

export class TableCellNode extends ParentNodeBase {
    public readonly type = DocumentNodeType.TableCell;

    public constructor(children: DocumentationNode[]) {
        super(children);
    }
}
