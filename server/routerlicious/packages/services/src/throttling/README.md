# Distributed Token Bucket Throttling

This module provides a distributed throttling system based on the token bucket algorithm, designed to provide rate limiting across multiple service instances while maintaining local protection against traffic bursts.

## Overview

The `DistributedTokenBucketThrottler` implements a hybrid approach combining local and distributed rate limiting:

-   **Local Token Bucket**: Provides immediate protection within a single service instance
-   **Distributed Token Bucket**: Coordinates rate limiting across multiple service instances via shared storage
-   **Dual-Layer Protection**: Uses the most restrictive limit from either bucket

## Architecture

```text
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Instance A    │    │   Instance B    │    │   Instance C    │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │Local Bucket │ │    │ │Local Bucket │ │    │ │Local Bucket │ │
│ │(Immediate)  │ │    │ │(Immediate)  │ │    │ │(Immediate)  │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
│        │        │    │        │        │    │        │        │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │Distributed  │ │    │ │Distributed  │ │    │ │Distributed  │ │
│ │Bucket       │ │    │ │Bucket       │ │    │ │Bucket       │ │
│ │(Periodic)   │ │    │ │(Periodic)   │ │    │ │(Periodic)   │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────────────┐
                    │   Shared Storage    │
                    │  (Redis/MongoDB)    │
                    └─────────────────────┘
```

## Key Features

### Benefits

1. **Immediate Local Protection**: Local token buckets provide instant rate limiting without waiting for distributed coordination
2. **Cross-Instance Coordination**: Distributed buckets ensure global rate limits are respected across all service instances
3. **Reduced Storage Load**: Asynchronous periodic syncing minimizes pressure on shared storage
4. **Flexible Configuration**: Independent configuration of local and distributed bucket parameters
5. **Backward Compatibility**: Drop-in replacement for legacy throttling systems
6. **Enhanced Telemetry**: Optional detailed logging for monitoring and debugging

### Limitations

1. **Eventual Consistency**: Distributed state has a one sync-cycle delay, which may allow brief over-limit bursts
2. **Memory Overhead**: Maintains LRU cache of token buckets in memory per service instance
3. **Storage Dependency**: Requires shared storage (Redis/MongoDB) for distributed coordination
4. **Configuration Complexity**: Requires careful tuning of both local and distributed parameters

## Configuration

The throttler is configured via `IDistributedTokenBucketThrottlerConfig`:

### Local Token Bucket Configuration

```typescript
localTokenBucket: {
	capacity: number; // Maximum tokens the bucket can hold. Limits traffic spikes.
	refillRatePerMs: number; // Tokens added per millisecond. Maintains average rate of operations.
	minCooldownIntervalMs: number; // Minimum time between refill operations. Forces throttling for service to recover.
}
```

### Distributed Token Bucket Configuration

```typescript
distributedTokenBucket: {
	capacity: number; // Maximum tokens the bucket can hold. Limits traffic spikes.
	refillRatePerMs: number; // Tokens added per millisecond. Maintains average rate of operations.
	minCooldownIntervalMs: number; // Minimum time between refill operations. Forces throttling for service to recover.
	distributedSyncIntervalInMs: number; // How often to sync with storage. Limits the frequency of shared storage access.
}
```

### Cache and Telemetry Options

```typescript
{
    maxLocalCacheSize?: number;        // Max number of tracked IDs (default: 1,000,000)
    maxLocalCacheAgeInMs?: number;     // Cache entry expiration (default: 60,000ms)
    enableEnhancedTelemetry?: boolean; // Detailed logging (default: false)
}
```

## Usage Examples

### Basic Setup

The following sets up the throttler to use Redis for synchronized storage

