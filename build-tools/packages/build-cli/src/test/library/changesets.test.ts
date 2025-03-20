/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assert, expect } from "chai";
import { describe, it } from "mocha";

import {
	flattenChangesets,
	groupByMainPackage,
	groupByPackage,
	loadChangesets,
} from "../../library/changesets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const changesetsPath = path.resolve(__dirname, "../../../src/test/data");
assert.isTrue(existsSync(changesetsPath));

describe("changesets", () => {
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
		const grouped = groupByPackage(changesets);
		expect(grouped.size).to.equal(4);
	});

	it("groupByMainPackage", async () => {
		const changesets = await loadChangesets(changesetsPath);
		const grouped = groupByMainPackage(changesets);
		expect(grouped.size).to.equal(2);
	});
});
