/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "chai";

import { previousVersion } from "../../src/commands/typetests";

describe("typetests tests", () => {
	describe("previousVersion", () => {
		const cases: [string, string][] = [
			["1.3.3", "1.3.2"],
			["2.0.0", "1.0.0"],
			["4.5.12", "4.5.11"],
			["2.0.0-internal.1.1.0", "2.0.0-internal.1.0.0"],
			["2.0.0-internal.2.0.0", "2.0.0-internal.1.0.0"],
			["2.0.0-internal.3.2.2", "2.0.0-internal.3.2.1"],

			// These cases meet spec, but show cases that you might not want to use "previousVersion".
			// Fortunately if this is not the desired behaviors, all of these result in packages that won't exist,
			// so install will fail (assuming this is used to select a version of a package to install) and the bad version can't be merged.
			["0.4.1000", "0.4.999"],
			["0.4.2000", "0.4.1999"],
			["0.59.3000", "0.59.2999"],
			["2.0.0-internal.1.0.0", "2.0.0-internal.0.0.0"],
		];
		for (const [input, expected] of cases) {
			it(input, () => {
				assert.equal(previousVersion(input), expected);
			});
		}
	});
});
