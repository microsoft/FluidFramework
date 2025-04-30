/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils/internal";
import type {
	ICreateBlobResponse,
	IDocumentStorageService,
} from "@fluidframework/driver-definitions/internal";

/**
 * An interface used to manage blobs in memory for detached containers.
 *
 * @remarks
 * On attach of the container the blobs are read, and uploaded to the server.
 * The interface also supports serialization and initialization which is
 * used when serializing and rehydrating a detached container with blobs.
 */
export interface MemoryDetachedBlobStorage
	extends Pick<IDocumentStorageService, "createBlob" | "readBlob"> {
	size: number;
	/**
	 * Return an array of all blob IDs present in storage
	 */
	getBlobIds(): string[];

	/**
	 * After the container is attached, the detached blob storage is no longer needed and will be disposed.
	 */
	dispose?(): void;
	initialize(attachmentBlobs: string[]): void;
	serialize(): string | undefined;
}

export function tryInitializeMemoryDetachedBlobStorage(
	detachedStorage: MemoryDetachedBlobStorage,
	attachmentBlobs: string,
): void {
	assert(detachedStorage.size === 0, 0x99e /* Blob storage already initialized */);
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const maybeAttachmentBlobs = JSON.parse(attachmentBlobs);
	assert(Array.isArray(maybeAttachmentBlobs), 0x99f /* Invalid attachmentBlobs */);

	// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
	detachedStorage.initialize(maybeAttachmentBlobs);
}

/**
 * Creates a new instance of `MemoryDetachedBlobStorage`.
 * The returned storage allows for creating, reading, and managing blobs in memory.
 * It also provides methods for serialization and initialization with attachment blobs.
 * @returns A new `MemoryDetachedBlobStorage` instance.
 */
// eslint-disable-next-line import/no-deprecated
export function createMemoryDetachedBlobStorage(): MemoryDetachedBlobStorage {
	const blobs: ArrayBufferLike[] = [];
	const storage: MemoryDetachedBlobStorage = {
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
