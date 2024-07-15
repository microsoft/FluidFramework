/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assert, expect } from "chai";

import {
	flattenChangesets,
	groupByPackage,
	loadChangesets,
} from "../../src/library/changesets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const changesetsPath = path.resolve(__dirname, "../data");
assert.isTrue(existsSync(changesetsPath));

describe("changesets", async () => {
	it("loadChangesets", async () => {
		const changesets = await loadChangesets(changesetsPath);
		expect(changesets.length).to.equal(3);
	});

	it("flattenChangesets", async () => {
		const changesets = await loadChangesets(changesetsPath);
		const flattened = flattenChangesets(changesets);
		expect(flattened.length).to.equal(5);
	});

	it("groupByPackage", async () => {
		const changesets = await loadChangesets(changesetsPath);
		const flattened = flattenChangesets(changesets);
		const grouped = groupByPackage(flattened);
		expect(grouped.size).to.equal(4);
	});
});
