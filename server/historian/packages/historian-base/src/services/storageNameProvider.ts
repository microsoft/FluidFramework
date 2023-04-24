/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IStorageNameProvider } from "./definitions";

/**
 * Manager to fetch deltas from Alfred using the internal URL.
 */
export class StorageNameProvider implements IStorageNameProvider {
	public constructor() {}

	public async assignStorageName(tenantId: string, documentId: string): Promise<string> {
		return undefined;
	}

	public async retrieveStorageName(tenantId: string, documentId: string): Promise<string> {
		return undefined;
	}
}
