# Legacy Token Bucket Throttling

This module provides a throttling system based on the token bucket algorithm with lenient
operation handling. It prioritizes low latency over strict throttling accuracy, making it suitable
for high-performance scenarios where occasional over-limit operations are acceptable.

## Overview

The legacy throttling system consists of two main components:

-   **`ThrottlerHelper`**: Implements the core token bucket algorithm with distributed storage backing
-   **`Throttler`**: Provides a lenient wrapper with local caching to minimize latency impact

This system uses a single-layer approach where all rate limiting is coordinated through shared
storage, with local caching to reduce storage load and improve response times. A running count
is tracked between distributed storage syncs when the actual calculation is computed.

> **Warning:** A major drawback of this design is that throttling state can only be updated
> once per throttle (storage access) interval. Increased accuracy means increased storage load,
> and decreased storage load means decreased accuracy.

## Architecture

```text
┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐
│    Instance A     │    │    Instance B     │    │    Instance C     │
│                   │    │                   │    │                   │
│ ┌───────────────┐ │    │ ┌───────────────┐ │    │ ┌───────────────┐ │
│ │   Throttler   │ │    │ │   Throttler   │ │    │ │   Throttler   │ │
│ │  (LRU Cache)  │ │    │ │  (LRU Cache)  │ │    │ │  (LRU Cache)  │ │
│ └───────────────┘ │    │ └───────────────┘ │    │ └───────────────┘ │
│         │         │    │         │         │    │         │         │
│ ┌───────────────┐ │    │ ┌───────────────┐ │    │ ┌───────────────┐ │
│ │ ThrottlerHlpr │ │    │ │ ThrottlerHlpr │ │    │ │ ThrottlerHlpr │ │
│ │ (Token Bucket)│ │    │ │ (Token Bucket)│ │    │ │ (Token Bucket)│ │
│ └───────────────┘ │    │ └───────────────┘ │    │ └───────────────┘ │
└─────────┬─────────┘    └─────────┬─────────┘    └─────────┬─────────┘
          │                        │                        │
          └────────────────────────┼────────────────────────┘
                                   │
                      ┌─────────────────────┐
                      │   Shared Storage    │
                      │  (Redis/MongoDB)    │
                      └─────────────────────┘
```

## Key Features

### Benefits

1. **Low Latency Operation**: Aggressive local caching minimizes storage round-trips during normal operation
2. **Lenient Throttling**: Allows operations to proceed when throttle status is unknown or being updated
3. **Storage Efficiency**: Batch updates reduce storage operations through configurable intervals
4. **Configurable Caching**: Tunable cache sizes and expiration for memory vs accuracy trade-offs

### Limitations

1. **Eventually Consistent**: Cache delays mean throttling decisions may be based on stale data
2. **Lenient Enforcement**: Prioritizes availability over strict rate limiting accuracy
3. **Storage Dependency**: Requires shared storage for coordination, with no local fallback
4. **Memory Usage**: LRU caches consume memory proportional to active operation IDs
5. **Configuration Complexity**: Multiple timing parameters require careful tuning for optimal behavior

## Configuration

The legacy throttling system requires configuration of both the helper and wrapper components:

### ThrottlerHelper Configuration

```typescript
const throttlerHelper = new ThrottlerHelper(
	throttleAndUsageStorageManager, // IThrottleAndUsageStorageManager instance
	rateInOperationsPerMs, // Token replenishment rate (default: 1000000)
	operationBurstLimit, // Maximum tokens in bucket (default: 1000000)
	minCooldownIntervalInMs, // Minimum time between replenishments (default: 1000000)
);
```

### Throttler Configuration

```typescript
const throttler = new Throttler(
	throttlerHelper, // IThrottlerHelper instance
	minThrottleIntervalInMs, // How often to check throttle status (default: 1000000)
	logger, // Optional ILogger for telemetry
	maxCacheSize, // LRU cache size limit (default: 1000)
	maxCacheAge, // Cache entry expiration in ms (default: 60000)
	enableEnhancedTelemetry, // Enable detailed logging (default: false)
);
```

## Usage Examples

### Basic Setup

