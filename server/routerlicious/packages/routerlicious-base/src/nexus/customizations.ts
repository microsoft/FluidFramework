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
	IReadinessCheck,
} from "@fluidframework/server-services-core";
import type { SocketIoAdapterCreator } from "@fluidframework/server-services-shared";
import { IRedisClientConnectionManager } from "@fluidframework/server-services-utils";

/**
 * @internal
 */
export interface INexusResourcesCustomizations {
	documentRepository?: IDocumentRepository;
	storageNameAllocator?: IStorageNameAllocator;
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
	customCreateSocketIoAdapter?: SocketIoAdapterCreator;
	readinessCheck?: IReadinessCheck;
}
