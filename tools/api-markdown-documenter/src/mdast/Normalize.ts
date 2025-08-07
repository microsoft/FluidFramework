/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BlockContent, Break, Heading, Html, Root, RootContent, Strong } from "mdast";

import type { Section } from "./Section.js";
import type { SectionHeading } from "./SectionHeading.js";

/**
 * This library introduces a couple of custom `mdast` node types, such as `Section`.
 * To make using the output of this library's transformations easier, we perform a "normalization" pass over the
 * generated trees to convert them to a more standard representation.
 * The below functions are used to perform that normalization.
 */

/**
 * Markdown root content, normalized to remove library-specific types.
 */
export type NormalizedRootContent = Exclude<RootContent, Section>;

/**
 * {@link normalizeDocumentContents} options.
 */
export interface NormalizationOptions {
	/**
	 * Optional override for the starting heading level of a document.
	 *
	 * @remarks Must be an integer on [1, ∞).
	 *
	 * @defaultValue 1
	 */
	readonly startingHeadingLevel?: number;
}

interface NormalizationContext {
	readonly headingLevel: number;
}

/**
 * Converts a document's {@link Section}s to a standard Markdown representation.
 * @remarks Collapses hierarchies and applies heading levels.
 */
export function normalizeDocumentContents(
	contents: readonly Section[],
	options?: NormalizationOptions,
): Root {
	const normalizedContents: NormalizedRootContent[] = [];
	const context: NormalizationContext = { headingLevel: options?.startingHeadingLevel ?? 1 };
	for (const section of contents) {
		normalizedContents.push(...normalizeSection(section, context));
	}
	return {
		type: "root",
		children: normalizedContents,
	};
}

/**
 * Converts a {@link Section} to a standard Markdown representation.
 * @remarks Collapses hierarchies and applies heading levels.
 */
export function normalizeSection(
	section: Section,
	context: NormalizationContext,
): NormalizedRootContent[] {
	const { headingLevel } = context;

	const transformedSectionContent: NormalizedRootContent[] = [];

	if (section.heading !== undefined) {
		const normalizedHeading = normalizeHeading(section.heading, headingLevel);
		transformedSectionContent.push(...normalizedHeading);
	}

	for (const child of section.children) {
		if (child.type === "section") {
			const childContext: NormalizationContext = {
				headingLevel: headingLevel + 1,
			};
			transformedSectionContent.push(...normalizeSection(child, childContext));
		} else {
			transformedSectionContent.push(child);
		}
	}

	return transformedSectionContent;
}

/**
 * Markdown supports heading levels from 1 to 6, corresponding to HTML's `<h1>` to `<h6>`.
 */
function isInHeadingRange(level: number): level is 1 | 2 | 3 | 4 | 5 | 6 {
	return level >= 1 && level <= 6;
}

/**
 * TODO
 */
export function normalizeHeading(
	sectionHeading: SectionHeading,
	level: number,
): BlockContent[] {
	// Markdown only supports heading levels up to 6. If our level is beyond that, we will transform the input to simple
	// bold text, with an accompanying HTML anchor to ensure we can still link to the text.
	return isInHeadingRange(level)
		? transformAsHeading(sectionHeading, level)
		: transformAsBoldText(sectionHeading);
}

function transformAsHeading(
	headingNode: SectionHeading,
	headingLevel: 1 | 2 | 3 | 4 | 5 | 6,
): BlockContent[] {
	let headingText: string = headingNode.title;
	if (headingNode.id !== undefined) {
		headingText = `${headingText} {#${headingNode.id}}`;
	}

	const heading: Heading = {
		type: "heading",
		depth: headingLevel,
		children: [
			{
				type: "text",
				value: headingText,
			},
		],
	};

	return [heading];
}

function transformAsBoldText(headingNode: SectionHeading): BlockContent[] {
	const strongText: Strong = {
		type: "strong",
		children: [
			{
				type: "text",
				value: headingNode.title,
			},
		],
	};

	if (headingNode.id === undefined) {
		return [
			{
				type: "paragraph",
				children: [strongText],
			},
		];
	}

	// TODO: use embedded HAST tree rather than raw HTML string.
	const anchorHtml: Html = {
		type: "html",
		value: `<a id="${headingNode.id}"></a>`,
	};
	const lineBreak: Break = { type: "break" };
	return [
		{
			type: "paragraph",
			children: [anchorHtml, lineBreak, strongText],
		},
	];
}
