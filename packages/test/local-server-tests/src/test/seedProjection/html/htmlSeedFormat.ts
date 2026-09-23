/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This is a deliberately restricted, versioned format, NOT a browser HTML parser.
 * No error recovery, scripts, comments, URLs, styles, namespaces, or implicit closing tags.
 */
export const format = "fluid-html-reference/2";
const tags = new Set(["div", "p", "span", "strong", "em", "ul", "li", "h1", "h2", "br"]);
// The reference format accepts only these names and lowercase data-* keys.
const attributeNamePattern = /^(?:id|class|title|data-[a-z][a-z0-9-]*)$/u;
// The format rejects control characters and unpaired UTF-16 surrogates, but accepts valid Unicode pairs.
// eslint-disable-next-line no-control-regex -- Rejecting these control characters is part of the format contract.
const unsupportedCharacterPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF]/u;
const entities: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
};
/** Plain application content, independent of Fluid runtimes, DDSs, and node identities. */
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
	return text.replace(/&(amp|lt|gt|quot|apos);/gu, (_, name: string) => entities[name]);
}

/** Encode text and attribute values using one deterministic spelling per reserved character. */
function escape(text: string): string {
	return text.replace(/[&<>"']/gu, (character) => {
		const names: Record<string, string> = {
			"&": "amp",
			"<": "lt",
			">": "gt",
			'"': "quot",
			"'": "apos",
		};
		return `&${names[character]};`;
	});
}

/** Reject names outside the format before either parsing or serializing an attribute. */
function validateAttributeName(name: string): void {
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
			if (start === null || !tags.has(start[1])) {
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

/**
 * Serialize supported application nodes to canonical HTML, rejecting unsupported native edits.
 * This is pure and does not mutate its input: identical content has identical attribute order,
 * entity spelling, and output bytes, with no clock, GUID, randomness, or environment dependence.
 */
export function serializeHtml(nodes: readonly HtmlNode[]): string {
	// The SharedTree schema intentionally models structure rather than an HTML
	// language grammar. Validate edited native nodes too, not only seed input.
	const result = serializeNodes(nodes, 0);
	parseHtml(result);
	return result;
}

/** Recursively serialize validated structure in document order, enforcing the nesting limit. */
function serializeNodes(nodes: readonly HtmlNode[], depth: number): string {
	if (depth > 64) {
		throw new Error("HTML nesting exceeds reference format limit");
	}
	return nodes
		.map((node) => {
			if ("text" in node) {
				return escape(node.text);
			}
			if (!tags.has(node.tag)) {
				throw new Error("Unsupported element");
			}
			if (node.tag === "br" && node.children.length > 0) {
				throw new Error("A br element cannot have children");
			}
			const attrs = Object.keys(node.attributes)
				.sort()
				.map((key) => {
					validateAttributeName(key);
					return ` ${key}="${escape(node.attributes[key])}"`;
				})
				.join("");
			return `<${node.tag}${attrs}>${node.tag === "br" ? "" : `${serializeNodes(node.children, depth + 1)}</${node.tag}>`}`;
		})
		.join("");
}
