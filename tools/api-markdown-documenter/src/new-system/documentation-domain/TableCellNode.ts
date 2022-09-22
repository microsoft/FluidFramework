/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase } from "./DocumentionNode";
import { PlainTextNode } from "./PlainTextNode";

export class TableCellNode extends ParentNodeBase {
    public readonly type = DocumentNodeType.TableCell;

    public static readonly Empty = new TableCellNode([]);

    public constructor(children: DocumentationNode[]) {
        super(children);
    }

    public static createFromPlainText(text: string): TableCellNode {
        return text.length === 0
            ? TableCellNode.Empty
            : new TableCellNode([new PlainTextNode(text)]);
    }
}
