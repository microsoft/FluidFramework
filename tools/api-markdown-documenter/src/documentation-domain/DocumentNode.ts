/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Parent as UnistParent } from "unist";

import { DocumentNodeType } from "./DocumentationNodeType";
import { DocumentationNode } from "./DocumentionNode";

// TODOs:
// - Take in an optional title?
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

    public constructor(children: DocumentationNode[], filePath: string) {
        this.children = children;
        this.filePath = filePath;
    }
}
