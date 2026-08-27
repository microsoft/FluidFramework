/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { migrateLegacyMarkers } from "../src/migrateLegacyMarkers.js";

test("migrates legacy options to typed JSON", () => {
	const source = [
		"<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=./source.md&start=2&end=-1) -->",
		"",
		"Old content.",
		"",
		"<!-- AUTO-GENERATED-CONTENT:END -->",
	].join("\n");

	assert.equal(
		migrateLegacyMarkers(source, "fixture.md"),
		[
			'<!-- markdown-magic:begin {"transform":"include","path":"./source.md","start":2,"end":-1} -->',
			"",
			"Old content.",
			"",
			"<!-- markdown-magic:end -->",
		].join("\n"),
	);
});

test("migrates booleans and removes an ignored library-header option", () => {
	const source = [
		"<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER:devDependency=TRUE&scripts=TRUE) -->",
		"<!-- AUTO-GENERATED-CONTENT:END -->",
	].join("\n");

	assert.equal(
		migrateLegacyMarkers(source, "fixture.md"),
		[
			'<!-- markdown-magic:begin {"transform":"library-readme-header","devDependency":true} -->',
			"<!-- markdown-magic:end -->",
		].join("\n"),
	);
});

test("removes the legacy heading level option", () => {
	const source = [
		"<!-- AUTO-GENERATED-CONTENT:START (HELP:includeHeading=TRUE&headingLevel=3) -->",
		"<!-- AUTO-GENERATED-CONTENT:END -->",
	].join("\n");

	assert.equal(
		migrateLegacyMarkers(source, "fixture.md"),
		[
			'<!-- markdown-magic:begin {"transform":"help","includeHeading":true} -->',
			"<!-- markdown-magic:end -->",
		].join("\n"),
	);
});

test("migrates an empty legacy option list", () => {
	const source = [
		"<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER:) -->",
		"<!-- AUTO-GENERATED-CONTENT:END -->",
	].join("\n");

	assert.match(
		migrateLegacyMarkers(source, "fixture.md"),
		/markdown-magic:begin \{"transform":"readme-footer"\}/,
	);
});
