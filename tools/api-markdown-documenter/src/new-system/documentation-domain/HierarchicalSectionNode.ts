/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase } from "./DocumentionNode";
import { HeadingNode } from "./HeadingNode";
import { compareNodeArrays } from "./Utilities";

// TODOs:
// - Only Documents and Sections may contain Sections?

/**
 * Represents a hierarchically nested section.
 * Influences things like automatic heading level generation, etc.
 *
 * @example TODO
 */
export class HierarchicalSectionNode extends ParentNodeBase {
    /**
     * {@inheritDoc DocumentationNode."type"}
     */
    public readonly type = DocumentationNodeType.HierarchicalSection;

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

    /**
     * {@inheritDoc DocumentationNode.equals}
     */
    public equals(other: DocumentationNode): boolean {
        if (this.type !== other.type) {
            return false;
        }

        const otherSection = other as HierarchicalSectionNode;

        if (this.heading === undefined) {
            if (otherSection.heading !== undefined) {
                return false;
            }
        } else {
            if (otherSection.heading === undefined) {
                return false;
            }
            if (!this.heading.equals(otherSection.heading)) {
                return false;
            }
        }

        return compareNodeArrays(this.children, otherSection.children);
    }
}
