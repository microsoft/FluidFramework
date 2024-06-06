/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ITestDriver } from "@fluid-internal/test-driver-definitions";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { IDetachedBlobStorage } from "@fluidframework/container-loader/internal";
import { ICreateBlobResponse } from "@fluidframework/driver-definitions/internal";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions/internal";
import { ITestObjectProvider } from "@fluidframework/test-utils/internal";

export class MockDetachedBlobStorage implements IDetachedBlobStorage {
	private readonly blobs = new Map<string, ArrayBufferLike>();

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

	dispose(): void {
		this.blobs.clear();
	}
}

const driversThatSupportBlobs: string[] = ["local", "odsp"];
export function driverSupportsBlobs(driver: ITestDriver): boolean {
	return driversThatSupportBlobs.includes(driver.type);
}

// TODO: #7684
export const getUrlFromDetachedBlobStorage = async (
	container: IContainer,
	provider: ITestObjectProvider,
): Promise<string> => {
	switch (provider.driver.type) {
		case "odsp": {
			const itemId = (container.resolvedUrl as IOdspResolvedUrl).itemId;
			const url = (provider.driver as any).getUrlFromItemId(itemId);
			assert(url && typeof url === "string");
			return url;
		}
		case "local": {
			const url = await container.getAbsoluteUrl("");
			assert(url && typeof url === "string");
			return url;
		}
		default: {
			throw new Error(`Provider type ${provider.driver.type} not supported`);
		}
	}
};
