/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { DocumentationNode } from "../../../documentation-domain/index.js";
import { DocumentWriter } from "../../DocumentWriter.js";
import { renderNode } from "../Render.js";
import { type RenderContext, getContextWithDefaults } from "../RenderContext.js";

/**
 * Tests the rendering of an individual {@link DocumentationNode}, returning the generated string content.
 */
export function testRender(
	node: DocumentationNode,
	partialContext?: Partial<RenderContext>,
): string {
	const context = getContextWithDefaults(partialContext);
	const writer = DocumentWriter.create();

	renderNode(node, writer, context);

	return writer.getText();
}
