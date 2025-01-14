/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { RecursiveMap } from "../testExports.js";

describe("import tests", () => {
	it("recursive map", () => {
		const r = new RecursiveMap([["", new RecursiveMap([])]]);
		assert.equal(r.size, 1);
	});
});
