/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { testBaseVersion } from "../baseVersion.js";

describe("testBaseVersion", () => {
	it("test base version returns base version when there is no comparison and the code version when there is a comparison", () => {
		assert.strictEqual(
			testBaseVersion(0, "0.0.0-110039-test", "2.0.0-dev.2.1.0.110039-test"),
			"0.0.0-110039-test",
		);
		assert.strictEqual(
			testBaseVersion(undefined, "0.0.0-110039-test", "2.0.0-dev.2.1.0.110039-test"),
			"0.0.0-110039-test",
		);
		assert.strictEqual(
			testBaseVersion(
				"9.0.0-special-version",
				"0.0.0-110039-test",
				"2.0.0-dev.2.1.0.110039-test",
			),
			"0.0.0-110039-test",
		);
		assert.strictEqual(
			testBaseVersion(
				"9.0.0-special-version",
				"0.0.0-110039-test",
				"2.0.0-dev.2.1.0.110039-test",
			),
			"0.0.0-110039-test",
		);

		assert.strictEqual(
			testBaseVersion(-1, "0.0.0-110039-test", "2.0.0-dev.2.1.0.110039-test"),
			"2.0.0-dev.2.1.0.110039-test",
		);
	});
});
