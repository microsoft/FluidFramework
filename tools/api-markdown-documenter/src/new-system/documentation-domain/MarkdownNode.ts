/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Parent as MdastParent } from "mdast";

import { DocumentNodeType } from "./DocumentationNodeType";
import { LiteralNode } from "./DocumentionNode";

// TODOs:
// - Make sure we don't escape contents.
// - Probably document this as being a bit unsafe, since we won't escape anything when rendering?

export class MarkdownNode implements LiteralNode<MdastParent> {
    public readonly type = DocumentNodeType.Markdown;
    public readonly value: MdastParent;

    public constructor(child: MdastParent) {
        this.value = child;
    }
}
