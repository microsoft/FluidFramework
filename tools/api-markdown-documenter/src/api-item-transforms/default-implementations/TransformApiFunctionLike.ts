/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { HierarchicalSection } from "../../mdast/index.js";
import type { ApiFunctionLike } from "../../utilities/index.js";
import type { ApiItemTransformationConfiguration } from "../configuration/index.js";
import { createParametersSection, createReturnsSection } from "../helpers/index.js";

/**
 * Default documentation transform for function-like API items (constructors, functions, methods).
 */
export function transformApiFunctionLike(
	apiFunctionLike: ApiFunctionLike,
	config: ApiItemTransformationConfiguration,
): HierarchicalSection[] {
	const childSections: HierarchicalSection[] = [];

	// Render parameter table (if any parameters)
	const renderedParameterTable = createParametersSection(apiFunctionLike, config);
	if (renderedParameterTable !== undefined) {
		childSections.push(renderedParameterTable);
	}

	// Render `@returns` block (if any)
	const renderedReturnsSection = createReturnsSection(apiFunctionLike, config);
	if (renderedReturnsSection !== undefined) {
		childSections.push(renderedReturnsSection);
	}

	return config.defaultSectionLayout(apiFunctionLike, childSections, config);
}
