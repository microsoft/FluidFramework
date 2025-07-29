/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IStorageNameRetriever,
	IRevokedTokenChecker,
	IReadinessCheck,
} from "@fluidframework/server-services-core";
import type { IRedisClientConnectionManager } from "@fluidframework/server-services-utils";
import type { ISimplifiedCustomDataRetriever } from "./services";

export interface IHistorianResourcesCustomizations {
	storageNameRetriever?: IStorageNameRetriever;
	revokedTokenChecker?: IRevokedTokenChecker;
	redisClientConnectionManager?: IRedisClientConnectionManager;
	redisClientConnectionManagerForThrottling?: IRedisClientConnectionManager;
	redisClientConnectionManagerForInvalidTokenCache?: IRedisClientConnectionManager;
	readinessCheck?: IReadinessCheck;
	simplifiedCustomDataRetriever?: ISimplifiedCustomDataRetriever;
}
