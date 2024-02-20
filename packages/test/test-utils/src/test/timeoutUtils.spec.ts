/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { timeoutPromise } from "../timeoutUtils.js";

describe("TimeoutPromise", () => {
	beforeEach(async () => {
		// Make sure there are no timeout set left behind, wait larger then the test timeout
		await timeoutPromise((resolve) => setTimeout(resolve, 50));
	});

	afterEach(async () => {
		// Make sure there are no timeout set left behind, wait larger then the test timeout
		await timeoutPromise((resolve) => setTimeout(resolve, 50));
	});

	let runCount = 0;

	it("No timeout", async () => {
		if (runCount++ !== 1) {
			// only timeout the first time to test, but pass the second one,
			// to test the behavior of test timed out by mocha
			// to ensure that we reset the timeoutPromise state.
			const value = await timeoutPromise<number>((resolve) => {
				resolve(3);
			});
			assert(value === 3, "Value not returned");
		}
	})
		.timeout(25)
		.retries(1);

	it("Timeout", async () => {
		if (runCount++ !== 1) {
			// only timeout the first time to test, but pass the second one,
			// to test the behavior of test timed out by mocha
			// to ensure that we reset the timeoutPromise state.
			return new Promise(() => {});
		}
	})
		.timeout(25)
		.retries(1);

	it("Timeout with no options", async () => {
		try {
			await timeoutPromise(() => {});
			assert(false, "should have timed out");
		} catch (e: any) {
			assert(
				e.message.startsWith("Test timed out ("),
				`expected timeout error message: got ${e.message}`,
			);
		}
	}).timeout(25);

	it("Timeout with no duration", async () => {
		try {
			await timeoutPromise(() => {}, {});
			assert(false, "should have timed out");
		} catch (e: any) {
			assert(
				e.message.startsWith("Test timed out ("),
				`expected timeout error message: got ${e.message}`,
			);
		}
	}).timeout(25);

	it("Timeout with duration", async () => {
		try {
			await timeoutPromise(() => {}, { durationMs: 1 });
			assert(false, "should have timed out");
		} catch (e: any) {
			assert(
				e.message.startsWith("Timed out ("),
				`expected timeout error message: got ${e.message}`,
			);
		}
	}).timeout(25);

	it("No timeout with zero duration", async () => {
		try {
			await timeoutPromise(
				(resolve) => {
					setTimeout(resolve, 10);
				},
				{ durationMs: 0 },
			);
		} catch (e: any) {
			assert(false, `should not have timed out: ${e.message}`);
		}
	}).timeout(25);

	it("No timeout with negative duration", async function () {
		// Make sure resetTimeout in the test works
		this.timeout(100);
		try {
			await timeoutPromise(
				(resolve) => {
					setTimeout(resolve, 50);
				},
				{ durationMs: -1 },
			);
		} catch (e: any) {
			assert(false, `should not have timed out: ${e.message}`);
		}
	}).timeout(25);

	it("No timeout with Infinity duration", async function () {
		// Make sure resetTimeout in the test works
		this.timeout(100);
		try {
			await timeoutPromise(
				(resolve) => {
					setTimeout(resolve, 50);
				},
				{ durationMs: Infinity },
			);
		} catch (e: any) {
			assert(false, `should not have timed out: ${e.message}`);
		}
	}).timeout(25);

	it("No timeout with valid duration", async function () {
		// Make sure resetTimeout in the test works
		this.timeout(100);
		try {
			await timeoutPromise(
				(resolve) => {
					setTimeout(resolve, 50);
				},
				{ durationMs: 75 },
			);
		} catch (e: any) {
			assert(false, `should not have timed out: ${e.message}`);
		}
	}).timeout(25);

	it("No timeout with throw", async function () {
		// Make sure resetTimeout in the test works
		this.timeout(100);
		try {
			await timeoutPromise((resolve, reject) => {
				reject(new Error("blah"));
			});
			assert(false, "should have thrown");
		} catch (e: any) {
			assert(e.message === "blah", `should not have timed out: ${e.message}`);
		}
	}).timeout(25);

	it("Timeout with valid duration", async function () {
		// Make sure resetTimeout in the test works
		this.timeout(100);
		try {
			await timeoutPromise(
				(resolve) => {
					setTimeout(resolve, 75);
				},
				{ durationMs: 50 },
			);
			assert(false, "should have timed out");
		} catch (e: any) {
			assert(e.message.startsWith("Timed out ("), "expected timeout error message");
		}
	}).timeout(25);

	it("Timeout with no reject option", async () => {
		try {
			const value = await timeoutPromise(() => {}, {
				durationMs: 1,
				reject: false,
				value: 1,
			});
			assert(value === 1, "expect timeout to return value given in option");
		} catch (e: any) {
			assert(false, `should not have timed out: ${e.message}`);
		}
	}).timeout(25);

	it("Timeout rejection with error option", async () => {
		try {
			await timeoutPromise(() => {}, {
				durationMs: 1,
				errorMsg: "hello",
			});
			assert(false, "should have timed out");
		} catch (e: any) {
			assert(
				e.message.startsWith("hello"),
				"expected timeout reject error message given in option",
			);
		}
	}).timeout(25);
});
