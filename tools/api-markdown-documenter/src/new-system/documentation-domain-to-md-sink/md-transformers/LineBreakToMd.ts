/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { LineBreakNode } from "../../documentation-domain";
import type { DocumentationNodeRenderer } from "./DocumentationNodeRenderer";
import { standardEOL } from "./Utilities";

/**
 * Renders a {@link LineBreakNode}.
 *
 * @param node - LineBreakNode to convert into markdown
 * @param context - Rendering context.
 */
export function LineBreakToMarkdown(
	node: LineBreakNode,
	context: DocumentationNodeRenderer,
): string {
	return context.isInsideTable ? `<br/>` : standardEOL;
}
