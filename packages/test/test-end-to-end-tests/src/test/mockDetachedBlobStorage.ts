/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IDetachedBlobStorage } from "@fluidframework/container-loader";
import { ICreateBlobResponse } from "@fluidframework/protocol-definitions";
import { ITestObjectProvider } from "@fluidframework/test-utils";

export class MockDetachedBlobStorage implements IDetachedBlobStorage {
	public readonly blobs = new Map<string, ArrayBufferLike>();

	public get size() {
		return this.blobs.size;
	}

	public getBlobIds(): string[] {
		return Array.from(this.blobs.keys());
	}

	public async createBlob(content: ArrayBufferLike): Promise<ICreateBlobResponse> {
		const id = this.size.toString();
		this.blobs.set(id, content);
		return { id };
	}

	public async readBlob(blobId: string): Promise<ArrayBufferLike> {
		const blob = this.blobs.get(blobId);
		assert(blob);
		return blob;
	}
}

// TODO: #7684
export const getUrlFromItemId = (itemId: string, provider: ITestObjectProvider): string => {
	assert(provider.driver.type === "odsp");
	assert(itemId);
	const url = (provider.driver as any).getUrlFromItemId(itemId);
	assert(url && typeof url === "string");
	return url;
};
