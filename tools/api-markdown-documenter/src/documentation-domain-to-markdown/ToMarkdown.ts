/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Root as MdastRoot } from "mdast";

import type { DocumentNode } from "../documentation-domain/index.js";

import { createTransformationContext } from "./TransformationContext.js";
import type { TransformationConfiguration } from "./configuration/index.js";

/**
 * Generates an HTML AST from the provided {@link DocumentNode}.
 *
 * @param document - The document to transform.
 * @param config - HTML transformation configuration.
 *
 * @beta
 */
export function documentToMarkdown(
	document: DocumentNode,
	config: TransformationConfiguration,
): MdastRoot {
	const transformationContext = createTransformationContext(config);
	const { transformations } = transformationContext;

	const transformedChildren = document.children.map((child) =>
		transformations[child.type](child, transformationContext),
	);

	return {
		type: "root",
		children: transformedChildren,
	};
}
