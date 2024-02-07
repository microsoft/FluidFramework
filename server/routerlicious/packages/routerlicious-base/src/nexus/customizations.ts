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
}
