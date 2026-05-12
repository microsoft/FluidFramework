/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { FormattedTextAsTree } from "@fluidframework/tree/internal";
import DeltaPackage from "quill-delta";

// Workaround for quill-delta's export style not working well with node16 module resolution.
/** Re-alias of {@link DeltaPackage.default} for use as a type. */
type Delta = DeltaPackage.default;
/** Re-alias of {@link DeltaPackage.AttributeMap} (Quill's attributes record on delta ops). */
type QuillAttributeMap = DeltaPackage.AttributeMap;
const Delta = DeltaPackage.default;

export type { Delta, QuillAttributeMap };

/** Quill size names mapped to pixel values for tree storage. */
const sizeMap = { small: 10, large: 18, huge: 24 } as const;
/** Reverse mapping: pixel values back to Quill size names for display. */
const sizeReverse = { 10: "small", 18: "large", 24: "huge" } as const;
/** Set of recognized font families for Quill. */
const fontSet = new Set<string>(["monospace", "serif", "sans-serif", "Arial"]);
/** Default size when no explicit size is specified. */
export const defaultSize = 12;
/** Default font when no explicit font is specified. */
export const defaultFont = "Arial";
/** Default heading for when an unsupported header is supplied. */
const defaultHeading = "h5";

/** The string literal values accepted by LineTag. */
type LineTagValue = Parameters<typeof FormattedTextAsTree.LineTag>[0];

/** Quill header numbers → LineTag values. */
const headerToLineTag = {
	1: "h1",
	2: "h2",
	3: "h3",
	4: "h4",
	5: "h5",
} as const satisfies Readonly<Record<number, LineTagValue>>;

/** Quill list tags → LineTag values. */
const listToLineTag = {
	bullet: "li",
	ordered: "ol",
	checked: "checked",
	unchecked: "unchecked",
} as const satisfies Readonly<Record<string, LineTagValue>>;

/** LineTag values → Quill attributes. Used by buildDeltaFromTree (tree → Quill). */
export const lineTagToQuillAttributes = {
	h1: { header: 1 },
	h2: { header: 2 },
	h3: { header: 3 },
	h4: { header: 4 },
	h5: { header: 5 },
	li: { list: "bullet" },
	ol: { list: "ordered" },
	checked: { list: "checked" },
	unchecked: { list: "unchecked" },
	blockquote: { blockquote: true },
	codeBlock: { "code-block": "plain" },
} as const satisfies Readonly<Record<LineTagValue, Record<string, unknown>>>;

/**
 * Parse CSS font-size from a pasted HTML element's inline style.
 * @remarks
 * Returns a Quill size name if the pixel value matches a supported size, undefined otherwise.
 * 12px is the default size and returns undefined (no Quill attribute needed).
 * @param node - The HTML element whose inline `font-size` style to inspect.
 */
export function parseCssFontSize(node: HTMLElement): string | undefined {
	const style = node.style.fontSize;
	if (!style) return undefined;

	// check if pixel value is in <size>px format
	if (style.endsWith("px")) {
		// Parse pixel value (e.g., "18px" -> 18)
		const parsed = Number.parseFloat(style);
		if (Number.isNaN(parsed)) return undefined;

		// Round to nearest integer and look up Quill size name
		const rounded = Math.round(parsed);
		if (rounded in sizeReverse) {
			return sizeReverse[rounded as keyof typeof sizeReverse];
		}
	}
	return undefined;
}

/**
 * Parse CSS font-family from a pasted HTML element's inline style.
 * @remarks
 * Tries fonts in priority order (first to last per CSS spec) and returns
 * the first recognized Quill font value.
 * @param node - The HTML element whose inline `font-family` style to inspect.
 */
