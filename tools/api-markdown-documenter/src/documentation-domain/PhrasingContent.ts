/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { MarkdownPhrasingContentNode } from "./MarkdownNode.js";
import type { SpanNode } from "./SpanNode.js";

/**
 * Registry of all kinds of {@link DocumentationNode} that can occur as "phrasing content" (required by {@link ParagraphNode}s, {@link SpanNode}s, etc.).
 *
 * @remarks
 *
 * This interface can be augmented to register custom node types:
 *
 * ```typescript
 * declare module '@fluid-tools/api-markdown-documenter' {
 *   interface PhrasingContentMap {
 *     newContentType: NewContentTypeNode;
 *   }
 * }
 * ```
 *
 * For a union of all phrasing content types, see {@link PhrasingContent}.
 *
 * @privateRemarks
 * For more information on the concept of "phrasing content", see {@link https://github.com/syntax-tree/mdast?tab=readme-ov-file#content-model}.
 *
 * @public
 */
export interface PhrasingContentMap {
	span: SpanNode;
	markdownPhrasingContent: MarkdownPhrasingContentNode;
}

/**
 * Union of all kinds of {@link DocumentationNode} that can occur as "phrasing content" (required by {@link ParagraphNode}s, {@link SpanNode}s, etc.).
 *
 * @remarks To register custom nodes, add them to {@link PhrasingContentMap}.
 *
 * @public
 */
export type PhrasingContent = PhrasingContentMap[keyof PhrasingContentMap];
