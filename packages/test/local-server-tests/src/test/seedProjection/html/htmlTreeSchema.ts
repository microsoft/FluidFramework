/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory, TreeViewConfiguration, type TreeView } from "@fluidframework/tree";

import { serializeHtml, type HtmlNode } from "./htmlSeedFormat.js";
import type { IHtmlParts } from "./externalSeedFile.js";

/**
 * Persisted SharedTree type namespace.
 * Keep this value stable independently of the external HTML format and materialization rules.
 */
export const htmlSchemaNamespace = "fluid-html-reference/2";

const schemaFactory = new SchemaFactory(htmlSchemaNamespace);

/** Collaborative attribute values for one element, keyed by validated attribute name. */
export class HtmlAttributes extends schemaFactory.map("Attributes", schemaFactory.string) {}
/** One collaboratively addressable text node; this reference replaces its string as a value. */
export class HtmlText extends schemaFactory.object("Text", { text: schemaFactory.string }) {}
/** Document order for root nodes and for the children of each element. */
export class HtmlChildren extends schemaFactory.arrayRecursive("Children", [
	HtmlText,
	() => HtmlElement,
]) {}
/** Native element structure; the application format, not this schema, restricts allowed markup. */
export class HtmlElement extends schemaFactory.objectRecursive("Element", {
	tag: schemaFactory.string,
	attributes: HtmlAttributes,
	children: HtmlChildren,
}) {}

/** Two separately subscribed subtrees correspond exactly to the two independently stored HTML parts. */
export class HtmlDocument extends schemaFactory.object("Document", {
	first: HtmlChildren,
	second: HtmlChildren,
}) {}

export const viewConfiguration = new TreeViewConfiguration({ schema: HtmlDocument });
export type HtmlView = TreeView<typeof HtmlDocument>;

/**
 * Construct uninserted SharedTree nodes from plain application content without mutating it.
 * Structure and traversal are deterministic; inserting these nodes into a DDS assigns identities.
 * Baseline construction must therefore also use its fixed genesis allocation context.
 */
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

/** Read a tree synchronously into plain nodes without mutation; the same tree content yields the same nodes. */
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

/**
 * Read canonical HTML from this view's current checkpoint without writes or asynchronous work.
 * For identical native content the output is identical; no session, clock, or entropy is consulted.
 */
export function viewHtml(view: HtmlView): string {
	const parts = viewHtmlParts(view);
	return parts.first + parts.second;
}

/** Read both parts for display/test comparison; incremental projection serializes only changed parts instead. */
export function viewHtmlParts(view: HtmlView): IHtmlParts {
	return {
		first: serializeHtml(fromTree(view.root.first)),
		second: serializeHtml(fromTree(view.root.second)),
	};
}
