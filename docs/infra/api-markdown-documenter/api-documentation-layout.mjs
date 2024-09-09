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

import { AdmonitionNode } from "./admonition-node.mjs";

const customExamplesSectionTitle = "Usage";
const customThrowsSectionTitle = "Error Handling";

const supportDocsLinkSpan = new SpanNode([
	new PlainTextNode("For more information about our API support guarantees, see "),
	LinkNode.createFromPlainText(
		"here",
		// Is there a URL that would be relative to the current site? (For development use)
		"https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels",
	),
	new PlainTextNode("."),
]);

/**
 * Creates a special import notice for the provided API item, if one is appropriate.
 *
 * If the item is tagged as "@legacy", displays a legacy notice with import instructions.
 * Otherwise, if the item is `@alpha` or `@beta`, displays the appropriate warning and import instructions.
 *
 * @privateRemarks
 * If we later wish to differentiate between release tags of `@legacy` items, this function will need
 * to be updated.
 */
function createImportNotice(apiItem) {
	const packageName = apiItem.getAssociatedPackage().displayName;

	function createImportAdmonition(importSubpath, admonitionTitle) {
		return new AdmonitionNode(
			[
				new SpanNode([
					new PlainTextNode("To use, import via "),
					CodeSpanNode.createFromPlainText(`${packageName}/${importSubpath}`),
					new PlainTextNode("."),
				]),
				LineBreakNode.Singleton,
				supportDocsLinkSpan,
			],
			/* admonitionKind: */ "warning",
			admonitionTitle,
		);
	}

	if (ApiItemUtilities.hasModifierTag(apiItem, "@legacy")) {
		return createImportAdmonition(
			"legacy",
			"This API is provided for existing users, but is not recommended for new users.",
		);
	}

	const releaseTag = ApiItemUtilities.getReleaseTag(apiItem);

	if (releaseTag === ReleaseTag.Alpha) {
		return createImportAdmonition(
			"alpha",
			"This API is provided as an alpha preview and may change without notice.",
		);
	}

	if (releaseTag === ReleaseTag.Beta) {
		return createImportAdmonition(
			"beta",
			"This API is provided as a beta preview and may change without notice.",
		);
	}

	return undefined;
}

/**
 * Creates a special use notice for the provided API item, if one is appropriate.
 *
 * If the item is tagged as "@system", displays an internal notice with use notes.
 */
function createSystemNotice(apiItem) {
	if (ApiItemUtilities.ancestryHasModifierTag(apiItem, "@system")) {
		return new AdmonitionNode(
			[supportDocsLinkSpan],
			/* admonitionKind: */ "warning",
			"This API is reserved for internal system use and should not be imported directly. It may change at any time without notice.",
		);
	}

	return undefined;
}

/**
 * Default content layout for all API items.
 *
 * @remarks Lays out the content in the following manner:
 *
 * 1. Summary (if any)
 *
 * 1. System notice (if any)
 *
 * 1. Deprecation notice (if any)
 *
 * 1. Alpha/Beta/Legacy warning (if item annotated with `@alpha`, `@beta`, or `@legacy`)
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

	// Render system notice (if any) that supercedes deprecation and import notices
	const systemNotice = createSystemNotice(apiItem);
	if (systemNotice !== undefined) {
		sections.push(new SectionNode([systemNotice]));
	} else {
		// Render deprecation notice (if any)
		const deprecationNotice = createDeprecationNoticeSection(apiItem, config);
		if (deprecationNotice !== undefined) {
			sections.push(new SectionNode([deprecationNotice]));
		}

		// Render the appropriate API notice (with import instructions), if applicable.
		const importNotice = createImportNotice(apiItem);
		if (importNotice !== undefined) {
			sections.push(new SectionNode([importNotice]));
		}
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
 * @remarks Displayed as a Docusaurus admonition. See {@link AdmonitionNode} and {@link renderAdmonitionNode}.
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

	return new AdmonitionNode(
		[transformedDeprecatedBlock],
		"Warning",
		"This API is deprecated and will be removed in a future release.",
	);
}
