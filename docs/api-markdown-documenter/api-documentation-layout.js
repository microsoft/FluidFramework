/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: import from our library
const { ReleaseTag } = require("@microsoft/api-extractor-model");
const {
	getDeprecatedBlock,
	getHeadingForApiItem,
	getReleaseTag,
	transformTsdocNode,
} = require("@fluid-tools/api-markdown-documenter");

// TODO: import from root
const {
	doesItemRequireOwnDocument,
} = require("@fluid-tools/api-markdown-documenter/dist/api-item-transforms");
const {
	createExamplesSection,
	createRemarksSection,
	createSeeAlsoSection,
	createSignatureSection,
	createSummaryParagraph,
	createThrowsSection,
	wrapInSection,
} = require("@fluid-tools/api-markdown-documenter/dist/api-item-transforms/helpers");

const { AlertNode } = require("./alert-node");

/**
 * Default content layout for all API items.
 *
 * @remarks Lays out the content in the following manner:
 *
 * 1. Heading (if not the document-root item, in which case headings are handled specially by document-level rendering)
 *
 * 1. Beta warning (if item annotated with `@beta`)
 *
 * 1. Deprecation notice (if any)
 *
 * 1. Summary (if any)
 *
 * 1. Item Signature
 *
 * 1. Remarks (if any)
 *
 * 1. Examples (if any)
 *
 * 1. `itemSpecificContent`
 *
 * 1. Throws (if any)
 *
 * 1. See (if any)
 *
 * @param {@microsoft/api-extractor-model#ApiItem} apiItem - The API item being rendered.
 * @param {@fluid-tools/api-markdown-documenter#SectionNode[] | undefined} itemSpecificContent - API item-specific details to be included in the default layout.
 * @param {@fluid-tools/api-markdown-documenter#ApiItemTransformationConfiguration} config - Transformation configuration.
 *
 * @returns An array of sections describing the layout. See {@link @fluid-tools/api-markdown-documenter#ApiItemTransformationConfiguration.createDefaultLayout}.
 */
function layoutContent(apiItem, itemSpecificContent, config) {
	const sections = [];

	// Render summary comment (if any)
	const summary = createSummaryParagraph(apiItem, config);
	if (summary !== undefined) {
		sections.push(wrapInSection([summary]));
	}

	// Render deprecation notice (if any)
	const deprecationNotice = createDeprecationNoticeSection(apiItem, config);
	if (deprecationNotice !== undefined) {
		sections.push(wrapInSection([deprecationNotice]));
	}

	// Render alpha/beta notice if applicable
	const releaseTag = getReleaseTag(apiItem);
	if (releaseTag === ReleaseTag.Alpha) {
		sections.push(wrapInSection([alphaWarningSpan]));
	} else if (releaseTag === ReleaseTag.Beta) {
		sections.push(wrapInSection([betaWarningSpan]));
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

	// Render provided contents
	if (itemSpecificContent !== undefined) {
		// Flatten contents into this section
		sections.push(...itemSpecificContent);
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

/**
 * Renders a section containing the {@link https://tsdoc.org/pages/tags/deprecated/ | @deprecated} notice documentation
 * of the provided API item if it is annotated as `@deprecated`.
 *
 * @remarks Displayed as a simple note box containing the deprecation notice comment.
 *
 * @param {@microsoft/api-extractor-model#ApiItem} apiItem - The API item being rendered.
 * @param {@fluid-tools/api-markdown-documenter#ApiItemTransformationConfiguration} config - Transformation configuration.
 *
 * @returns The doc section if the API item had a `@remarks` comment, otherwise `undefined`.
 */
function createDeprecationNoticeSection(apiItem, config) {
	const deprecatedBlock = getDeprecatedBlock(apiItem);
	if (deprecatedBlock === undefined) {
		return undefined;
	}

	const transformedDeprecatedBlock = transformTsdocNode(deprecatedBlock, apiItem, config);

	return new AlertNode(
		[transformedDeprecatedBlock],
		"Warning",
		"This API is deprecated and will be removed in a future release.",
	);
}

module.exports = {
	layoutContent,
};
