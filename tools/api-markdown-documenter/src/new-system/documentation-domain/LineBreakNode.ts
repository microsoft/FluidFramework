/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentNodeType } from "./DocumentationNodeType";
import { DocumentationNode } from "./DocumentionNode";

export class LineBreakNode implements DocumentationNode {
    /**
     * {@inheritDoc DocumentationNode."type"}
     */
    public readonly type = DocumentNodeType.LineBreak;

    // TODO: do we want this?
    public static readonly Singleton = new LineBreakNode();

    public constructor() {}

    /**
     * {@inheritDoc DocumentationNode.equals}
     */
    public equals(other: DocumentationNode): boolean {
        return other.type === DocumentNodeType.LineBreak;
    }
}
