/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode, ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { LineBreakNode } from "./LineBreakNode";
import { PlainTextNode } from "./PlainTextNode";
import { compareNodeArrays } from "./Utilities";

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
     * @defaultValue No language tag
     */
    public readonly language?: string;

    public constructor(children: FencedCodeBlockChildren[], language?: string) {
        super(children);
        this.language = language;
    }

    public static createFromPlainText(text: string, language?: string): FencedCodeBlockNode {
        return new FencedCodeBlockNode([new PlainTextNode(text)], language);
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
