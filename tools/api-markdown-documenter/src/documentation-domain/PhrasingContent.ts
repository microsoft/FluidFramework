/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { CodeSpanNode } from "./CodeSpanNode.js";
import type { LineBreakNode } from "./LineBreakNode.js";
import type { LinkNode } from "./LinkNode.js";
import type { PlainTextNode } from "./PlainTextNode.js";
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
 * @public
 */
export interface PhrasingContentMap {
	codeSpan: CodeSpanNode;
	lineBreak: LineBreakNode;
	link: LinkNode;
	span: SpanNode;
	text: PlainTextNode;
}

/**
 * Union of all kinds of {@link DocumentationNode} that can occur as "phrasing content" (required by {@link ParagraphNode}s, {@link SpanNode}s, etc.).
 *
 * @remarks To register custom nodes, add them to {@link PhrasingContentMap}.
 *
 * @public
 */
export type PhrasingContent = PhrasingContentMap[keyof PhrasingContentMap];
