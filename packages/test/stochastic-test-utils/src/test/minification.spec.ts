/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { assert as coreAssert, fail } from "@fluidframework/core-utils/internal";

import { extractMessage } from "../minification.js";

function requireLines(s: string, count = 1): void {
	assert.equal(s.split("\n").length, count, `Expected ${count} lines in:\n${s}`);
}

describe("Minification", () => {
	describe("extractMessage", () => {
		it("non assert", () => {
			function namedFunction() {
				return new Error("message");
			}
			const e = namedFunction();
			assert(e.stack !== undefined);
			const message = extractMessage(e.stack);
			requireLines(message);
			assert.match(message, /^at namedFunction .*minification\.spec\.ts/);
		});

		it("node assert", () => {
			function namedFunction(): Error {
				try {
					assert(false);
				} catch (err: unknown) {
					return err as Error;
				}
			}
			const e = namedFunction();
			assert(e.stack !== undefined);
			const message = extractMessage(e.stack);
			requireLines(message);
			assert.match(message, /^at namedFunction .*minification\.spec\.ts/);
		});

		it("core assert", () => {
			function namedFunction(): Error {
				try {
					coreAssert(false, "message");
				} catch (err: unknown) {
					return err as Error;
				}
			}
			const e = namedFunction();
			assert(e.stack !== undefined);
			const message = extractMessage(e.stack);
			requireLines(message, 3);
			assert.match(message, /\nat namedFunction .*minification\.spec\.ts/);
		});

		it("node fail", () => {
			function namedFunction(): Error {
				try {
					assert.fail();
				} catch (err: unknown) {
					return err as Error;
				}
			}
			const e = namedFunction();
			assert(e.stack !== undefined);
			const message = extractMessage(e.stack);
			// Interestingly assert.fail() doesn't include itself in the stack.
			requireLines(message);
			assert.match(message, /^at namedFunction .*minification\.spec\.ts/);
		});

		it("core fail", () => {
			function namedFunction(): Error {
				try {
					fail("message");
				} catch (err: unknown) {
					return err as Error;
				}
			}
			const e = namedFunction();
			assert(e.stack !== undefined);
			const message = extractMessage(e.stack);
			requireLines(message, 2);
			assert.match(message, /^at fail/);
			assert.match(message, /\nat namedFunction .*minification\.spec\.ts/);
		});
	});
});
