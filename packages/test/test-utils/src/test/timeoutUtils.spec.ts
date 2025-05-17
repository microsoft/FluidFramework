/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { timeoutPromise } from "../timeoutUtils.js";

/**
 * NOTE: it's a bit tricky to test this utility using mocha tests, because by design it has special behavior if it
 * is running in a mocha test that is about to time out.
 * Keep that in mind as you read/update the tests below.
 */
describe.only("TimeoutPromise", () => {
	beforeEach(async () => {
		// Make sure there are no setTimeouts left behind from previous tests,
		// by waiting longer than the timeout we use for tests.
		await timeoutPromise((resolve) => setTimeout(resolve, 50));
	});

	afterEach(async () => {
		// Make sure there are no setTimeouts left behind from the test that just ran,
		// by waiting longer than the timeout we use for tests.
		await timeoutPromise((resolve) => setTimeout(resolve, 50));
	});

	describe("Tests unrelated to mocha timeouts", () => {
		it("Doesn't time out and provides return value", async () => {
			const value = await timeoutPromise<number>((resolve) => {
				resolve(3);
			});
			assert.equal(value, 3, "Value not returned");
		});

		it("Times out if it goes past a specified valid duration", async () => {
			try {
				await timeoutPromise(() => {}, { durationMs: 1 });
				assert(false, "should have timed out");
			} catch (e: any) {
				assert.equal(e.message, "Timed out (1ms)");
			}
		});

		it("Doesn't time out with duration of 0", async () => {
			try {
				await timeoutPromise(
					(resolve) => {
						// Need to subtract enough time to account for the buffer that the TestTimeout class uses, so the utility
						// function's behavior when it runs inside a mocha test that is about to time out doesn't trigger.
						setTimeout(resolve, 25 - 15);
					},
					{ durationMs: 0 },
				);
			} catch (e: any) {
				assert(false, `should not have timed out: ${e.message}`);
			}
		}).timeout(25);

		it("Doesn't time out if promise is rejected", async () => {
			try {
				await timeoutPromise((resolve, reject) => {
					reject(new Error("blah"));
				});
				assert(false, "should have thrown");
			} catch (e: any) {
				assert.equal(e.message, "blah");
			}
		});

		it("Provides the specified value if 'reject: false' is specified, instead of timing out", async () => {
			try {
				const value = await timeoutPromise(() => {}, {
					durationMs: 1,
					reject: false,
					value: 1,
				});
				assert.equal(value, 1, "Timeout should have returned the value given in options");
			} catch (e: any) {
				assert(false, `should not have timed out: ${e.message}`);
			}
		});

		it("Custom error message is included in timeout", async () => {
			try {
				await timeoutPromise(() => {}, {
					durationMs: 1,
					errorMsg: "hello",
				});
				assert(false, "should have timed out");
			} catch (e: any) {
				assert.equal(
					e.message,
					"hello (1ms)",
					"Error message should have been the one given in options",
				);
			}
		});
	});

	describe("Tests for behavior related to mocha timeouts", () => {
		it("Times out if no options are specified", async () => {
			try {
				await timeoutPromise(() => {});
				assert(false, "should have timed out");
			} catch (e: any) {
				assert.equal(e.message, "Forcing timeout before test does (10ms)");
			}
		}).timeout(25);

		it("Times out if empty options are specified", async () => {
			try {
				await timeoutPromise(() => {}, {});
				assert(false, "should have timed out");
			} catch (e: any) {
				assert.equal(e.message, "Forcing timeout before test does (10ms)");
			}
		}).timeout(25);

		it("Times out if duration (longer than mocha test timeout) is specified", async () => {
			try {
				await timeoutPromise(() => {}, { durationMs: 100 });
				assert(false, "should have timed out");
			} catch (e: any) {
				assert.equal(e.message, "Forcing timeout before test does (10ms)");
			}
		}).timeout(25);

		it("Times out as expected if called multiple times inside a test with no specific durations", async () => {
			try {
				// First call will resolve before test timeout.
				await timeoutPromise(
					(resolve) => {
						setTimeout(resolve, 30);
					},
					{ errorMsg: "First call" },
				);
				// Second call on its own would resolve before test timeout, but the first call already "consumed"
				// 30ms of the 50ms (total test timeout) so this one should get timed out by timeoutPromise.
				await timeoutPromise(
					(resolve) => {
						setTimeout(resolve, 30);
					},
					{ errorMsg: "Second call" },
				);
				assert(false, "should have timed out");
			} catch (e: any) {
				assert.equal(e.message, "Second call (35ms)");
			}
		}).timeout(50);

		let retryCount = -1;
		it("timeoutPromise state is reset correctly if a mocha test times out", async () => {
			// Cause a timeout the first time but pass on retry, to ensure that if a test is timed out by mocha
			// we reset the state used by timeoutPromise.
			retryCount++;
			if (retryCount === 0) {
				await new Promise(() => {});
				assert(false, "should have timed out the first time");
			}
			// Should not time out when retried
			assert.equal(retryCount, 1);
		})
			.timeout(25)
			.retries(1);

		describe("Updating timeout from inside test", () => {
			// These tests make sure that if Mocha's methods to update a test timeout (e.g. calling this.timeout() inside the
			// test) are used, our timeout utils react appropriately.
			// The general idea is that we create the tests with some base timeout, inside the test we increase it, and we
			// use our utility function on a promise that resolves after a time longer than the original test timeout but less
			// than the updated one.

			it("Doesn't time out if promise resolves before new mocha test timeout", async function () {
				this.timeout(100);
				try {
					await timeoutPromise((resolve) => {
						// The timeout here should be higher than the original test timeout, but lower than the updated one (minus
						// the buffer used in TestTimeout), so we're actually testing that the utility function doesn't trigger
						// based on the original test timeout.
						setTimeout(resolve, 30);
					});
				} catch (e: any) {
					assert(false, `should not have timed out: ${e.message}`);
				}
			}).timeout(15);

			it("Times out if promise would take longer than new mocha test timeout", async function () {
				const updatedTimeout = 50;
				this.timeout(updatedTimeout);
				try {
					await timeoutPromise((resolve) => {
						// The timeout here should be higher than the original test timeout, and also higher than the updated one
						// minus the buffer used in TestTimeout, so the utility function triggers.
						setTimeout(resolve, updatedTimeout - 10);
					});
					assert(false, "should have timed out");
				} catch (e: any) {
					assert.equal(e.message, "Forcing timeout before test does (35ms)");
				}
			}).timeout(15);

			it("Times out with specific duration provided", async function () {
				this.timeout(100);
				try {
					await timeoutPromise(
						(resolve) => {
							setTimeout(resolve, 100);
						},
						{ durationMs: 1 },
					);
					assert(false, "should have timed out");
				} catch (e: any) {
					assert.equal(e.message, "Timed out (1ms)");
				}
			}).timeout(25);
		});

		describe("Validate hooks", () => {
			// This suite makes sure that timeoutPromise works as expected inside mocha hooks.

			async function hookValidationFunction(this: Mocha.Context): Promise<void> {
				this.timeout(25);
				try {
					await timeoutPromise((resolve) => {
						setTimeout(resolve, 50);
					});
					assert(false, "should have timed out");
				} catch (e: any) {
					assert.equal(e.message, "Forcing timeout before test does (10ms)");
				}
			}
			before(hookValidationFunction);
			beforeEach(hookValidationFunction);
			afterEach(hookValidationFunction);
			after(hookValidationFunction);

			it("Validate hooks", () => {
				// This test doesn't need to do anything, it only exists so the beforEach and afterEach hooks trigger
				assert(true);
			});
		});
	});
});
