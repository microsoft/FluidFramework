/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { Parent as UnistParent } from "unist";

import { DocumentationNodeType } from "./DocumentationNodeType";
import { SectionNode } from "./SectionNode";

/**
 * {@link DocumentNode} construction properties.
 *
 * @public
 */
export interface DocumentNodeProperties {
	/**
	 * Metadata for the document
	 */
	readonly documentItemMetadata: DocumentItemMetadata;

	/**
	 * Child nodes.
	 *
	 * @see {@link https://github.com/syntax-tree/unist#parent}.
	 */
	readonly children: SectionNode[];

	/**
	 * Path to which the resulting document should be saved.
	 *
	 * @remarks Does not include the file extension, as this domain has no concept of what kind of file will be produced.
	 */
	readonly documentPath: string;

	/**
	 * Optional document front-matter, to be appended above all other content.
	 */
	readonly frontMatter?: string;
}

/**
 * {@link DocumentNode} construction properties.
 */
interface DocumentItemMetadata {
	/**
	 * Name of the API item from which this document node was generated.
	 */
	readonly apiItemName: string;
	readonly apiItemKind: string;
	readonly packageName: string | undefined;
}

/**
 * Represents the root of a document.
 *
 * @remarks
 *
 * Note that this node is special.
 * It forms the root of a Documentation tree, and cannot be parented under other {@link DocumentationNode}s.
 *
 * @public
 */
export class DocumentNode implements UnistParent<SectionNode>, DocumentNodeProperties {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.Document;

	/**
	 * {@inheritDoc DocumentNodeProperties.documentItemMetadata}
	 */
	public readonly documentItemMetadata: DocumentItemMetadata;

	/**
	 * {@inheritDoc DocumentNodeProperties.children}
	 */
	public readonly children: SectionNode[];

	/**
	 * {@inheritDoc DocumentNodeProperties.documentPath}
	 */
	public readonly documentPath: string;

	/**
	 * {@inheritDoc DocumentNodeProperties.frontMatter}
	 */
	public readonly frontMatter?: string;

	public constructor(properties: DocumentNodeProperties) {
		this.documentItemMetadata = properties.documentItemMetadata;
		this.children = properties.children;
		this.documentPath = properties.documentPath;
		this.frontMatter = properties.frontMatter;
	}
}
