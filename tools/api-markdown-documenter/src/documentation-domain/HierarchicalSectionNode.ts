/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase } from "./DocumentionNode";

// TODOs:
// - Only Documents and Sections may contain Sections?
// - Explicitly take in a Heading?

/**
 * Represents a hierarchically nested section.
 * Influences things like automatic heading level generation, etc.
 *
 * @example TODO
 */
export class HierarchicalSectionNode extends ParentNodeBase {
    public readonly type = DocumentNodeType.HierarchicalSection;

    public constructor(children: DocumentationNode[]) {
        super(children);
    }
}
