/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { Parent as UnistParent } from "unist";

import { DocumentationNodeType } from "./DocumentationNodeType";
import { SectionNode } from "./SectionNode";

/**
 * {@link DocumentNode} construction properties.
 */
export interface DocumentNodeProps {
	/**
	 * Child nodes.
	 *
	 * @see {@link https://github.com/syntax-tree/unist#parent}.
	 */
	readonly children: SectionNode[];

	/**
	 * Path to which the resulting document should be saved.
	 */
	readonly filePath: string;

	/**
	 * Optional document front-matter, to be appended above all other content.
	 */
	readonly frontMatter?: string;
}

/**
 * Represents the root of a document.
 *
 * @remarks
 *
 * Note that this node is special.
 * It forms the root of a Documentation tree, and cannot be parented under other {@link DocumentationNode}s.
 */
export class DocumentNode implements UnistParent<SectionNode>, DocumentNodeProps {
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.Document;

	/**
	 * {@inheritDoc DocumentNodeProps.children}
	 */
	public readonly children: SectionNode[];

	/**
	 * {@inheritDoc DocumentNodeProps.filePath}
	 */
	public readonly filePath: string;

	/**
	 * {@inheritDoc DocumentNodeProps.frontMatter}
	 */
	public readonly frontMatter?: string;

	public constructor(props: DocumentNodeProps) {
		this.children = props.children;
		this.filePath = props.filePath;
		this.frontMatter = props.frontMatter;
	}
}
