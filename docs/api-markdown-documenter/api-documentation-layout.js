/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ApiItemUtilities,
	CodeSpanNode,
	HeadingNode,
	LayoutUtilities,
	LineBreakNode,
	LinkNode,
	PlainTextNode,
	ReleaseTag,
	SectionNode,
	SpanNode,
	transformTsdocNode,
} from "@fluid-tools/api-markdown-documenter";

import { AlertNode } from "./alert-node.js";

const customExamplesSectionTitle = "Usage";
const customThrowsSectionTitle = "Error Handling";

const supportDocsLinkSpan = new SpanNode([
	new PlainTextNode("For more information about our API support guarantees, see "),
	LinkNode.createFromPlainText(
		"here",
		"https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels",
	),
	new PlainTextNode("."),
]);

// Temporary workaround for items tagged as `@alpha` (to mean "legacy").
// This messaging should be changed back to standard "alpha" terminology once we have
// cleaned up our tag meanings.
function createAlphaWarning(apiItem) {
	const packageName = apiItem.getAssociatedPackage().displayName;
	return new AlertNode(
		[
			new SpanNode([
				new PlainTextNode("To use, import via "),
				CodeSpanNode.createFromPlainText(`${packageName}/legacy`),
				new PlainTextNode("."),
			]),
			LineBreakNode.Singleton,
			supportDocsLinkSpan,
		],
		/* alertKind: */ "note",
		/* title: */ "This API is provided for existing users, but is not recommended for new users.",
	);
}

function createBetaWarning(apiItem) {
	const packageName = apiItem.getAssociatedPackage().displayName;
	return new AlertNode(
		[
			new SpanNode([
				new PlainTextNode("To use, import via "),
				CodeSpanNode.createFromPlainText(`${packageName}/beta`),
				new PlainTextNode("."),
			]),
			LineBreakNode.Singleton,
			supportDocsLinkSpan,
		],
		/* alertKind: */ "warning",
		/* title: */ "This API is provided as a beta preview and may change without notice.",
	);
}

/**
 * Default content layout for all API items.
 *
 * @remarks Lays out the content in the following manner:
 *
 * 1. Summary (if any)
 *
 * 1. Deprecation notice (if any)
 *
 * 1. Alpha/Beta warning (if item annotated with `@alpha` or `@beta`)
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
export function layoutContent(apiItem, itemSpecificContent, config) {
	const sections = [];

	// Render summary comment (if any)
	const summary = LayoutUtilities.createSummaryParagraph(apiItem, config);
	if (summary !== undefined) {
		sections.push(new SectionNode([summary]));
	}

	// Render deprecation notice (if any)
	const deprecationNotice = createDeprecationNoticeSection(apiItem, config);
	if (deprecationNotice !== undefined) {
		sections.push(new SectionNode([deprecationNotice]));
	}

	// Render alpha/beta notice if applicable
	const releaseTag = ApiItemUtilities.getReleaseTag(apiItem);
	if (releaseTag === ReleaseTag.Alpha) {
		sections.push(new SectionNode([createAlphaWarning(apiItem)]));
	} else if (releaseTag === ReleaseTag.Beta) {
		sections.push(new SectionNode([createBetaWarning(apiItem)]));
	}

	// Render signature (if any)
	const signature = LayoutUtilities.createSignatureSection(apiItem, config);
	if (signature !== undefined) {
		sections.push(signature);
	}

	// Render @remarks content (if any)
	const renderedRemarks = LayoutUtilities.createRemarksSection(apiItem, config);
	if (renderedRemarks !== undefined) {
		sections.push(renderedRemarks);
	}

	// Render examples (if any)
	const renderedExamples = LayoutUtilities.createExamplesSection(
		apiItem,
		config,
		customExamplesSectionTitle,
	);
	if (renderedExamples !== undefined) {
		sections.push(renderedExamples);
	}

	// Render provided contents
	if (itemSpecificContent !== undefined) {
		// Flatten contents into this section
		sections.push(...itemSpecificContent);
	}

	// Render @throws content (if any)
	const renderedThrows = LayoutUtilities.createThrowsSection(
		apiItem,
		config,
		customThrowsSectionTitle,
	);
	if (renderedThrows !== undefined) {
		sections.push(renderedThrows);
	}

	// Render @see content (if any)
	const renderedSeeAlso = LayoutUtilities.createSeeAlsoSection(apiItem, config);
	if (renderedSeeAlso !== undefined) {
		sections.push(renderedSeeAlso);
	}

	// Add heading to top of section only if this is being rendered to a parent item.
	// Document items have their headings handled specially.
	return ApiItemUtilities.doesItemRequireOwnDocument(apiItem, config.documentBoundaries)
		? sections
		: [
				new SectionNode(
					sections,
					HeadingNode.createFromPlainTextHeading(
						ApiItemUtilities.getHeadingForApiItem(apiItem, config),
					),
				),
			];
}

/**
 * Renders a section containing the {@link https://tsdoc.org/pages/tags/deprecated/ | @deprecated} notice documentation
 * of the provided API item if it is annotated as `@deprecated`.
 *
 * @remarks Displayed as a Hugo-formatted alert. See {@link AlertNode} and {@link renderAlertNode}.
 *
 * @param {@microsoft/api-extractor-model#ApiItem} apiItem - The API item being rendered.
 * @param {@fluid-tools/api-markdown-documenter#ApiItemTransformationConfiguration} config - Transformation configuration.
 *
 * @returns The doc section if the API item had a `@remarks` comment, otherwise `undefined`.
 */
function createDeprecationNoticeSection(apiItem, config) {
	const deprecatedBlock = ApiItemUtilities.getDeprecatedBlock(apiItem);
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
