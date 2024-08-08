/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import { assert, isObject } from "@fluidframework/core-utils/internal";
import type { ICreateBlobResponse } from "@fluidframework/driver-definitions/internal";

// eslint-disable-next-line import/no-deprecated
import type { IDetachedBlobStorage } from "./loader.js";

const MemoryDetachedBlobStorageIdentifier = Symbol();

// eslint-disable-next-line import/no-deprecated
interface MemoryDetachedBlobStorage extends IDetachedBlobStorage {
	[MemoryDetachedBlobStorageIdentifier]: typeof MemoryDetachedBlobStorageIdentifier;
	initialize(attachmentBlobs: string[]): void;
	serialize(): string | undefined;
}

function isMemoryDetachedBlobStorage(
	// eslint-disable-next-line import/no-deprecated
	detachedStorage: IDetachedBlobStorage | undefined,
): detachedStorage is MemoryDetachedBlobStorage {
	return (
		isObject(detachedStorage) &&
		MemoryDetachedBlobStorageIdentifier in detachedStorage &&
		detachedStorage[MemoryDetachedBlobStorageIdentifier] ===
			MemoryDetachedBlobStorageIdentifier
	);
}

export function serializeMemoryDetachedBlobStorage(
	// eslint-disable-next-line import/no-deprecated
	detachedStorage: IDetachedBlobStorage | undefined,
): string | undefined {
	if (
		detachedStorage !== undefined &&
		detachedStorage.size > 0 &&
		isMemoryDetachedBlobStorage(detachedStorage)
	) {
		return detachedStorage.serialize();
	}
}

export function tryInitializeMemoryDetachedBlobStorage(
	// eslint-disable-next-line import/no-deprecated
	detachedStorage: IDetachedBlobStorage | undefined,
	attachmentBlobs: string,
): void {
	if (!isMemoryDetachedBlobStorage(detachedStorage)) {
		throw new Error(
			"DetachedBlobStorage was not provided to the loader during serialize so cannot be provided during rehydrate.",
		);
	}

	assert(detachedStorage.size === 0, 0x99e /* Blob storage already initialized */);
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const maybeAttachmentBlobs = JSON.parse(attachmentBlobs);
	assert(Array.isArray(maybeAttachmentBlobs), 0x99f /* Invalid attachmentBlobs */);

	// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
	detachedStorage.initialize(maybeAttachmentBlobs);
}

// eslint-disable-next-line import/no-deprecated
export function createMemoryDetachedBlobStorage(): IDetachedBlobStorage {
	const blobs: ArrayBufferLike[] = [];
	const storage: MemoryDetachedBlobStorage = {
		[MemoryDetachedBlobStorageIdentifier]: MemoryDetachedBlobStorageIdentifier,
		createBlob: async (file: ArrayBufferLike): Promise<ICreateBlobResponse> => ({
			id: `${blobs.push(file) - 1}`,
		}),
		readBlob: async (id: string): Promise<ArrayBufferLike> =>
			blobs[Number(id)] ?? Promise.reject(new Error(`Blob not found: ${id}`)),
		get size() {
			return blobs.length;
		},
		getBlobIds: (): string[] => blobs.map((_, i) => `${i}`),
		dispose: () => blobs.splice(0),
		serialize: () => JSON.stringify(blobs.map((b) => bufferToString(b, "utf8"))),
		initialize: (attachmentBlobs: string[]) =>
			blobs.push(...attachmentBlobs.map((maybeBlob) => stringToBuffer(maybeBlob, "utf8"))),
	};
	return storage;
}
