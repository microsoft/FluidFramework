/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { type SectionNode } from "../../documentation-domain";
import { type ApiFunctionLike } from "../../utilities";
import { type ApiItemTransformationConfiguration } from "../configuration";
import { createParametersSection, createReturnsSection } from "../helpers";

/**
 * Default documentation transform for function-like API items (constructors, functions, methods).
 */
export function transformApiFunctionLike(
	apiFunctionLike: ApiFunctionLike,
	config: Required<ApiItemTransformationConfiguration>,
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

	return config.createDefaultLayout(apiFunctionLike, childSections, config);
}
