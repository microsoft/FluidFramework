/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory, TreeViewConfiguration, type TreeView } from "@fluidframework/tree";

import type { TextPart, TextSeed } from "./seedFormat.js";

/** Persisted schema identity is independent of the external input format. */
const schema = new SchemaFactory("seed-text-tree/1");

/**
 * A separately addressable collaborative text value.
 */
export class TextNode extends schema.object("Text", { text: schema.string }) {}

/**
 * Name-indexed text nodes. Replacing a node changes its Fluid identity.
 */
export class TextParts extends schema.map("Parts", TextNode) {}

/**
 * The native model persists without the original application seed.
 */
export class TextDocument extends schema.object("Document", { parts: TextParts }) {}

/**
 * Shared view configuration for offline construction and ordinary loading.
 */
export const viewConfiguration = new TreeViewConfiguration({ schema: TextDocument });

/**
 * Typed model returned to a reference client.
 */
export type TextView = TreeView<typeof TextDocument>;

/**
 * Construct uninserted nodes in the validated seed's canonical order.
 */
export function documentFromSeed(seed: TextSeed): TextDocument {
	return new TextDocument({
		parts: new TextParts(seed.parts.map(({ name, text }) => [name, new TextNode({ text })])),
	});
}

/**
 * Read native model values for comparison, not for ongoing application-summary production.
 */
export function readParts(view: TextView): TextPart[] {
	return [...view.root.parts]
		.map(([name, part]) => ({ name, text: part.text }))
		.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}
