/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRuntimeStorageService } from "@fluidframework/runtime-definitions/internal";

/**
 * IRuntimeStorageService proxy which intercepts requests if they can be satisfied by the blobs received in the
 * attach message. We use this to avoid an unnecessary request to the storage service.
 */
export class StorageServiceWithAttachBlobs implements IRuntimeStorageService {
	constructor(
		private readonly internalStorageService: IRuntimeStorageService,
		private readonly attachBlobs: Map<string, ArrayBufferLike>,
	) {}

	public async readBlob(id: string): Promise<ArrayBufferLike> {
		const blob = this.attachBlobs.get(id);
		if (blob !== undefined) {
			return blob;
		}

		// Note that it is intentional not to cache the result of this readBlob - we'll trust the real
		// IRuntimeStorageService to cache appropriately, no need to double-cache.
		return this.internalStorageService.readBlob(id);
	}
}
