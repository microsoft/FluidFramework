/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { Element as HastElement } from "hast";

import type { ParagraphNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { transformChildrenUnderTag } from "../Utilities.js";

/**
 * Transform a {@link ParagraphNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function paragraphToHtml(
	node: ParagraphNode,
	context: TransformationContext,
): HastElement {
	return transformChildrenUnderTag({ name: "p" }, node.children, context);
}
