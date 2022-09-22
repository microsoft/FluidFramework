/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Parent as UnistParent } from "unist";

import { DocumentNodeType } from "./DocumentationNodeType";
import { DocumentationNode } from "./DocumentionNode";
import { ParagraphNode } from "./ParagraphNode";

// TODOs:
// - Take in optional front-matter?
// - Take in optional Header / footer?

/**
 * Represents the root of a document.
 *
 * @remarks Note that this node is special. It forms the root of a Documentation tree,
 * and cannot be parented under other Documentation nodes.
 */
export class DocumentNode implements UnistParent<DocumentationNode> {
    public readonly type = DocumentNodeType.Document;

    public readonly children: DocumentationNode[];
    public readonly filePath: string;
    public readonly title?: string;
    public readonly frontMatter?: string;
    public readonly header?: ParagraphNode;
    public readonly footer?: ParagraphNode;
    public constructor(
        children: DocumentationNode[],
        filePath: string,
        title?: string,
        frontMatter?: string,
        header?: ParagraphNode,
        footer?: ParagraphNode,
    ) {
        this.children = children;
        this.filePath = filePath;
        this.title = title;
        this.frontMatter = frontMatter;
        this.header = header;
        this.footer = footer;
    }
}
