/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { getDockerfileCopyText } from "../../../library/repoPolicyCheck/dockerfilePackages.js";

describe("dockerfile-packages policy check", () => {
	it("generates the POSIX COPY text that the resolver must write for Windows paths", () => {
		const copyText = getDockerfileCopyText("packages\\routerlicious\\package.json");

		assert.doesNotMatch(copyText, /\\/);
		assert.equal(
			copyText,
			"COPY packages/routerlicious/package*.json packages/routerlicious/",
		);
	});
});