export function parseCssFontFamily(node: HTMLElement): string | undefined {
	const style = node.style.fontFamily;
	if (style === "") return undefined;

	// Splitting on "," does not handle commas inside quoted font names, and escape
	// sequences within font names are not supported. This is fine since none of the
	// font names we match against contain commas or escapes.
	const fonts = style.split(",");
	for (const raw of fonts) {
		// Trim whitespace and leading and trailing quotes
		const font = raw.trim().replace(/^["']/, "").replace(/["']$/, "");
		// check if font is in our supported font set
		if (fontSet.has(font)) {
			return font;
		}
	}
	// No recognized font family found; fall back to default (Arial)
	return undefined;
}

/**
 * Clipboard matcher that preserves recognized font-size and font-family
 * from pasted HTML elements.
 * @remarks
 * Applies each format independently via compose/retain so new attributes
 * can be added without risk of an early return skipping them.
 * @param node - The pasted DOM node being matched.
 * @param delta - The Quill delta produced for the pasted content so far.
 * @see https://quilljs.com/docs/modules/clipboard#addmatcher
 */
export function clipboardFormatMatcher(node: Node, delta: Delta): Delta {
	if (!(node instanceof HTMLElement)) return delta;

	const size = parseCssFontSize(node);
	const font = parseCssFontFamily(node);

	let result = delta;
	if (size !== undefined) {
		result = result.compose(new Delta().retain(result.length(), { size }));
	}
	if (font !== undefined) {
		result = result.compose(new Delta().retain(result.length(), { font }));
	}
	return result;
}

/**
 * Parse a size value from Quill into a numeric pixel value.
 * @remarks
 * Handles Quill's named sizes (small, large, huge), numeric values, and pixel strings.
 */
export function parseSize(size: unknown): number {
	if (typeof size === "number") return size;
	if (size === "small" || size === "large" || size === "huge") {
		return sizeMap[size];
	}
	if (typeof size === "string") {
		const parsed = Number.parseInt(size, 10);
		if (!Number.isNaN(parsed)) {
			return parsed;
		}
	}
	return defaultSize;
}

/**
 * Extract a LineTag from Quill attributes, or undefined if none present.
 * @remarks
 * Quill only supports one LineTag at a time.
 * @param attributes - The Quill delta attributes object to inspect.
 */
export function parseLineTag(
	attributes?: Record<string, unknown>,
): FormattedTextAsTree.LineTag | undefined {
	if (!attributes) return undefined;
	// Quill should never send both header and list attributes simultaneously.
	assert(
		[
			attributes.header,
			attributes.list,
			attributes.blockquote,
			attributes["code-block"],
		].filter(
			// Quill includes null in trailing line tag deltas when only updating the index value
			(attr) => attr !== null && attr !== undefined,
		).length <= 1,
		0xce2 /* expected at most one line tag (header, list, blockquote, or codeblock), but received multiple */,
	);
	if (typeof attributes.header === "number") {
		const tag: LineTagValue =
			headerToLineTag[attributes.header as keyof typeof headerToLineTag] ?? defaultHeading;
		return FormattedTextAsTree.LineTag(tag);
	}
	if (typeof attributes.list === "string") {
		const tag = listToLineTag[attributes.list as keyof typeof listToLineTag];
		if (tag !== undefined) {
			return FormattedTextAsTree.LineTag(tag);
		}
	}
	if (attributes.blockquote === true) {
		return FormattedTextAsTree.LineTag("blockquote");
	}
	if (typeof attributes["code-block"] === "string") {
		return FormattedTextAsTree.LineTag("codeBlock");
	}
	return undefined;
}

/**
 * Convert Quill attributes to a complete CharacterFormat object.
 * @remarks
 * Used when inserting new characters - all format properties must have values.
 * Missing attributes default to false/default values.
 */
export function quillAttributesToFormat(attributes?: Record<string, unknown>): {
	bold: boolean;
	italic: boolean;
	underline: boolean;
	size: number;
	font: string;
} {
	return {
		bold: attributes?.bold === true,
		italic: attributes?.italic === true,
		underline: attributes?.underline === true,
		size: parseSize(attributes?.size),
		font: typeof attributes?.font === "string" ? attributes.font : defaultFont,
	};
}

/**
 * Convert Quill attributes to a partial CharacterFormat object.
 * @remarks
 * Used when applying formatting to existing text via retain operations.
 * Only includes properties that were explicitly set in the Quill attributes,
 * allowing selective format updates without overwriting unrelated properties.
 */
export function quillAttributesToPartial(
	attributes?: Record<string, unknown>,
): Partial<FormattedTextAsTree.CharacterFormat> {
	if (!attributes) return {};
	const format: Partial<FormattedTextAsTree.CharacterFormat> = {};
	// Only include attributes that are explicitly present in the Quill delta
	if ("bold" in attributes) format.bold = attributes.bold === true;
	if ("italic" in attributes) format.italic = attributes.italic === true;
	if ("underline" in attributes) format.underline = attributes.underline === true;
	if ("size" in attributes) format.size = parseSize(attributes.size);
	if ("font" in attributes)
		format.font = typeof attributes.font === "string" ? attributes.font : defaultFont;
	return format;
}

/**
 * Convert a `CharacterFormat`'s pixel size to a Quill `size` attribute value.
 * @remarks
 * Named for sizes Quill recognizes (`small`, `large`, `huge`), `px` string otherwise.
 */
export function sizeToQuillAttribute(size: number): string {
	return size in sizeReverse ? sizeReverse[size as keyof typeof sizeReverse] : `${size}px`;
}

/**
 * Convert a CharacterFormat from the tree to Quill attributes.
 * @remarks
 * Used when building Quill deltas from tree content to sync external changes.
 * Only includes non-default values to keep deltas minimal.
 */
export function formatToQuillAttributes(
	format: FormattedTextAsTree.CharacterFormat,
): QuillAttributeMap {
	const attributes: QuillAttributeMap = {};
	// Only include non-default formatting to keep Quill deltas minimal
	if (format.bold) attributes.bold = true;
	if (format.italic) attributes.italic = true;
	if (format.underline) attributes.underline = true;
	if (format.size !== defaultSize) {
		attributes.size = sizeToQuillAttribute(format.size);
	}
	if (format.font !== defaultFont) attributes.font = format.font;
	return attributes;
}

/**
 * Convert a CharacterFormat to Quill attributes that fully describe the formatting state.
 * @remarks
 * Unlike {@link formatToQuillAttributes}, this includes `null` for default-valued properties
 * so that Quill clears any previously-set attributes. Used when applying formatting changes
 * to retained (already-present) content via `updateContents`.
 */
export function formatToFullQuillAttributes(
	format: FormattedTextAsTree.CharacterFormat,
): QuillAttributeMap {
	// Quill uses `null` (not `undefined`) to clear attributes, so we must use null
	// for default-valued properties rather than omitting them.
	// eslint-disable-next-line unicorn/no-null
	const off = null;

	return {
		bold: format.bold ? true : off,
		italic: format.italic ? true : off,
		underline: format.underline ? true : off,
		size: format.size === defaultSize ? off : sizeToQuillAttribute(format.size),
		font: format.font === defaultFont ? off : format.font,
	};
}
