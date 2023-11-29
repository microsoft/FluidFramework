/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IDocumentRepository,
	IStorageNameAllocator,
	ITokenRevocationManager,
	IRevokedTokenChecker,
	IWebSocketTracker,
	IServiceMessageResourceManager,
} from "@fluidframework/server-services-core";

export interface INexusResourcesCustomizations {
	documentRepository?: IDocumentRepository;
	storageNameAllocator?: IStorageNameAllocator;
	tokenRevocationManager?: ITokenRevocationManager;
	revokedTokenChecker?: IRevokedTokenChecker;
	webSocketTracker?: IWebSocketTracker;
	serviceMessageResourceManager?: IServiceMessageResourceManager;
}
