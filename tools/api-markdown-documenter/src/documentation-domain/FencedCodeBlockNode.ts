/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocumentNodeType } from "./DocumentationNodeType";
import { ParentNodeBase, SingleLineElementNode } from "./DocumentionNode";
import { LineBreakNode } from "./LineBreakNode";
import { PlainTextNode } from "./PlainTextNode";

export type FencedCodeBlockChildren = LineBreakNode | SingleLineElementNode;

/**
 * @example
 * ```md
 * ```typescrpt
 * const foo = "bar";
 * ```
 * ```
 */
export class FencedCodeBlockNode extends ParentNodeBase<FencedCodeBlockChildren> {
    public readonly type = DocumentNodeType.FencedCode;

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
}
