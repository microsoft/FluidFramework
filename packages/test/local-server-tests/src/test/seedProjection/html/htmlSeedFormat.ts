/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Example external format identifier recorded only in the application's optional manifest.
 * It describes the readable layout, not runtime construction rules or the DDS schema.
 * Readers recognize the parts subtree without depending on this metadata.
 * Version 2 stores a variable set of named parts instead of the prototype's two fixed fields.
 * Its HTML grammar has no browser error recovery, scripts, comments, URLs, styles, or namespaces.
 */
export const externalHtmlFormat = "reference-html-parts/2";
/**
 * Allowed element names in the application's restricted HTML grammar.
 * Parsing seed bytes and serializing collaborative edits enforce the same allowlist.
 */
export const allowedHtmlTags: ReadonlySet<string> = new Set([
	"div",
	"p",
	"span",
	"strong",
	"em",
	"ul",
	"li",
	"h1",
	"h2",
	"br",
]);
/** Attribute names permitted in both external input and edited model output. */
const attributeNamePattern = /^(?:id|class|title|data-[a-z][a-z0-9-]*)$/u;
/** Reject control characters and unpaired UTF-16 surrogates while accepting valid Unicode pairs. */
// eslint-disable-next-line no-control-regex -- Rejecting these control characters is part of the format contract.
const unsupportedCharacterPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF]/u;
/** The only named entities accepted by this deliberately restricted, non-browser parser. */
const entities: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
};
/**
 * Plain application content, independent of Fluid runtimes, DDSs, and node identities.
 */
export type HtmlNode =
	/** A literal text node after entity decoding. */
	| { text: string }
	/** An element with validated attributes and document-ordered children. */
	| { tag: string; attributes: Record<string, string>; children: HtmlNode[] };

/** Decode only the reference format's five named entities; malformed entities fail. */
function decode(text: string): string {
	if (/&(?!amp;|lt;|gt;|quot;|apos;)/u.test(text)) {
		throw new Error("Unsupported or unterminated entity");
	}
	return text.replaceAll(/&(amp|lt|gt|quot|apos);/gu, (_, name: string) => entities[name]);
}

/**
 * Reject names outside the format before either parsing or serializing an attribute.
 */
export function validateAttributeName(name: string): void {
	if (attributeNamePattern.exec(name)?.[0] !== name) {
		throw new Error("Unsupported attribute name");
	}
}

/**
 * Parse a complete reference-format document into plain application nodes, or throw.
 * This must be a pure function: identical input produces structurally identical output.
 * No timers, fresh GUIDs, randomness, locale, or other environmental entropy may affect it.
 * Both the external creator and native baseline builder use this same format validation.
 */
export function parseHtml(html: string): HtmlNode[] {
	if (html.length > 100_000 || unsupportedCharacterPattern.test(html)) {
		throw new Error("Input exceeds reference format limits");
	}
	let offset = 0;
	const parseChildren = (closing?: string, depth = 0): HtmlNode[] => {
		if (depth > 64) {
			throw new Error("HTML nesting exceeds reference format limit");
		}
		const children: HtmlNode[] = [];
		while (offset < html.length) {
			const rest = html.slice(offset);
			if (rest.startsWith("</")) {
				const match = /^<\/([a-z][a-z0-9]*)>/u.exec(rest);
				if (match === null || match[1] !== closing) {
					throw new Error("Mismatched closing tag");
				}
				offset += match[0].length;
				return children;
			}
			if (!rest.startsWith("<")) {
				const nextTag = rest.indexOf("<");
				const length = nextTag < 0 ? rest.length : nextTag;
				children.push({ text: decode(rest.slice(0, length)) });
				offset += length;
				continue;
			}
			const start = /^<([a-z][a-z0-9]*)(?=[\s>])/u.exec(rest);
			if (start === null || !allowedHtmlTags.has(start[1])) {
				throw new Error("Unsupported element");
			}
			const tag = start[1];
			offset += start[0].length;
			const attributes: Record<string, string> = {};
			while (html[offset] !== ">") {
				const attribute = /^\s+([a-z][a-z0-9-]*)="([^"<]*)"/u.exec(html.slice(offset));
				if (attribute === null) {
					throw new Error("Expected a double-quoted attribute or closing >");
				}
				const [, name, value] = attribute;
				validateAttributeName(name);
				if (Object.hasOwn(attributes, name)) {
					throw new Error("Duplicate attribute");
				}
				attributes[name] = decode(value);
				offset += attribute[0].length;
			}
			offset++;
			children.push({
				tag,
				attributes: Object.fromEntries(
					Object.keys(attributes)
						.sort()
						.map((key) => [key, attributes[key]]),
				),
				children: tag === "br" ? [] : parseChildren(tag, depth + 1),
			});
		}
		if (closing !== undefined) {
			throw new Error("Missing closing tag");
		}
		return children;
	};
	return parseChildren();
}
