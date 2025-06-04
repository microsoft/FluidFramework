/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BlockQuoteNode } from "./BlockQuoteNode.js";
import type { DocumentationNodeType } from "./DocumentationNodeType.js";
import type { FencedCodeBlockNode } from "./FencedCodeBlockNode.js";
import type { HorizontalRuleNode } from "./HorizontalRuleNode.js";
import type { OrderedListNode } from "./OrderedListNode.js";
import type { ParagraphNode } from "./ParagraphNode.js";
import type { TableNode } from "./TableNode.js";
import type { UnorderedListNode } from "./UnorderedListNode.js";

/**
 * Registry of all kinds of {@link DocumentationNode} that can occur as "block content" (required by {@link SectionNode}s, {@link TableCellNode}s, etc.).
 *
 * @remarks
 *
 * This interface can be augmented to register custom node types:
 *
 * ```typescript
 * declare module '@fluid-tools/api-markdown-documenter' {
 *   interface BlockContentMap {
 *     newContentType: NewContentTypeNode;
 *   }
 * }
 * ```
 *
 * For a union of all block content types, see {@link BlockContent}.
 *
 * @privateRemarks
 * For more information on the concept of "block content", see {@link https://github.com/syntax-tree/mdast?tab=readme-ov-file#content-model}.
 * Note that the page is out of date relative to their code. The documentation lists "flow content", but that has since been renamed to "block content".
 *
 * @public
 */
export interface BlockContentMap {
	[DocumentationNodeType.BlockQuote]: BlockQuoteNode;
	[DocumentationNodeType.FencedCode]: FencedCodeBlockNode;
	[DocumentationNodeType.HorizontalRule]: HorizontalRuleNode;
	[DocumentationNodeType.OrderedList]: OrderedListNode;
	[DocumentationNodeType.Paragraph]: ParagraphNode;
	[DocumentationNodeType.Table]: TableNode;
	[DocumentationNodeType.UnorderedList]: UnorderedListNode;
}

/**
 * Union of all kinds of {@link DocumentationNode} that can occur as "block content" (required by {@link SectionNode}s, {@link TableCellNode}s, etc.).
 *
 * @remarks To register custom nodes, add them to {@link BlockContentMap}.
 *
 * @public
 */
export type BlockContent = BlockContentMap[keyof BlockContentMap];
