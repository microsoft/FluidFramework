/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { parseDocument } from "../src/processorProfiles.js";
import { findGeneratedRegions } from "../src/regions.js";

test("finds a Markdown generated region", () => {
	const source = [
		'<!-- markdown-magic:begin {"transform":"include","path":"./source.md","start":2} -->',
		"",
		"Old content.",
		"",
		"<!-- markdown-magic:end -->",
	].join("\n");
	const document = parseDocument(source, "/repo/docs/destination.md");

	assert.deepEqual(findGeneratedRegions(document), [
		{
			destinationPath: "/repo/docs/destination.md",
			destinationFormat: "markdown",
			transformName: "include",
			options: { path: "./source.md", start: 2 },
			openingMarkerEnd: 84,
			closingMarkerStart: 100,
			line: 1,
		},
	]);
});

test("finds an MDX generated region", () => {
	const source = [
		'{/* markdown-magic:begin {"transform":"include","path":"./source.mdx"} */}',
		"",
		"<Callout>Old content.</Callout>",
		"",
		"{/* markdown-magic:end */}",
	].join("\n");
	const document = parseDocument(source, "/repo/docs/destination.mdx");
	const [region] = findGeneratedRegions(document);
	assert(region !== undefined);

	assert.equal(region.destinationFormat, "mdx");
	assert.equal(region.transformName, "include");
	assert.deepEqual(region.options, { path: "./source.mdx" });
	assert.equal(region.openingMarkerEnd, 74);
	assert.equal(region.closingMarkerStart, 109);
	assert.equal(region.line, 1);
});

test("finds a Markdown region with multi-line JSON options", () => {
	const source = [
		"<!-- markdown-magic:begin {",
		'  "transform": "package-scripts",',
		'  "scriptDescriptions": {',
		'    "test": "Run all tests."',
		"  }",
		"} -->",
		"<!-- markdown-magic:end -->",
	].join("\n");
	const document = parseDocument(source, "/repo/README.md");
	const [region] = findGeneratedRegions(document);
	assert(region !== undefined);

	assert.equal(region.transformName, "package-scripts");
	assert.deepEqual(region.options, {
		scriptDescriptions: { test: "Run all tests." },
	});
});

test("finds an MDX region with multi-line JSON options", () => {
	const source = [
		"{/* markdown-magic:begin {",
		'  "transform": "package-scripts",',
		'  "scriptDescriptions": {',
		'    "test": "Run all tests."',
		"  }",
		"} */}",
		"{/* markdown-magic:end */}",
	].join("\n");
	const document = parseDocument(source, "/repo/README.mdx");
	const [region] = findGeneratedRegions(document);
	assert(region !== undefined);

	assert.equal(region.transformName, "package-scripts");
	assert.deepEqual(region.options, {
		scriptDescriptions: { test: "Run all tests." },
	});
});

test("rejects an opening marker without a closing marker", () => {
	const source = '<!-- markdown-magic:begin {"transform":"include","path":"./source.md"} -->';
	const document = parseDocument(source, "/repo/docs/destination.md");

	assert.throws(
		() => findGeneratedRegions(document),
		/\/repo\/docs\/destination\.md:1: Missing closing marker\./,
	);
});

test("rejects nested generated regions", () => {
	const source = [
		'<!-- markdown-magic:begin {"transform":"include","path":"./outer.md"} -->',
		'<!-- markdown-magic:begin {"transform":"include","path":"./inner.md"} -->',
		"<!-- markdown-magic:end -->",
		"<!-- markdown-magic:end -->",
	].join("\n\n");
	const document = parseDocument(source, "/repo/docs/destination.md");

	assert.throws(
		() => findGeneratedRegions(document),
		/\/repo\/docs\/destination\.md:3: Generated regions must not nest\./,
	);
});

test("rejects invalid marker JSON", () => {
	const source = [
		'<!-- markdown-magic:begin {"transform":"include",} -->',
		"<!-- markdown-magic:end -->",
	].join("\n\n");
	const document = parseDocument(source, "/repo/docs/destination.md");

	assert.throws(
		() => findGeneratedRegions(document),
		/\/repo\/docs\/destination\.md:1: Invalid marker JSON\./,
	);
});
