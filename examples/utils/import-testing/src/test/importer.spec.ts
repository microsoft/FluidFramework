/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// eslint-disable-next-line import/no-internal-modules
import { JsonArray } from "@fluidframework/tree/internal";

import { RecursiveMap } from "../testExports.js";

describe("import tests", () => {
	it("recursive map", () => {
		const r = new RecursiveMap([["", new RecursiveMap([])]]);
		assert.equal(r.size, 1);
	});

	it("JsonArray", () => {
		const r = new JsonArray([1]);
		assert.equal(r[0], 1);
	});
});
