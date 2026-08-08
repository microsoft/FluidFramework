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
	initialize(attachmentBlobs: string[], encoding: "utf8" | "base64"): void;
	serialize(): string | undefined;
}

interface SerializedMemoryDetachedBlobStorage {
	version: 1;
	blobs: string[];
}

export function tryInitializeMemoryDetachedBlobStorage(
	detachedStorage: MemoryDetachedBlobStorage,
	attachmentBlobs: string,
): void {
	assert(detachedStorage.size === 0, 0x99e /* Blob storage already initialized */);
	const maybeAttachmentBlobs: unknown = JSON.parse(attachmentBlobs);
	if (Array.isArray(maybeAttachmentBlobs)) {
		// Legacy detached state encoded blob strings as UTF-8.
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		detachedStorage.initialize(maybeAttachmentBlobs, "utf8");
		return;
	}
	assert(
		typeof maybeAttachmentBlobs === "object" &&
			maybeAttachmentBlobs !== null &&
			"version" in maybeAttachmentBlobs &&
			maybeAttachmentBlobs.version === 1 &&
			"blobs" in maybeAttachmentBlobs &&
			Array.isArray(maybeAttachmentBlobs.blobs),
		"Invalid attachmentBlobs",
	);
	const serializedStorage = maybeAttachmentBlobs as SerializedMemoryDetachedBlobStorage;
	detachedStorage.initialize(serializedStorage.blobs, "base64");
}

/**
 * Creates a new instance of `MemoryDetachedBlobStorage`.
 * The returned storage allows for creating, reading, and managing blobs in memory.
 * It also provides methods for serialization and initialization with attachment blobs.
 * @returns A new `MemoryDetachedBlobStorage` instance.
 */
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
		serialize: () =>
			blobs.length > 0
				? JSON.stringify({
						version: 1,
						blobs: blobs.map((b) => bufferToString(b, "base64")),
					} satisfies SerializedMemoryDetachedBlobStorage)
				: undefined,
		initialize: (attachmentBlobs: string[], encoding: "utf8" | "base64") =>
			blobs.push(...attachmentBlobs.map((maybeBlob) => stringToBuffer(maybeBlob, encoding))),
	};
	return storage;
}
