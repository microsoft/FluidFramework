/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { getPackageInfo } from "../assignTestPorts";

describe("assignTestPorts", () => {
	it("getPackageInfo", () => {
		const info = getPackageInfo('pnpm');
		assert.equal(info.length, 1);
		assert.equal(info[0].name, "@fluidframework/test-tools");
	});
});
