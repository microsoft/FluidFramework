/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IStorageNameRetriever, IRevokedTokenChecker } from "@fluidframework/server-services-core";
import { IRedisClientConnectionManager } from "./redisClientConnectionManager";

export interface IHistorianResourcesCustomizations {
	storageNameRetriever?: IStorageNameRetriever;
	revokedTokenChecker?: IRevokedTokenChecker;
	redisClientConnectionManager?: IRedisClientConnectionManager;
	redisClientConnectionManagerForThrottling?: IRedisClientConnectionManager;
}
