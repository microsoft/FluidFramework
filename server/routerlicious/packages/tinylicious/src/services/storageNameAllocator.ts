/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IStorageNameAllocator,
	ITenantConfigManager,
} from "@fluidframework/server-services-core";

export class StorageNameAllocator implements IStorageNameAllocator {
	public constructor(private readonly tenantConfigManager: ITenantConfigManager) {}
	public async assign(tenantId: string, documentId: string): Promise<string> {
		return this.tenantConfigManager.getTenantStorageName(tenantId);
	}
}
