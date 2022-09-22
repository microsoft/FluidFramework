/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase } from "./DocumentionNode";
import { HeadingNode } from "./HeadingNode";

// TODOs:
// - Only Documents and Sections may contain Sections?

/**
 * Represents a hierarchically nested section.
 * Influences things like automatic heading level generation, etc.
 *
 * @example TODO
 */
export class HierarchicalSectionNode extends ParentNodeBase {
    public readonly type = DocumentNodeType.HierarchicalSection;

    /**
     * Optional heading to display for the section.
     *
     * @remarks If not specified, no heading will be displayed in the section contents.
     * Note that this section will still influence heading hierarchy of child contents regardless.
     */
    public readonly heading?: HeadingNode;

    public constructor(children: DocumentationNode[], heading?: HeadingNode) {
        super(children);
        this.heading = heading;
    }
}
