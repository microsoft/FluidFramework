/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Html as MdastHtml } from "mdast";

import { renderHtml } from "../../HtmlRendererModule.js";
import type { DocumentationNode } from "../../documentation-domain/index.js";
import {
	documentationNodeToHtml,
	type TransformationConfiguration as HtmlTransformationConfiguration,
} from "../../documentation-domain-to-html/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transforms the provided {@link DocumentationNode}s using HTML syntax.
 */
export function transformAsHtml(
	nodes: DocumentationNode,
	context: TransformationContext,
): MdastHtml {
	const htmlTransformationConfig: HtmlTransformationConfiguration = {
		startingHeadingLevel: context.headingLevel,
		logger: context.logger,
	};
	const htmlTree = documentationNodeToHtml(nodes, htmlTransformationConfig);
	const htmlString = renderHtml(htmlTree, {});

	return {
		type: "html",
		value: htmlString,
	};
}
