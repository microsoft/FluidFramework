/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict } from "assert";

import { assert } from "../../assert";

describe("Assert", () => {
	it("Validate Shortcode Format", async () => {
		// short codes should be hex, and at least 3 chars
		for (const shortCode of ["0x000", "0x03a", "0x200", "0x4321"]) {
			try {
				assert(false, Number.parseInt(shortCode, 16));
			} catch (error: any) {
				strict(error instanceof Error, "not an error");
				strict.strictEqual(error.message, shortCode, "incorrect short code format");
			}
		}
	});
});
