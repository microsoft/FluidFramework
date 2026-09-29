/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IHtmlPart } from "../appProjection.js";
import type { HtmlChildren, HtmlView } from "../htmlTreeSchema.js";

/**
 * Select a named model subtree with a checked failure for malformed test setup.
 */
export function treePart(view: HtmlView, name: string): HtmlChildren {
	const part = view.root.parts.get(name);
	assert(part !== undefined, `Missing model part: ${name}`);
	return part;
}

/**
 * Select a named payload without depending on input or storage iteration order.
 */
export function payloadOf(parts: readonly IHtmlPart[], name: string): string {
	const part = parts.find((candidate) => candidate.name === name);
	assert(part !== undefined, `Missing HTML part: ${name}`);
	return part.payload;
}
