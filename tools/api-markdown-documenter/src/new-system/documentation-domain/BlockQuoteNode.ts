/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase } from "./DocumentionNode";
import { compareNodeArrays } from "./Utilities";

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
    /**
     * {@inheritDoc DocumentationNode."type"}
     */
    public readonly type = DocumentNodeType.BlockQuote;

    public constructor(children: DocumentationNode[]) {
        super(children);
    }

    /**
     * {@inheritDoc DocumentationNode.equals}
     */
    public equals(other: DocumentationNode): boolean {
        if (this.type !== other.type) {
            return false;
        }

        const otherBlockQuote = other as BlockQuoteNode;

        return compareNodeArrays(this.children, otherBlockQuote.children);
    }
}
