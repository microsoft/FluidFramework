/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { Parent as UnistParent } from "unist";

import { DocumentationNodeType } from "./DocumentationNodeType";
import { DocumentationNode } from "./DocumentionNode";
import { ParagraphNode } from "./ParagraphNode";

/**
 * Represents the root of a document.
 *
 * @remarks Note that this node is special. It forms the root of a Documentation tree,
 * and cannot be parented under other Documentation nodes.
 */
export class DocumentNode implements UnistParent<DocumentationNode> {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.Document;

	/**
	 * {@inheritDoc DocumentationNode.children}
	 */
	public readonly children: DocumentationNode[];

	/**
	 * Path to which the resulting document should be saved.
	 */
	public readonly filePath: string;

	/**
	 * Optional document title.
	 */
	public readonly title?: string;

	/**
	 * Optional document front-matter, to be appended above all other content.
	 */
	public readonly frontMatter?: string;

	/**
	 * Optional document header section.
	 */
	public readonly header?: ParagraphNode;

	/**
	 * Optional document footer section.
	 */
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
