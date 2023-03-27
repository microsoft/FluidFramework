/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiItem, ApiReleaseTagMixin, ReleaseTag } from "@microsoft/api-extractor-model";

import { SectionNode } from "../../documentation-domain";
import { doesItemRequireOwnDocument, getHeadingForApiItem } from "../ApiItemUtilities";
import { ApiItemTransformationConfiguration } from "../configuration";
import {
	betaAlert,
	createDeprecationNoticeSection,
	createExamplesSection,
	createRemarksSection,
	createSeeAlsoSection,
	createSignatureSection,
	createSummaryParagraph,
	createThrowsSection,
	wrapInSection,
} from "../helpers";

/**
 * Default transformation helper for API items that potentially have child contents.
 * Wraps the item-kind-specific details in the following manner:
 *
 * 1. Heading (if not the document-root item, in which case headings are handled specially by document-level rendering)
 * 1. Beta warning (if item annotated with `@beta`)
 * 1. Deprecation notice (if any)
 * 1. Summary (if any)
 * 1. Item Signature
 * 1. Remarks (if any)
 * 1. Examples (if any)
 * 1. `innerSectionBody`
 * 1. Throws (if any)
 * 1. See (if any)
 *
 * @param apiItem - The API item being rendered.
 * @param childContent - A doc section of contents to be written after the standard metadata content types.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function createSectionWithChildContent(
	apiItem: ApiItem,
	childContent: SectionNode[] | undefined,
	config: Required<ApiItemTransformationConfiguration>,
): SectionNode[] {
	const sections: SectionNode[] = [];

	// Render beta warning if applicable
	if (ApiReleaseTagMixin.isBaseClassOf(apiItem) && apiItem.releaseTag === ReleaseTag.Beta) {
		sections.push(wrapInSection([betaAlert]));
	}

	// Render deprecation notice (if any)
	const deprecationNotice = createDeprecationNoticeSection(apiItem, config);
	if (deprecationNotice !== undefined) {
		sections.push(wrapInSection([deprecationNotice]));
	}

	// Render summary comment (if any)
	const summary = createSummaryParagraph(apiItem, config);
	if (summary !== undefined) {
		sections.push(wrapInSection([summary]));
	}

	// Render signature (if any)
	const signature = createSignatureSection(apiItem, config);
	if (signature !== undefined) {
		sections.push(signature);
	}

	// Render @remarks content (if any)
	const renderedRemarks = createRemarksSection(apiItem, config);
	if (renderedRemarks !== undefined) {
		sections.push(renderedRemarks);
	}

	// Render examples (if any)
	const renderedExamples = createExamplesSection(apiItem, config);
	if (renderedExamples !== undefined) {
		sections.push(renderedExamples);
	}

	if (childContent !== undefined) {
		// Flatten contents into this section
		sections.push(...childContent);
	}

	// Render @throws content (if any)
	const renderedThrows = createThrowsSection(apiItem, config);
	if (renderedThrows !== undefined) {
		sections.push(renderedThrows);
	}

	// Render @see content (if any)
	const renderedSeeAlso = createSeeAlsoSection(apiItem, config);
	if (renderedSeeAlso !== undefined) {
		sections.push(renderedSeeAlso);
	}

	// Add heading to top of section only if this is being rendered to a parent item.
	// Document items have their headings handled specially.
	return doesItemRequireOwnDocument(apiItem, config.documentBoundaries)
		? sections
		: [wrapInSection(sections, getHeadingForApiItem(apiItem, config))];
}
