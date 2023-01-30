/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IDocumentStorageService,
	IDocumentStorageServicePolicies,
} from "@fluidframework/driver-definitions";
import { DocumentStorageServiceProxy } from "./documentStorageServiceProxy";

/**
 * IDocumentStorageService adapter with pre-cached blobs.
 */
export class BlobCacheStorageService extends DocumentStorageServiceProxy {
	constructor(
		internalStorageService: IDocumentStorageService,
		private readonly blobs: Map<string, ArrayBufferLike>,
	) {
		super(internalStorageService);
	}

	public get policies(): IDocumentStorageServicePolicies | undefined {
		return this.internalStorageService.policies;
	}

	public async readBlob(id: string): Promise<ArrayBufferLike> {
		const blob = this.blobs.get(id);
		if (blob !== undefined) {
			return blob;
		}

		return this.internalStorageService.readBlob(id);
	}
}
