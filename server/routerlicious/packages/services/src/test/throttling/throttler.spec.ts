/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import Sinon from "sinon";
import { TestEngine1, Lumberjack } from "@fluidframework/server-services-telemetry";
import { TestThrottleAndUsageStorageManager } from "@fluidframework/server-test-utils";
import { ThrottlingError } from "@fluidframework/server-services-core";
import {
	DistributedTokenBucketThrottler,
	IDistributedTokenBucketThrottlerConfig,
} from "../../throttling/distributedTokenBucketThrottler";

const lumberjackEngine = new TestEngine1();
if (!Lumberjack.isSetupCompleted()) {
	Lumberjack.setup([lumberjackEngine]);
}

describe("DistributedTokenBucketThrottler", () => {
	beforeEach(() => {
		Sinon.useFakeTimers(Date.now());
	});

	afterEach(() => {
		Sinon.restore();
	});

	describe("Basic Throttling Behavior", () => {
		it("allows operations within local capacity", () => {
			const config: IDistributedTokenBucketThrottlerConfig = {
				localTokenBucket: {
					capacity: 10,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 100,
				},
				distributedTokenBucket: {
					capacity: 100,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 1000,
					distributedSyncIntervalInMs: 5000,
				},
			};
			const storageManager = new TestThrottleAndUsageStorageManager();
			const throttler = new DistributedTokenBucketThrottler(
				storageManager,
				undefined,
				config,
			);
			const id = "test-id";

			// Should allow operations up to local capacity
			for (let i = 0; i < 10; i++) {
				assert.doesNotThrow(
					() => {
						throttler.incrementCount(id, 1);
					},
					`Operation ${i + 1} should be allowed`,
				);
			}
		});

		it("throttles when local capacity exceeded", () => {
			const config: IDistributedTokenBucketThrottlerConfig = {
				localTokenBucket: {
					capacity: 5,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 100,
				},
				distributedTokenBucket: {
					capacity: 100,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 1000,
					distributedSyncIntervalInMs: 5000,
				},
			};
			const storageManager = new TestThrottleAndUsageStorageManager();
			const throttler = new DistributedTokenBucketThrottler(
				storageManager,
				undefined,
				config,
			);
			const id = "test-id";

			// Consume all local tokens
			for (let i = 0; i < 5; i++) {
				throttler.incrementCount(id, 1);
			}

			// Next operation should be throttled
			assert.throws(
				() => {
					throttler.incrementCount(id, 1);
				},
				ThrottlingError,
				"Should throttle when local capacity exceeded",
			);
		});

		it("allows operations after local token refill", () => {
			const config: IDistributedTokenBucketThrottlerConfig = {
				localTokenBucket: {
					capacity: 5,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 100,
				},
				distributedTokenBucket: {
					capacity: 100,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 1000,
					distributedSyncIntervalInMs: 5000,
				},
			};
			const storageManager = new TestThrottleAndUsageStorageManager();
			const throttler = new DistributedTokenBucketThrottler(
				storageManager,
				undefined,
				config,
			);
			const id = "test-id";

			// Consume all local tokens
			for (let i = 0; i < 5; i++) {
				throttler.incrementCount(id, 1);
			}

			// Should be throttled
			assert.throws(() => {
				throttler.incrementCount(id, 1);
			}, ThrottlingError);

			// Wait for refill
			Sinon.clock.tick(200); // Past cooldown and some refill

			// Should allow operations again
			assert.doesNotThrow(() => {
				throttler.incrementCount(id, 1);
			}, "Should allow operations after refill");
		});

		it("handles weighted operations correctly", () => {
			const config: IDistributedTokenBucketThrottlerConfig = {
				localTokenBucket: {
					capacity: 10,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 100,
				},
				distributedTokenBucket: {
					capacity: 100,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 1000,
					distributedSyncIntervalInMs: 5000,
				},
			};
			const storageManager = new TestThrottleAndUsageStorageManager();
			const throttler = new DistributedTokenBucketThrottler(
				storageManager,
				undefined,
				config,
			);
			const id = "test-id";

			// Heavy operation should consume multiple tokens
			assert.doesNotThrow(() => {
				throttler.incrementCount(id, 5);
			});

			// Should have 5 tokens left
			assert.doesNotThrow(() => {
				throttler.incrementCount(id, 5);
			});

			// Should be throttled now
			assert.throws(() => {
				throttler.incrementCount(id, 1);
			}, ThrottlingError);
		});

		it("allows replenishment via decrementCount", () => {
			const config: IDistributedTokenBucketThrottlerConfig = {
				localTokenBucket: {
					capacity: 5,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 100,
				},
				distributedTokenBucket: {
					capacity: 100,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 1000,
					distributedSyncIntervalInMs: 5000,
				},
			};
			const storageManager = new TestThrottleAndUsageStorageManager();
			const throttler = new DistributedTokenBucketThrottler(
				storageManager,
				undefined,
				config,
			);
			const id = "test-id";

			// Consume all tokens
			for (let i = 0; i < 5; i++) {
				throttler.incrementCount(id, 1);
			}

			// Should be throttled
			assert.throws(() => {
				throttler.incrementCount(id, 1);
			}, ThrottlingError);

			// Replenish some tokens
			throttler.decrementCount(id, 2);

			// Should allow operations again
			assert.doesNotThrow(() => {
				throttler.incrementCount(id, 1);
			});
		});
	});

	describe("Distributed Coordination", () => {
		it("syncs with distributed storage periodically", async () => {
			const config: IDistributedTokenBucketThrottlerConfig = {
				localTokenBucket: {
					capacity: 100, // High local capacity
					refillRatePerMs: 1,
					minCooldownIntervalMs: 100,
				},
				distributedTokenBucket: {
					capacity: 10, // Lower distributed capacity
					refillRatePerMs: 1,
					minCooldownIntervalMs: 100,
					distributedSyncIntervalInMs: 500,
				},
			};
			const storageManager = new TestThrottleAndUsageStorageManager();
			const throttler = new DistributedTokenBucketThrottler(
				storageManager,
				undefined,
				config,
			);
			const id = "test-id";

			// Consume tokens
			for (let i = 0; i < 8; i++) {
				throttler.incrementCount(id, 1);
			}

			// Advance time to trigger distributed sync
			Sinon.clock.tick(600);

			// Next operation should trigger sync
			throttler.incrementCount(id, 1);

			await Sinon.clock.nextAsync();

			// Verify distributed storage was updated
			const stored = await storageManager.getThrottlingMetric(id);
			assert.ok(stored, "Should have stored distributed state");
			assert.ok(stored.count < 10, "Should reflect consumed tokens in distributed storage");
		});

		it("respects distributed throttling limits", async () => {
			const config: IDistributedTokenBucketThrottlerConfig = {
				localTokenBucket: {
					capacity: 100, // High local capacity so it won't interfere
					refillRatePerMs: 1,
					minCooldownIntervalMs: 100,
				},
				distributedTokenBucket: {
					capacity: 3, // Low distributed capacity for easy testing
					refillRatePerMs: 1,
					minCooldownIntervalMs: 100,
					distributedSyncIntervalInMs: 100, // Short sync interval
				},
			};
			const storageManager = new TestThrottleAndUsageStorageManager();
			const throttler = new DistributedTokenBucketThrottler(
				storageManager,
				undefined,
				config,
			);
			const id = "test-id";

			// Use up the distributed capacity gradually
			throttler.incrementCount(id, 1); // 1/3
			throttler.incrementCount(id, 1); // 2/3
			throttler.incrementCount(id, 1); // 3/3 - at capacity

			// Force sync to update distributed state
			Sinon.clock.tick(200); // Past sync interval

			// This should sync but might still allow the operation due to async behavior
			throttler.incrementCount(id, 1); // Over capacity

			// Wait for async sync
			await Sinon.clock.nextAsync();

			// Now try another operation - this should be throttled
			assert.throws(
				() => {
					throttler.incrementCount(id, 1);
				},
				ThrottlingError,
				"Should respect distributed throttling limits",
			);
		});

		it("uses most restrictive bucket (local OR distributed)", () => {
			const config: IDistributedTokenBucketThrottlerConfig = {
				localTokenBucket: {
					capacity: 3, // Lower local capacity
					refillRatePerMs: 1,
					minCooldownIntervalMs: 100,
				},
				distributedTokenBucket: {
					capacity: 10, // Higher distributed capacity
					refillRatePerMs: 1,
					minCooldownIntervalMs: 100,
					distributedSyncIntervalInMs: 5000, // Long sync interval
				},
			};
			const storageManager = new TestThrottleAndUsageStorageManager();
			const throttler = new DistributedTokenBucketThrottler(
				storageManager,
				undefined,
				config,
			);
			const id = "test-id";

			// Should be limited by local capacity (3), not distributed (10)
			for (let i = 0; i < 3; i++) {
				assert.doesNotThrow(() => {
					throttler.incrementCount(id, 1);
				});
			}

			// Should be throttled by local bucket
			assert.throws(
				() => {
					throttler.incrementCount(id, 1);
				},
				ThrottlingError,
				"Should be limited by most restrictive bucket",
			);
		});
	});

	describe("Multiple IDs", () => {
		it("handles different IDs independently", () => {
			const config: IDistributedTokenBucketThrottlerConfig = {
				localTokenBucket: {
					capacity: 5,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 100,
				},
				distributedTokenBucket: {
					capacity: 50,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 1000,
					distributedSyncIntervalInMs: 5000,
				},
			};
			const storageManager = new TestThrottleAndUsageStorageManager();
			const throttler = new DistributedTokenBucketThrottler(
				storageManager,
				undefined,
				config,
			);

			// Exhaust capacity for first ID
			for (let i = 0; i < 5; i++) {
				throttler.incrementCount("id1", 1);
			}

			// First ID should be throttled
			assert.throws(() => {
				throttler.incrementCount("id1", 1);
			}, ThrottlingError);

			// Second ID should still work
			assert.doesNotThrow(() => {
				throttler.incrementCount("id2", 1);
			});
		});

		it("maintains separate cache state for each ID", () => {
			const config: IDistributedTokenBucketThrottlerConfig = {
				localTokenBucket: {
					capacity: 5,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 100,
				},
				distributedTokenBucket: {
					capacity: 50,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 1000,
					distributedSyncIntervalInMs: 5000,
				},
			};
			const storageManager = new TestThrottleAndUsageStorageManager();
			const throttler = new DistributedTokenBucketThrottler(
				storageManager,
				undefined,
				config,
			);

			// Operations on different IDs shouldn't interfere
			throttler.incrementCount("tenant1", 3);
			throttler.incrementCount("tenant2", 2);
			throttler.decrementCount("tenant1", 1);

			// Both should be able to continue
			assert.doesNotThrow(() => {
				throttler.incrementCount("tenant1", 1);
			});
			assert.doesNotThrow(() => {
				throttler.incrementCount("tenant2", 1);
			});
		});
	});

	describe("Cache Management", () => {
		it("respects max cache size", () => {
			const config: IDistributedTokenBucketThrottlerConfig = {
				localTokenBucket: {
					capacity: 10,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 100,
				},
				distributedTokenBucket: {
					capacity: 100,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 1000,
					distributedSyncIntervalInMs: 5000,
				},
				maxLocalCacheSize: 3,
			};
			const storageManager = new TestThrottleAndUsageStorageManager();
			const throttler = new DistributedTokenBucketThrottler(
				storageManager,
				undefined,
				config,
			);

			// Create entries for multiple IDs
			throttler.incrementCount("id1", 1);
			throttler.incrementCount("id2", 1);
			throttler.incrementCount("id3", 1);
			throttler.incrementCount("id4", 1); // Should evict oldest

			// First ID should have been evicted, so should start fresh
			assert.doesNotThrow(() => {
				throttler.incrementCount("id1", 10); // Should work if cache was cleared
			});
		});

		it("respects cache age limits", () => {
			const config: IDistributedTokenBucketThrottlerConfig = {
				localTokenBucket: {
					capacity: 10,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 100,
				},
				distributedTokenBucket: {
					capacity: 100,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 1000,
					distributedSyncIntervalInMs: 5000,
				},
				maxLocalCacheAgeInMs: 1000,
			};
			const storageManager = new TestThrottleAndUsageStorageManager();
			const throttler = new DistributedTokenBucketThrottler(
				storageManager,
				undefined,
				config,
			);
			const id = "test-id";

			// Use some tokens
			throttler.incrementCount(id, 5);

			// Should be able to use remaining tokens
			assert.doesNotThrow(() => {
				throttler.incrementCount(id, 5);
			});

			// Should be throttled now
			assert.throws(() => {
				throttler.incrementCount(id, 1);
			}, ThrottlingError);

			// Wait for cache to expire
			Sinon.clock.tick(1100);

			// Should start fresh with new bucket
			assert.doesNotThrow(() => {
				throttler.incrementCount(id, 1);
			}, "Should work with fresh bucket after cache expiry");
		});
	});

	describe("Usage Data Handling", () => {
		it("passes usage data correctly", async () => {
			const config: IDistributedTokenBucketThrottlerConfig = {
				localTokenBucket: {
					capacity: 10,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 100,
				},
				distributedTokenBucket: {
					capacity: 100,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 1000,
					distributedSyncIntervalInMs: 500,
				},
			};
			const storageManager = new TestThrottleAndUsageStorageManager();
			const throttler = new DistributedTokenBucketThrottler(
				storageManager,
				undefined,
				config,
			);
			const id = "test-id";
			const usageStorageId = "usage-id";
			const usageData = {
				value: 0,
				tenantId: "test-tenant",
				documentId: "test-doc",
			};

			// Make operation with usage data
			throttler.incrementCount(id, 1, usageStorageId, usageData);

			// Advance time to trigger sync
			Sinon.clock.tick(600);
			throttler.incrementCount(id, 1);

			await Sinon.clock.nextAsync();

			// Should work without errors
			assert.doesNotThrow(() => {
				throttler.incrementCount(id, 1);
			});
		});

		it("handles zero weight operations", () => {
			const config: IDistributedTokenBucketThrottlerConfig = {
				localTokenBucket: {
					capacity: 10,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 100,
				},
				distributedTokenBucket: {
					capacity: 100,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 1000,
					distributedSyncIntervalInMs: 5000,
				},
			};
			const storageManager = new TestThrottleAndUsageStorageManager();
			const throttler = new DistributedTokenBucketThrottler(
				storageManager,
				undefined,
				config,
			);
			const id = "test-id";

			// Zero weight operations should always work
			assert.doesNotThrow(() => {
				throttler.incrementCount(id, 0);
			});

			// Even after exhausting capacity
			for (let i = 0; i < 10; i++) {
				throttler.incrementCount(id, 1);
			}

			assert.throws(() => {
				throttler.incrementCount(id, 1);
			}, ThrottlingError);

			// Zero weight should still work
			assert.doesNotThrow(() => {
				throttler.incrementCount(id, 0);
			});
		});
	});

	describe("Error Handling", () => {
		it("handles storage errors gracefully", async () => {
			const config: IDistributedTokenBucketThrottlerConfig = {
				localTokenBucket: {
					capacity: 10,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 100,
				},
				distributedTokenBucket: {
					capacity: 100,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 1000,
					distributedSyncIntervalInMs: 500,
				},
			};
			const storageManager = new TestThrottleAndUsageStorageManager();

			// Stub storage to fail
			Sinon.stub(storageManager, "getThrottlingMetric").rejects(new Error("Storage error"));

			const throttler = new DistributedTokenBucketThrottler(
				storageManager,
				undefined,
				config,
			);
			const id = "test-id";

			// Should not throw even with storage errors
			assert.doesNotThrow(() => {
				throttler.incrementCount(id, 1);
			});

			// Trigger sync
			Sinon.clock.tick(600);
			throttler.incrementCount(id, 1);

			await Sinon.clock.nextAsync();

			// Should continue working despite storage errors
			assert.doesNotThrow(() => {
				throttler.incrementCount(id, 1);
			});
		});

		it("handles decrementCount on non-existent bucket gracefully", () => {
			const config: IDistributedTokenBucketThrottlerConfig = {
				localTokenBucket: {
					capacity: 10,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 100,
				},
				distributedTokenBucket: {
					capacity: 100,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 1000,
					distributedSyncIntervalInMs: 5000,
				},
			};
			const storageManager = new TestThrottleAndUsageStorageManager();
			const throttler = new DistributedTokenBucketThrottler(
				storageManager,
				undefined,
				config,
			);
			const id = "test-id";

			// Should not throw when decrementing on non-existent bucket
			assert.doesNotThrow(() => {
				throttler.decrementCount(id, 1);
			});
		});
	});

	describe("Compatibility with Legacy Behavior", () => {
		it("behaves more strictly than legacy throttler", () => {
			// This test demonstrates that the new throttler is more strict than legacy
			// Legacy throttler was "lenient" - allowed operations through during background updates
			// New throttler is immediate - uses local bucket for instant feedback

			const config: IDistributedTokenBucketThrottlerConfig = {
				localTokenBucket: {
					capacity: 5,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 100,
				},
				distributedTokenBucket: {
					capacity: 50,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 1000,
					distributedSyncIntervalInMs: 5000,
				},
			};
			const storageManager = new TestThrottleAndUsageStorageManager();
			const throttler = new DistributedTokenBucketThrottler(
				storageManager,
				undefined,
				config,
			);
			const id = "test-id";

			// Consume all local tokens
			for (let i = 0; i < 5; i++) {
				throttler.incrementCount(id, 1);
			}

			// Should be immediately throttled (unlike legacy which might allow during sync window)
			assert.throws(
				() => {
					throttler.incrementCount(id, 1);
				},
				ThrottlingError,
				"New throttler should be immediately strict",
			);
		});

		it("provides local protection between distributed syncs", () => {
			// This test shows the key improvement over legacy throttler
			// Local bucket provides immediate protection during the distributed sync intervals

			const config: IDistributedTokenBucketThrottlerConfig = {
				localTokenBucket: {
					capacity: 3, // Small local bucket for immediate protection
					refillRatePerMs: 1,
					minCooldownIntervalMs: 100,
				},
				distributedTokenBucket: {
					capacity: 100, // Large distributed bucket
					refillRatePerMs: 1,
					minCooldownIntervalMs: 1000,
					distributedSyncIntervalInMs: 10000, // Long sync interval
				},
			};
			const storageManager = new TestThrottleAndUsageStorageManager();
			const throttler = new DistributedTokenBucketThrottler(
				storageManager,
				undefined,
				config,
			);
			const id = "test-id";

			// Even with long sync intervals, local bucket provides immediate protection
			for (let i = 0; i < 3; i++) {
				throttler.incrementCount(id, 1);
			}

			// Should be throttled immediately by local bucket
			assert.throws(
				() => {
					throttler.incrementCount(id, 1);
				},
				ThrottlingError,
				"Local bucket should provide immediate protection",
			);
		});
	});

	describe("Enhanced Telemetry", () => {
		it("works with enhanced telemetry enabled", () => {
			const config: IDistributedTokenBucketThrottlerConfig = {
				localTokenBucket: {
					capacity: 5,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 100,
				},
				distributedTokenBucket: {
					capacity: 50,
					refillRatePerMs: 1,
					minCooldownIntervalMs: 1000,
					distributedSyncIntervalInMs: 5000,
				},
				enableEnhancedTelemetry: true,
				maxLocalCacheSize: 2, // Small cache to trigger disposal
			};
			const storageManager = new TestThrottleAndUsageStorageManager();
			const throttler = new DistributedTokenBucketThrottler(
				storageManager,
				undefined,
				config,
			);

			// Should work without throwing even with enhanced telemetry
			assert.doesNotThrow(() => {
				throttler.incrementCount("id1", 1);
				throttler.incrementCount("id2", 1);
				throttler.incrementCount("id3", 1); // Should trigger cache disposal
			});
		});
	});
});
