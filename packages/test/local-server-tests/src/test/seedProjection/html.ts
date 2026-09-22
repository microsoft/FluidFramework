/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory, TreeViewConfiguration, type TreeView } from "@fluidframework/tree";

/**
 * This is a deliberately restricted, versioned format, NOT a browser HTML parser.
 * No error recovery, scripts, comments, URLs, styles, namespaces, or implicit closing tags.
 */
export const format = "fluid-html-reference/1";
const tags = new Set(["div", "p", "span", "strong", "em", "ul", "li", "h1", "h2", "br"]);
// The reference format accepts only these names and lowercase data-* keys.
const attributeNamePattern = /^(?:id|class|title|data-[a-z][a-z0-9-]*)$/u;
const entities: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
};
const sf = new SchemaFactory(format);
export class HtmlAttributes extends sf.map("Attributes", sf.string) {}
export class HtmlText extends sf.object("Text", { text: sf.string }) {}
export class HtmlChildren extends sf.arrayRecursive("Children", [
	HtmlText,
	() => HtmlElement,
]) {}
export class HtmlElement extends sf.objectRecursive("Element", {
	tag: sf.string,
	attributes: HtmlAttributes,
	children: HtmlChildren,
}) {}
export const viewConfiguration = new TreeViewConfiguration({ schema: HtmlChildren });
export type HtmlView = TreeView<typeof HtmlChildren>;

export type HtmlNode =
	| { text: string }
	| { tag: string; attributes: Record<string, string>; children: HtmlNode[] };

function decode(text: string): string {
	if (/&(?!amp;|lt;|gt;|quot;|apos;)/u.test(text)) {
		throw new Error("Unsupported or unterminated entity");
	}
	return text.replace(/&(amp|lt|gt|quot|apos);/gu, (_, name: string) => entities[name]);
}

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

function validateAttributeName(name: string): void {
	if (attributeNamePattern.exec(name)?.[0] !== name) {
		throw new Error("Unsupported attribute name");
	}
}

/** Parse the complete input or fail; the tree never contains unvalidated markup. */
export function parseHtml(html: string): HtmlNode[] {
	if (
		html.length > 100_000 ||
		/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff]/u.test(html)
	) {
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
				const length = rest.indexOf("<") === -1 ? rest.length : rest.indexOf("<");
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

/** Attribute order and entity spelling have one canonical representation. */
export function serializeHtml(nodes: readonly HtmlNode[]): string {
	// The SharedTree schema intentionally models structure rather than an HTML
	// language grammar. Validate edited native nodes too, not only seed input.
	const result = serializeNodes(nodes, 0);
	parseHtml(result);
	return result;
}

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

export function toTree(nodes: readonly HtmlNode[]): HtmlChildren {
	return new HtmlChildren(
		nodes.map((node): HtmlText | HtmlElement =>
			"text" in node
				? new HtmlText(node)
				: new HtmlElement({
						tag: node.tag,
						attributes: new HtmlAttributes(node.attributes),
						children: toTree(node.children),
					}),
		),
	);
}

export function fromTree(nodes: HtmlChildren): HtmlNode[] {
	return Array.from(
		nodes,
		(node): HtmlNode =>
			node instanceof HtmlText
				? { text: node.text }
				: {
						tag: node.tag,
						attributes: Object.fromEntries(node.attributes),
						children: fromTree(node.children),
					},
	);
}

export function viewHtml(view: HtmlView): string {
	return serializeHtml(fromTree(view.root));
}
