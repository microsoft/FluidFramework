/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { getTestPort } from "../getTestPort";

describe("getTestPort", () => {
	// Use a package name that won't appear in any generated port map, so the fallback path is exercised
	// deterministically regardless of any testportmap.json left on the machine.
	const unmappedPackage = `@fluid-test/get-test-port-${process.pid}`;

	it("returns the default fallback port (8081) for an unmapped package", () => {
		assert.equal(getTestPort(unmappedPackage), 8081);
	});

	it("returns the provided fallback port for an unmapped package", () => {
		assert.equal(getTestPort(unmappedPackage, 7070), 7070);
	});
});
