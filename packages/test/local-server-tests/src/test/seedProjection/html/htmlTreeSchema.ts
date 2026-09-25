/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory, TreeViewConfiguration, type TreeView } from "@fluidframework/tree";

import { canonicalParts, type IHtmlPart } from "./appProjection.js";
import { parseHtml, type HtmlNode } from "./htmlSeedFormat.js";
import { serializeHtml } from "./htmlSerializer.js";

/**
 * Persisted SharedTree type namespace.
 * Keep this value stable independently of the external HTML format and materialization rules.
 */
export const htmlSchemaNamespace = "fluid-html-reference/3";

/** SharedTree schema builder for this sample's persisted named-part model. */
const schemaFactory = new SchemaFactory(htmlSchemaNamespace);

/**
 * Collaborative attribute values for one element, keyed by validated attribute name.
 */
export class HtmlAttributes extends schemaFactory.map("Attributes", schemaFactory.string) {}
/**
 * One collaboratively addressable text node; this reference replaces its string as a value.
 */
export class HtmlText extends schemaFactory.object("Text", { text: schemaFactory.string }) {}
/**
 * Document order for root nodes and for the children of each element.
 */
export class HtmlChildren extends schemaFactory.arrayRecursive("Children", [
	HtmlText,
	() => HtmlElement,
]) {}
/**
 * Native element structure; the application format, not this schema, restricts allowed markup.
 */
export class HtmlElement extends schemaFactory.objectRecursive("Element", {
	tag: schemaFactory.string,
	attributes: HtmlAttributes,
	children: HtmlChildren,
}) {}

/**
 * Name-indexed collaborative subtrees; map iteration order is not application document order.
 * Replacing or renaming a part creates a distinct subtree identity, even when a name is reused.
 */
export class HtmlParts extends schemaFactory.map("Parts", HtmlChildren) {}

/**
 * A variable number of independently editable named HTML subtrees.
 */
export class HtmlDocument extends schemaFactory.object("Document", {
	parts: HtmlParts,
}) {}

/**
 * Application view schema used during both deterministic materialization and normal runtime loading.
 */
export const viewConfiguration = new TreeViewConfiguration({ schema: HtmlDocument });
/**
 * Typed live view over the sample document.
 */
export type HtmlView = TreeView<typeof HtmlDocument>;

/**
 * Build uninserted named parts in canonical order so independent DDS construction allocates the same IDs.
 */
export function documentFromParts(parts: readonly IHtmlPart[]): HtmlDocument {
	return new HtmlDocument({
		parts: new HtmlParts(
			canonicalParts(parts).map(({ name, payload }) => [name, toTree(parseHtml(payload))]),
		),
	});
}

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

/**
 * Read a tree synchronously into plain nodes without mutation; the same tree content yields the same nodes.
 */
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
	return viewHtmlParts(view)
		.map(({ payload }) => payload)
		.join("");
}

/**
 * Read all parts for display; summary projection serializes only changed parts instead.
 */
export function viewHtmlParts(view: HtmlView): IHtmlPart[] {
	return canonicalParts(Array.from(view.root.parts, ([name, nodes]) => ({ name, nodes }))).map(
		({ name, nodes }) => ({ name, payload: serializeHtml(fromTree(nodes)) }),
	);
}