```typescript
import {
	Throttler,
	ThrottlerHelper,
	RedisThrottleAndUsageStorageManager,
} from "@fluidframework/server-services";

const storageManager = new RedisThrottleAndUsageStorageManager(
	redisClientConnectionManager,
	parameters,
);

const throttlerHelper = new ThrottlerHelper(
	storageManager,
	0.1, // 100 operations per second (0.1 per ms)
	100, // Allow 100 operation burst
	1000, // Replenish tokens every second
);

const throttler = new Throttler(
	throttlerHelper,
	5000, // Check throttle status every 5 seconds
	logger,
	1000, // Track up to 1000 operation IDs
	60000, // Cache entries expire after 1 minute
	false, // Disable enhanced telemetry for production
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

### Releasing Tokens

```typescript
// Return tokens for cancelled/failed operations
throttler.decrementCount("user:12345", 1);

// Return tokens for a weighted operation
throttler.decrementCount("api:upload", 5);
```

## Configuration Guidelines

### Performance Tuning

1. **Rate Configuration**: Set `rateInOperationsPerMs` to your target sustained throughput
2. **Burst Limits**: Configure `operationBurstLimit` to handle traffic spikes without throttling
3. **Cooldown Intervals**: Balance `minCooldownIntervalInMs` between responsiveness and storage load
4. **Check Intervals**: Set `minThrottleIntervalInMs` based on acceptable throttling delay

### Memory Management

1. **Cache Sizing**: Size `maxCacheSize` to handle concurrent users within memory constraints
2. **Cache Expiration**: Set `maxCacheAge` longer than check intervals to avoid data loss
3. **Enhanced Telemetry**: Enable only during debugging to monitor cache behavior

### Example Configurations

#### High-Throughput API (Lenient)

```typescript
const throttlerHelper = new ThrottlerHelper(
	storageManager,
	1, // 1000 ops/second sustained
	5000, // 5000 operation burst
	1000, // 1 second cooldown
);

const throttler = new Throttler(
	throttlerHelper,
	10000, // Check every 10 seconds (very lenient)
	logger,
	10000, // Large cache for many users
	30000, // 30 second cache expiration
);
```

#### WebSocket Connections (Responsive)

```typescript
const throttlerHelper = new ThrottlerHelper(
	storageManager,
	0.01, // 10 connections/second sustained
	50, // 50 connection burst
	5000, // 5 second cooldown
);

const throttler = new Throttler(
	throttlerHelper,
	1000, // Check every second (responsive)
	logger,
	1000, // Moderate cache size
	60000, // 1 minute cache expiration
);
```

## Operational Considerations

### Monitoring

Enable enhanced telemetry in development to understand cache behavior:

```typescript
const throttler = new Throttler(
	throttlerHelper,
	minThrottleIntervalInMs,
	logger,
	maxCacheSize,
	maxCacheAge,
	true, // Enable enhanced telemetry
);
```

This provides logging for cache evictions due to size limits and/or age.

### Storage Requirements

> **Recommendation**: Redis

-   **Consistency**: Requires shared storage accessible by all service instances
-   **Performance**: Storage latency directly impacts throttling accuracy
-   **Reliability**: Storage failures disable distributed coordination

### Migration Considerations

Legacy throttling has significant drawbacks, and it is slated for eventual replacement by a combination
local+distributed throttling system:

```typescript
// Legacy approach (single-layer distributed)
const legacyThrottler: IThrottler = new Throttler(throttlerHelper /* ... */);

// Migration target (dual-layer local+distributed)
const modernThrottler: IThrottler = new DistributedTokenBucketThrottler(/* ... */);

// Same API for seamless migration
legacyThrottler.incrementCount(id, weight);
modernThrottler.incrementCount(id, weight);
```

## Best Practices

1. **Cache Configuration**: Ensure cache expiration is longer than check intervals
2. **Error Handling**: Monitor storage errors that could disable throttling
3. **Gradual Deployment**: Test with conservative limits before production rates
4. **Storage Monitoring**: Ensure shared storage can handle update frequency

## Related Classes

-   **`TestThrottlerHelper`**: Simple in-memory implementation for testing
-   **`RedisThrottleAndUsageStorageManager`**: Redis-based storage backend
-   **`DistributedTokenBucketThrottler`**: Modern replacement with dual-layer architecture
-   **Core interfaces**: `IThrottler`, `IThrottlerHelper`, `IThrottlerResponse`, `IThrottlingMetrics`
