/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IDocumentStorageService,
	IDocumentStorageServicePolicies,
} from "@fluidframework/driver-definitions/internal";
import { DocumentStorageServiceProxy } from "@fluidframework/driver-utils/internal";

/**
 * IDocumentStorageService proxy which intercepts requests if they can be satisfied by the blobs received in the
 * attach message. We use this to avoid an unnecessary request to the storage service.
 */
export class StorageServiceWithAttachBlobs extends DocumentStorageServiceProxy {
	constructor(
		internalStorageService: IDocumentStorageService,
		private readonly attachBlobs: Map<string, ArrayBufferLike>,
	) {
		super(internalStorageService);
	}

	public get policies(): IDocumentStorageServicePolicies | undefined {
		return this.internalStorageService.policies;
	}

	public async readBlob(id: string): Promise<ArrayBufferLike> {
		const blob = this.attachBlobs.get(id);
		if (blob !== undefined) {
			return blob;
		}

		// Note that it is intentional not to cache the result of this readBlob - we'll trust the real
		// IDocumentStorageService to cache appropriately, no need to double-cache.
		return this.internalStorageService.readBlob(id);
	}
}
