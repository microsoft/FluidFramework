/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { runSingle } from "../utils.js";

describe("container-loader utils", () => {
	describe("runSingle", () => {
		it("correctly calls internal func", async () => {
			const wrappedFunc = runSingle(async (base: number, plus: number) => base + plus);

			assert.strictEqual(await wrappedFunc(4, 1), 5);
		});

		it("returns same promise for same args", async () => {
			const wrappedFunc = runSingle(async (base: number, plus: number) => base + plus);

			const [p1, p2] = [wrappedFunc(4, 1), wrappedFunc(4, 1)];

			assert.strictEqual(p2, p1);
			assert.strictEqual(await p1, 5);
			assert.strictEqual(await p2, 5);
		});

		it("fails for different args", async () => {
			const wrappedFunc = runSingle(async (base: number, plus: number) => base + plus);

			const [p1, p2] = [wrappedFunc(4, 1), wrappedFunc(4, 2)];

			assert.notStrictEqual(p2, p1);
			assert.strictEqual(await p1, 5);
			await p2
				.then(() => assert.fail("should fail"))
				.catch((e: Error) =>
					assert.strictEqual(
						e.message,
						"Subsequent calls cannot use different arguments.",
					),
				);
		});
	});
});
