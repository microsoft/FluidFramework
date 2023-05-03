/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentRepository, IStorageNameAllocator } from "@fluidframework/server-services-core";

export interface IAlfredResourcesCustomizations {
	documentRepository?: IDocumentRepository;
	storageNameAllocator?: IStorageNameAllocator;
}
