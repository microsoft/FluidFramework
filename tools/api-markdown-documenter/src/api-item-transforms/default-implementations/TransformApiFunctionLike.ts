/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SectionNode } from "../../documentation-domain/index.js";
import type { ApiFunctionLike } from "../../utilities/index.js";
import type { ApiItemTransformationConfiguration } from "../configuration/index.js";
import { createParametersSection, createReturnsSection } from "../helpers/index.js";

/**
 * Default documentation transform for function-like API items (constructors, functions, methods).
 */
export function transformApiFunctionLike(
	apiFunctionLike: ApiFunctionLike,
	config: ApiItemTransformationConfiguration,
): SectionNode[] {
	const childSections: SectionNode[] = [];

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
