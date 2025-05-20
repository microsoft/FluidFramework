/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BlockQuoteNode } from "./BlockQuoteNode.js";
import {
	DocumentationParentNodeBase,
	type MultiLineDocumentationNode,
} from "./DocumentationNode.js";
import { DocumentationNodeType } from "./DocumentationNodeType.js";
import type { FencedCodeBlockNode } from "./FencedCodeBlockNode.js";
import type { HeadingNode } from "./HeadingNode.js";
import type { HorizontalRuleNode } from "./HorizontalRuleNode.js";
import type { LineBreakNode } from "./LineBreakNode.js";
import type { OrderedListNode } from "./OrderedListNode.js";
import type { ParagraphNode } from "./ParagraphNode.js";
import type { TableNode } from "./TableNode.js";
import type { UnorderedListNode } from "./UnorderedListNode.js";

/**
 * Registry of all kinds of {@link DocumentationNode} that can occur as children of {@link SectionNode}.
 *
 * @remarks
 *
 * This interface can be augmented to register custom node types:
 *
 * ```typescript
 * declare module '@fluid-tools/api-markdown-documenter' {
 *   interface SectionContentMap {
 *     newContentType: NewContentTypeNode;
 *   }
 * }
 * ```
 *
 * For a union of all {@link SectionNode} children, see {@link SectionContent}.
 *
 * @public
 */
export interface SectionContentMap {
	blockquote: BlockQuoteNode;
	fencedCodeBlock: FencedCodeBlockNode;
	horizontalRule: HorizontalRuleNode;
	lineBreak: LineBreakNode;
	orderedList: OrderedListNode;
	paragraph: ParagraphNode;
	section: SectionNode;
	table: TableNode;
	unorderedList: UnorderedListNode;
}

/**
 * Union of all kinds of {@link DocumentationNode} that can occur as children of {@link SectionNode}
 *
 * @remarks To register custom nodes, add them to {@link SectionContentMap}.
 *
 * @public
 */
export type SectionContent = SectionContentMap[keyof SectionContentMap];

/**
 * Represents a hierarchically nested section.
 * Influences things like automatic heading level generation.
 *
 * @example Markdown
 *
 * ```md
 * # Heading Text
 *
 * Section contents...
 * ```
 *
 * @example HTML
 *
 * ```html
 * <section>
 * 	<h1>
 * 		Heading Text
 * 	</h1>
 * 	Section contents...
 * </section>
 * ```
 *
 * @public
 */
export class SectionNode
	extends DocumentationParentNodeBase<SectionContent>
	implements MultiLineDocumentationNode
{
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.Section;

	/**
	 * Optional heading to display for the section.
	 *
	 * @remarks If not specified, no heading will be displayed in the section contents.
	 * Note that this section will still influence heading hierarchy of child contents regardless.
	 */
	public readonly heading?: HeadingNode;

	/**
	 * Empty section singleton.
	 */
	public static readonly Empty = new SectionNode([]);

	/**
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	public override get singleLine(): false {
		return false;
	}

	public constructor(children: SectionContent[], heading?: HeadingNode) {
		super(children);

		this.heading = heading;
	}
}
