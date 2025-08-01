/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { HybridThrottler, type ILocalThrottleConfig } from "./hybridThrottler";
export {
	BaseTokenBucket,
	type ITokenBucketConfig,
	type ITokenBucketState,
	type ITokenBucketResult,
} from "./baseTokenBucket";
export { LocalTokenBucketHelper, type ILocalTokenBucketConfig } from "./localTokenBucketHelper";
export { TokenBucket, type ITokenBucketOptions } from "./tokenBucket";
export {
	type ITokenBucketStorage,
	type IInMemoryStorageConfig,
	type IRedisStorageConfig,
} from "./tokenBucketStorage";
export { InMemoryTokenBucketStorage } from "./inMemoryTokenBucketStorage";
export { RedisTokenBucketStorage } from "./redisTokenBucketStorage";
export {
	createFromGlobalLimits,
	createForLowLatency,
	createForHighThroughput,
	validateLocalThrottleConfig,
	CommonLocalThrottleConfigs,
} from "./localThrottleConfigBuilder";
