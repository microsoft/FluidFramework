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
	initialize(attachmentBlobs: readonly ArrayBufferLike[]): void;
	serialize(): string | undefined;
}

const serializedMemoryDetachedBlobStorageVersion = 1;

interface SerializedMemoryDetachedBlobStorage {
	readonly version: typeof serializedMemoryDetachedBlobStorageVersion;
	readonly blobs: readonly string[];
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isSerializedMemoryDetachedBlobStorage(
	value: unknown,
): value is SerializedMemoryDetachedBlobStorage {
	return (
		typeof value === "object" &&
		value !== null &&
		"version" in value &&
		value.version === serializedMemoryDetachedBlobStorageVersion &&
		"blobs" in value &&
		isStringArray(value.blobs)
	);
}

export function tryInitializeMemoryDetachedBlobStorage(
	detachedStorage: MemoryDetachedBlobStorage,
	attachmentBlobs: string,
): void {
	assert(detachedStorage.size === 0, 0x99e /* Blob storage already initialized */);
	const maybeAttachmentBlobs: unknown = JSON.parse(attachmentBlobs);

	// Legacy snapshots stored blob contents as UTF-8 strings.
	if (isStringArray(maybeAttachmentBlobs)) {
		detachedStorage.initialize(
			maybeAttachmentBlobs.map((maybeBlob) => stringToBuffer(maybeBlob, "utf8")),
		);
		return;
	}

	assert(
		isSerializedMemoryDetachedBlobStorage(maybeAttachmentBlobs),
		"Invalid attachmentBlobs",
	);
	detachedStorage.initialize(
		maybeAttachmentBlobs.blobs.map((maybeBlob) => stringToBuffer(maybeBlob, "base64")),
	);
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
		serialize: () => {
			if (blobs.length === 0) {
				return undefined;
			}
			const serializedStorage: SerializedMemoryDetachedBlobStorage = {
				version: serializedMemoryDetachedBlobStorageVersion,
				blobs: blobs.map((blob) => bufferToString(blob, "base64")),
			};
			return JSON.stringify(serializedStorage);
		},
		initialize: (attachmentBlobs: readonly ArrayBufferLike[]) =>
			blobs.push(...attachmentBlobs),
	};
	return storage;
}