```typescript
import {
	DistributedTokenBucketThrottler,
	IDistributedTokenBucketThrottlerConfig,
    RedisThrottleAndUsageStorageManager,
} from "@fluidframework/server-services";

const storageManager = new RedisThrottleAndUsageStorageManager(
    redisClientConnectionManager,
    parameters,
);

const config: IDistributedTokenBucketThrottlerConfig = {
	type: "DistributedTokenBucket",
	localTokenBucket: {
		capacity: 10, // Allow 10 operation burst per instance
		refillRatePerMs: 0.1, // Add 1 token every 10ms (100 ops/second)
		minCooldownIntervalMs: 100,
	},
	distributedTokenBucket: {
		capacity: 100, // Allow 100 operation burst across all instances
		refillRatePerMs: 1, // Allow 1 token per ms (1000 ops/second globally)
		minCooldownIntervalMs: 1000,
		distributedSyncIntervalInMs: 5000, // Sync every 5 seconds
	},
    maxLocalCacheSize: 1000, // Cap tracked IDs to 1000 (~0.5Mb) to limit memory use
    maxLocalCacheAgeInMs: 60000; // Clear stale tracked IDs after 1 minute
    enableEnhancedTelemetry: false; // Disable verbose logging to limit telemetry noise
};

const throttler = new DistributedTokenBucketThrottler(
	storageManager, // IThrottleAndUsageStorageManager instance
	undefined, // No special logging
	config,
);
```

### Rate Limiting Operations

```typescript
try {
	// Throttle a single operation
	throttler.incrementCount("user:12345", 1);

	// Throttle a weighted operation (e.g., expensive API call)
	throttler.incrementCount("api:upload", 5);

	// Process the operation...
} catch (error) {
	if (error instanceof ThrottlingError) {
		// Handle throttling
		const retryAfterSeconds = error.retryAfter;
		console.log(`Rate limited. Retry after ${retryAfterSeconds} seconds`);
		response
			.status(error.code)
			.json({ message: error.message, retryAfterSeconds: error.retryAfter });
	}
}
```

### Replenishing Tokens

If desired, tokens can be replenished using `decrementCount`. This could be useful in a scenario where an expensive operation was cancelled before
consuming resources.

```typescript
// Return tokens for cancelled/failed operations
throttler.decrementCount("user:12345", 1);

// Return tokens for a weighted operation
throttler.decrementCount("api:upload", 5);
```

## Best Practices

### Configuration Guidelines

1. **Local vs Distributed Capacity**: Set local capacity to what _one_ instance of the service can handle, and distributed to what a full suite of instances can handle.
2. **Sync Interval**: Balance between accuracy and storage load (5-30 seconds typical)
3. **Cache Size**: Size cache to handle expected concurrent users with some overhead within single-instance memory constraints. Each tracked ID per API consumes ~500 bytes.
4. **Cache Age**: Should be longer than sync interval to avoid losing tracking data

### Operational Considerations

1. **Monitor Cache Evictions**: Enable enhanced telemetry in production to detect undersized caches
2. **Storage Performance**: Ensure shared storage can handle sync frequency across all instances
3. **Gradual Rollout**: Test with conservative limits before applying production rates
4. **Alerting**: Monitor for storage failures that could disable distributed coordination

### Migration from Legacy Throttling

```typescript
// Legacy throttler usage
const legacyThrottler = new Throttler(storageManager /* ... */);

// Direct replacement with distributed throttling
const newThrottler = new DistributedTokenBucketThrottler(storageManager, logger, {
	// Configure to match or improve upon legacy behavior
	localTokenBucket: {
		/* ... */
	},
	distributedTokenBucket: {
		/* ... */
	},
});

// Same API - no code changes needed!
newThrottler.incrementCount(id, weight);
```

## Monitoring and Debugging

Enable enhanced telemetry for production monitoring:

```typescript
const config = {
	// ... other config
	enableEnhancedTelemetry: true,
};
```

This provides detailed logging for:

-   Cache evictions and memory pressure
-   Distributed sync operations and failures
-   Token bucket state changes
-   Throttling decisions and retry times

## Related Classes

-   **`TokenBucket`**: Core token bucket implementation for local rate limiting
-   **`DistributedTokenBucket`**: Distributed-aware token bucket with periodic syncing
-   **`RedisThrottleAndUsageStorageManager`**: Redis-based storage backend for distributed state
-   **Legacy classes**: `Throttler` and `ThrottlerHelper` for backward compatibility
