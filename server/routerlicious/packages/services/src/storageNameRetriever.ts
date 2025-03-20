/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IStorageNameRetriever } from "@fluidframework/server-services-core";

/**
 * Retriever to fetch storage name used for document.
 * @internal
 */
export class StorageNameRetriever implements IStorageNameRetriever {
	public constructor() {}

	public async get(tenantId: string, documentId: string): Promise<string> {
		return "Unknown";
	}
}
