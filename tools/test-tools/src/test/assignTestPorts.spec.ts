/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { getPackageInfo } from "../assignTestPorts";

describe("assignTestPorts", () => {
	it("getPackageInfo", () => {
		const info = getPackageInfo();
		assert.equal(info.length, 1);
		assert.equal(info[0].name, "@fluidframework/test-tools");
	});
});
