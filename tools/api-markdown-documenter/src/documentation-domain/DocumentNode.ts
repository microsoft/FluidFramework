/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { Parent as UnistParent } from "unist";

import { ApiItemKind } from "@microsoft/api-extractor-model";
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
 * Metadata of a {@link DocumentNode} in terms of its API.
 *
 * @remarks
 * `DocumentItemMetadata` aids in tracing a documentation node to its API, useful for cross-referencing and integrations.
 *
 * @public
 */
export interface DocumentItemMetadata {
	/**
	 * Name of the original API, e.g., class or function, from which this documentation node is derived.
	 */
	readonly apiItemName: string;

	/**
	 * Category or type of the API like 'class' or 'function'.
	 */
	readonly apiItemKind: ApiItemKind;

	/**
	 * Originating package name for the API.
	 * @remarks documents corresponding to an entity that doesn't belong to a package (e.g. an ApiModel) will not have this field set.
	 */
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
	 * {@inheritDoc DocumentNodeProps.documentItemMetadata}
	 */
	public readonly documentItemMetadata: DocumentItemMetadata;

	/**
	 * {@inheritDoc DocumentNodeProps.children}
	 */
	public readonly children: SectionNode[];

	/**
	 * {@inheritDoc DocumentNodeProps.documentPath}
	 */
	public readonly documentPath: string;

	/**
	 * {@inheritDoc DocumentNodeProps.frontMatter}
	 */
	public readonly frontMatter?: string;

	public constructor(properties: DocumentNodeProperties) {
		this.documentItemMetadata = properties.documentItemMetadata;
		this.children = properties.children;
		this.documentPath = properties.documentPath;
		this.frontMatter = properties.frontMatter;
	}
}
