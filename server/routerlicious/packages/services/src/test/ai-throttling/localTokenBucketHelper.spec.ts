/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import Sinon from "sinon";
import { LocalTokenBucketHelper } from "../../ai-throttling";

describe("LocalTokenBucketHelper", () => {
	let clock: Sinon.SinonFakeTimers;

	beforeEach(() => {
		clock = Sinon.useFakeTimers();
	});

	afterEach(() => {
		clock.restore();
	});

	describe("Basic functionality", () => {
		it("allows operations within burst capacity", () => {
			const helper = new LocalTokenBucketHelper({
				opsPerSecond: 10,
				burstCapacity: 5,
			});

			const id = "test-id";

			// Should allow operations up to burst capacity
			for (let i = 0; i < 5; i++) {
				const result = helper.tryConsumeTokens(id, 1);
				assert.strictEqual(
					result.isThrottled,
					false,
					`Operation ${i + 1} should not be throttled`,
				);
			}

			// Next operation should be throttled
			const result = helper.tryConsumeTokens(id, 1);
			assert.strictEqual(
				result.isThrottled,
				true,
				"Operation beyond burst should be throttled",
			);
		});

		it("replenishes tokens over time", () => {
			const helper = new LocalTokenBucketHelper({
				opsPerSecond: 10, // 10 ops/sec = 1 op per 100ms
				burstCapacity: 2,
				replenishIntervalMs: 50,
			});

			const id = "test-id";

			// Consume all tokens
			helper.tryConsumeTokens(id, 2);

			// Next operation should be throttled
			let result = helper.tryConsumeTokens(id, 1);
			assert.strictEqual(
				result.isThrottled,
				true,
				"Should be throttled after consuming all tokens",
			);

			// Advance time by 100ms (should replenish 1 token at 10 ops/sec)
			clock.tick(100);

			// Now should allow 1 operation
			result = helper.tryConsumeTokens(id, 1);
			assert.strictEqual(
				result.isThrottled,
				false,
				"Should allow operation after replenishment",
			);

			// But still throttle the next one
			result = helper.tryConsumeTokens(id, 1);
			assert.strictEqual(
				result.isThrottled,
				true,
				"Should throttle operation beyond replenished tokens",
			);
		});

		it("handles multiple buckets independently", () => {
			const helper = new LocalTokenBucketHelper({
				opsPerSecond: 10,
				burstCapacity: 1,
			});

			const id1 = "test-id-1";
			const id2 = "test-id-2";

			// Exhaust tokens for id1
			helper.tryConsumeTokens(id1, 1);
			let result1 = helper.tryConsumeTokens(id1, 1);
			assert.strictEqual(result1.isThrottled, true, "id1 should be throttled");

			// id2 should still have tokens available
			const result2 = helper.tryConsumeTokens(id2, 1);
			assert.strictEqual(result2.isThrottled, false, "id2 should not be throttled");
		});
	});

	describe("Token management", () => {
		it("allows returning tokens", () => {
			const helper = new LocalTokenBucketHelper({
				opsPerSecond: 10,
				burstCapacity: 2,
			});

			const id = "test-id";

			// Consume all tokens
			helper.tryConsumeTokens(id, 2);

			// Should be throttled
			let result = helper.tryConsumeTokens(id, 1);
			assert.strictEqual(
				result.isThrottled,
				true,
				"Should be throttled after consuming all tokens",
			);

			// Return 1 token
			helper.returnTokens(id, 1);

			// Should now allow operation
			result = helper.tryConsumeTokens(id, 1);
			assert.strictEqual(
				result.isThrottled,
				false,
				"Should allow operation after returning tokens",
			);
		});

		it("does not allow token count to exceed burst capacity", () => {
			const helper = new LocalTokenBucketHelper({
				opsPerSecond: 10,
				burstCapacity: 5,
			});

			const id = "test-id";

			// Try to return more tokens than the bucket can hold
			helper.returnTokens(id, 10);

			// Should only have burst capacity tokens
			const tokenCount = helper.getTokenCount(id);
			assert.strictEqual(tokenCount, 5, "Token count should not exceed burst capacity");
		});
	});

	describe("Rate limiting calculations", () => {
		it("calculates correct retry time for throttled operations", () => {
			const helper = new LocalTokenBucketHelper({
				opsPerSecond: 10, // 1 token per 100ms
				burstCapacity: 1,
				replenishIntervalMs: 50,
			});

			const id = "test-id";

			// Consume available token
			helper.tryConsumeTokens(id, 1);

			// Try to consume 2 more tokens (1 token deficit)
			const result = helper.tryConsumeTokens(id, 2);
			assert.strictEqual(result.isThrottled, true, "Should be throttled");

			// Should need to wait at least 100ms for 1 token (at 10 ops/sec)
			assert(
				result.retryAfterInMs >= 100,
				`Retry time ${result.retryAfterInMs}ms should be at least 100ms`,
			);
		});

		it("gives accurate throttle status", () => {
			const helper = new LocalTokenBucketHelper({
				opsPerSecond: 10,
				burstCapacity: 2,
			});

			const id = "test-id";

			// Initial status should be not throttled
			let status = helper.getThrottleStatus(id);
			assert.strictEqual(status.throttleStatus, false, "Should not be throttled initially");

			// Consume all tokens (should still not be throttled since operation succeeded)
			helper.tryConsumeTokens(id, 2);
			status = helper.getThrottleStatus(id);
			assert.strictEqual(
				status.throttleStatus,
				false,
				"Should not be throttled after successful consumption",
			);

			// Try to consume more tokens than available (this should be throttled)
			const result = helper.tryConsumeTokens(id, 1);
			assert.strictEqual(
				result.isThrottled,
				true,
				"Should be throttled when trying to consume more than available",
			);

			// Status should now reflect throttled state
			status = helper.getThrottleStatus(id);
			assert.strictEqual(
				status.throttleStatus,
				true,
				"Should be throttled after failed consumption attempt",
			);
		});
	});

	describe("Configuration", () => {
		it("uses default burst capacity equal to ops per second", () => {
			const helper = new LocalTokenBucketHelper({
				opsPerSecond: 15,
				// No burstCapacity specified
			});

			const id = "test-id";

			// Should allow 15 operations (default burst = opsPerSecond)
			for (let i = 0; i < 15; i++) {
				const result = helper.tryConsumeTokens(id, 1);
				assert.strictEqual(
					result.isThrottled,
					false,
					`Operation ${i + 1} should not be throttled`,
				);
			}

			// 16th operation should be throttled
			const result = helper.tryConsumeTokens(id, 1);
			assert.strictEqual(result.isThrottled, true, "16th operation should be throttled");
		});

		it("uses custom burst capacity when specified", () => {
			const helper = new LocalTokenBucketHelper({
				opsPerSecond: 20,
				burstCapacity: 5, // Smaller than opsPerSecond
			});

			const id = "test-id";

			// Should allow 5 operations (custom burst capacity)
			for (let i = 0; i < 5; i++) {
				const result = helper.tryConsumeTokens(id, 1);
				assert.strictEqual(
					result.isThrottled,
					false,
					`Operation ${i + 1} should not be throttled`,
				);
			}

			// 6th operation should be throttled
			const result = helper.tryConsumeTokens(id, 1);
			assert.strictEqual(result.isThrottled, true, "6th operation should be throttled");
		});
	});

	describe("Utility methods", () => {
		it("clears all bucket states", () => {
			const helper = new LocalTokenBucketHelper({
				opsPerSecond: 10,
				burstCapacity: 1,
			});

			const id = "test-id";

			// Consume token to create state
			helper.tryConsumeTokens(id, 1);

			// Should be throttled
			let result = helper.tryConsumeTokens(id, 1);
			assert.strictEqual(result.isThrottled, true, "Should be throttled");

			// Clear all states
			helper.clearAll();

			// Should have fresh state (not throttled)
			result = helper.tryConsumeTokens(id, 1);
			assert.strictEqual(result.isThrottled, false, "Should not be throttled after clearing");
		});

		it("reports correct token count", () => {
			const helper = new LocalTokenBucketHelper({
				opsPerSecond: 10,
				burstCapacity: 5,
			});

			const id = "test-id";

			// Initial count should be burst capacity
			let count = helper.getTokenCount(id);
			assert.strictEqual(count, 5, "Initial token count should equal burst capacity");

			// Consume 2 tokens
			helper.tryConsumeTokens(id, 2);
			count = helper.getTokenCount(id);
			assert.strictEqual(count, 3, "Token count should decrease after consumption");

			// Return 1 token
			helper.returnTokens(id, 1);
			count = helper.getTokenCount(id);
			assert.strictEqual(count, 4, "Token count should increase after returning tokens");
		});
	});
});
