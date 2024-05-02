/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { assert, expect } from "chai";
import { pathExistsSync } from "fs-extra";

import {
	flattenChangesets,
	groupByPackage,
	loadChangesets,
} from "../../src/library/changesets.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const changesetsPath = path.resolve(__dirname, "../data");
assert.isTrue(pathExistsSync(changesetsPath));

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
