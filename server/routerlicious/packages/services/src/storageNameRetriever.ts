/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IStorageNameRetriever } from "@fluidframework/server-services-core";

/**
 * Manager to fetch deltas from Alfred using the internal URL.
 */
export class StorageNameRetriever implements IStorageNameRetriever {
	public constructor() {}

	public async get(tenantId: string, documentId: string): Promise<string> {
		return undefined;
	}
}
