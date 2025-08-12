/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BlockContent, Break, Html, Nodes, Root, RootContent, Strong } from "mdast";

import type { Section } from "./Section.js";
import type { SectionHeading } from "./SectionHeading.js";

/**
 * This library introduces a couple of custom `mdast` node types, such as `Section`.
 * To make using the output of this library's transformations easier, we perform a "normalization" pass over the
 * generated trees to convert them to a more standard representation.
 * The below functions are used to perform that normalization.
 */

/**
 * Markdown `Nodes`, normalized to remove library-specific types.
 * @public
 */
export type NormalizedTree = Exclude<Nodes, Section>;

/**
 * Markdown `RootContent`, normalized to remove library-specific types.
 * @public
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
 * @remarks Collapses section hierarchies and applies heading levels.
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
 * @remarks Collapses section hierarchies and applies heading levels.
 * @param section - The section to normalize.
 * @param context - The normalization context, which tracks the heading level as nested sections are processed.
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
 * Converts a {@link SectionHeading} to a standard Markdown heading.
 * @param sectionHeading - The section heading to normalize.
 * @param level - The heading level to apply.
 *
 * @remarks If the level is beyond 6, the heading will be transformed to bold text with an HTML anchor.
 * This is due to Markdown's limitation of supporting only up to 6 heading levels.
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
): [BlockContent] {
	// Markdown headings don't natively support anchor IDs.
	// If the heading has an ID set, we will render it as an HTML element.
	// While there are extended syntax options for Markdown that do support IDs, none of them are widely supported.
	return headingNode.id === undefined
		? [
				{
					type: "heading",
					depth: headingLevel,
					children: [
						{
							type: "text",
							value: headingNode.title,
						},
					],
				},
			]
		: [
				{
					type: "html",
					value: `<h${headingLevel} id="${headingNode.id}">${headingNode.title}</h${headingLevel}>`,
				},
			];
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
