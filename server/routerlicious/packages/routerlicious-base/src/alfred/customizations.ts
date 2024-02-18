/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IClusterDrainingChecker,
	IDocumentRepository,
	IStorageNameAllocator,
	ITokenRevocationManager,
	IRevokedTokenChecker,
	IWebSocketTracker,
	IServiceMessageResourceManager,
} from "@fluidframework/server-services-core";
import { IRedisClientConnectionManager } from "@fluidframework/server-services-shared";
import { IDocumentDeleteService } from "./services";

/**
 * @internal
 */
export interface IAlfredResourcesCustomizations {
	documentRepository?: IDocumentRepository;
	storageNameAllocator?: IStorageNameAllocator;
	documentDeleteService?: IDocumentDeleteService;
	tokenRevocationManager?: ITokenRevocationManager;
	revokedTokenChecker?: IRevokedTokenChecker;
	webSocketTracker?: IWebSocketTracker;
	serviceMessageResourceManager?: IServiceMessageResourceManager;
	clusterDrainingChecker?: IClusterDrainingChecker;
	redisClientConnectionManager?: IRedisClientConnectionManager;
	redisClientConnectionManagerForJwtCache?: IRedisClientConnectionManager;
	redisClientConnectionManagerForThrottling?: IRedisClientConnectionManager;
	redisClientConnectionManagerForLogging?: IRedisClientConnectionManager;
	redisClientConnectionManagerForSub?: IRedisClientConnectionManager;
	redisClientConnectionManagerForPub?: IRedisClientConnectionManager;
}
