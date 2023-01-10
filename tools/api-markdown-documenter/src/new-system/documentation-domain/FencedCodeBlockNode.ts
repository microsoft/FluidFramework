/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { LineBreakNode } from "./LineBreakNode";
import { compareNodeArrays, createNodesFromPlainText } from "./Utilities";

/**
 * Types allowed as children under {@link FencedCodeBlockNode}.
 */
export type FencedCodeBlockChildren = LineBreakNode | SingleLineElementNode;

/**
 * @example
 * ```md
 * \`\`\`typescrpt
 * const foo = "bar";
 * \`\`\`
 * ```
 */
export class FencedCodeBlockNode extends ParentNodeBase<FencedCodeBlockChildren> {
    /**
     * {@inheritDoc DocumentationNode."type"}
     */
    public readonly type = DocumentationNodeType.FencedCode;

    /**
     * (optional) code language to associated with the code block.
     */
    public readonly language?: string;

    public constructor(children: FencedCodeBlockChildren[], language?: string) {
        super(children);
        this.language = language;
    }

    /**
     * Generates an `FencedCodeBlockNode` from the provided string.
     * @param text - The node contents.
     * @param language - (optional) code language to associated with the code block.
     */
    public static createFromPlainText(text: string, language?: string): FencedCodeBlockNode {
        return new FencedCodeBlockNode(createNodesFromPlainText(text), language);
    }

    /**
     * {@inheritDoc DocumentationNode.equals}
     */
    public equals(other: DocumentationNode): boolean {
        if (this.type !== other.type) {
            return false;
        }

        const otherHeading = other as FencedCodeBlockNode;

        if (this.language !== otherHeading.language) {
            return false;
        }

        return compareNodeArrays(this.children, otherHeading.children);
    }
}
