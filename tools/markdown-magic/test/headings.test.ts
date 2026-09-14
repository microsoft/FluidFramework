/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { inferSectionHeadingDepth } from "../src/headings.js";
import { parseDocument } from "../src/processorProfiles.js";
import { findGeneratedRegions } from "../src/regions.js";

const marker =
	'<!-- markdown-magic:begin {"transform":"help"} -->\n<!-- markdown-magic:end -->';

function inferHeadingDepth(source: string, regionIndex = 0): number {
	const document = parseDocument(source, "destination.md");
	const regions = findGeneratedRegions(document);
	const region = regions[regionIndex];
	assert(region !== undefined);
	return inferSectionHeadingDepth(document, regions, region);
}

test("uses level one when the document has no authored headings", () => {
	assert.equal(inferHeadingDepth(marker), 1);
});

test("uses level two after the document title", () => {
	assert.equal(inferHeadingDepth(`# Document\n\n${marker}`), 2);
});

test("uses the preceding section heading at the end of a document", () => {
	assert.equal(inferHeadingDepth(`# Document\n\n### Section\n\n${marker}`), 3);
});

test("prefers the following heading over the preceding heading", () => {
	assert.equal(
		inferHeadingDepth(`# Document\n\n## Parent\n\n${marker}\n\n#### Following section`),
		4,
	);
});

test("ignores headings inside generated regions", () => {
	const source = [
		"# Document",
		"",
		'<!-- markdown-magic:begin {"transform":"help"} -->',
		"###### Stale generated heading",
		"<!-- markdown-magic:end -->",
		"",
		marker,
	].join("\n");

	assert.equal(inferHeadingDepth(source, 1), 2);
});
