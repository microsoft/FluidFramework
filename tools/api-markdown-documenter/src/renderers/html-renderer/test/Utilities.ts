/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { DocumentationNode } from "../../../documentation-domain/index.js";
import {
	documentationNodeToHtml,
	treeFromBody,
} from "../../../documentation-domain-to-html/index.js";
import { renderHtml, type RenderDocumentConfiguration } from "../Render.js";

/**
 * Tests the rendering of an individual {@link DocumentationNode}, returning the generated string content.
 */
export function testRender(
	node: DocumentationNode,
	maybeConfig?: RenderDocumentConfiguration,
): string {
	const config = maybeConfig ?? {};
	const html = treeFromBody([documentationNodeToHtml(node, config)], config);
	return renderHtml(html, config);
}
