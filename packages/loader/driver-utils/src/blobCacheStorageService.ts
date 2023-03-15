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
 *
 * @deprecated 2.0.0-internal.3.2.0 Not recommended for general purpose use.
 */
export class BlobCacheStorageService extends DocumentStorageServiceProxy {
	/**
	 * @deprecated 2.0.0-internal.3.2.0 Not recommended for general purpose use.
	 */
	constructor(
		internalStorageService: IDocumentStorageService,
		private readonly blobs: Map<string, ArrayBufferLike>,
	) {
		super(internalStorageService);
	}

	/**
	 * @deprecated 2.0.0-internal.3.2.0 Not recommended for general purpose use.
	 */
	public get policies(): IDocumentStorageServicePolicies | undefined {
		return this.internalStorageService.policies;
	}

	/**
	 * @deprecated 2.0.0-internal.3.2.0 Not recommended for general purpose use.
	 */
	public async readBlob(id: string): Promise<ArrayBufferLike> {
		const blob = this.blobs.get(id);
		if (blob !== undefined) {
			return blob;
		}

		return this.internalStorageService.readBlob(id);
	}
}
