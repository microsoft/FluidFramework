/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase } from "./DocumentionNode";

/**
 *
 * @example
 * ```md
 * > Foo
 * >
 * > Bar
 * ```
 */
export class BlockQuoteNode extends ParentNodeBase {
    public readonly type = DocumentNodeType.BlockQuote;

    public constructor(children: DocumentationNode[]) {
        super(children);
    }
}
