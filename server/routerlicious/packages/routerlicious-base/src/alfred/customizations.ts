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
	IFluidAccessTokenGenerator,
	IReadinessCheck,
} from "@fluidframework/server-services-core";
import { IRedisClientConnectionManager } from "@fluidframework/server-services-utils";
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
	redisClientConnectionManagerForJwtCache?: IRedisClientConnectionManager;
	redisClientConnectionManagerForThrottling?: IRedisClientConnectionManager;
	readinessCheck?: IReadinessCheck;
	fluidAccessTokenGenerator?: IFluidAccessTokenGenerator;
}
