/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { MarkdownDocumenterConfiguration } from "../../Configuration";
import { SectionNode } from "../../documentation-domain";
import { ApiFunctionLike } from "../../utilities";
import { createParametersSection, createReturnsSection } from "../helpers";

/**
 * Default policy for rendering doc sections for function-like API items
 * (constructors, functions, methods).
 */
export function transformApiFunctionLike(
	apiFunctionLike: ApiFunctionLike,
	config: Required<MarkdownDocumenterConfiguration>,
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

	return config.createChildContentSections(apiFunctionLike, childSections, config);
}
