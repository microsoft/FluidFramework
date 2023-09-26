/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { capitalize } from "../../util";

describe("Utils", () => {
	it("capitalize", () => {
		const data: [string, string][] = [
			["", ""],
			["a", "A"],
			["aa", "Aa"],
			// Non-ascii
			["ñx", "Ñx"],
			// Lowercase letter that is 2 UTF-16 code units:
			["𞥃", "𞤡"],
			["𞥃a", "𞤡a"],
		];
		for (const [input, expected] of data) {
			assert.equal(capitalize(input), expected);
		}
	});
});
