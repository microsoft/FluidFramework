import type { ICreateBlobResponse } from "@fluidframework/protocol-definitions";
import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import { assert, isObject } from "@fluidframework/core-utils/internal";
import type { IDetachedBlobStorage } from "./loader.js";

const MemoryDetachedBlobStorageIdentifier = Symbol();

interface MemoryDetachedBlobStorage extends IDetachedBlobStorage {
	[MemoryDetachedBlobStorageIdentifier]: typeof MemoryDetachedBlobStorageIdentifier;
	initialize(attachmentBlobs: string[]): void;
	serialize(): string | undefined;
}

function isMemoryDetachedBlobStorage(
	detachedStorage: IDetachedBlobStorage,
): detachedStorage is MemoryDetachedBlobStorage {
	return (
		isObject(detachedStorage) &&
		MemoryDetachedBlobStorageIdentifier in detachedStorage &&
		detachedStorage[MemoryDetachedBlobStorageIdentifier] === MemoryDetachedBlobStorageIdentifier
	);
}

export function serializeMemoryDetachedBlobStorage(
	detachedStorage: IDetachedBlobStorage,
): string | undefined {
	if (detachedStorage.size > 0 && isMemoryDetachedBlobStorage(detachedStorage)) {
		return detachedStorage.serialize();
	}
}

export function tryInitializeMemoryDetachedBlobStorage(
	detachedStorage: IDetachedBlobStorage,
	attachmentBlobs: string,
) {
	if (!isMemoryDetachedBlobStorage(detachedStorage)) {
		throw new Error("Blob storage not memory blob storage and cannot be initialize.");
	}

	assert(detachedStorage.size === 0, "Blob storage already initialized");
	const maybeAttachmentBlobs = JSON.parse(attachmentBlobs);
	assert(Array.isArray(maybeAttachmentBlobs), "Invalid attachmentBlobs");

	detachedStorage.initialize(maybeAttachmentBlobs);
}

export function createMemoryDetachedBlobStorage(): IDetachedBlobStorage {
	const blobs: ArrayBufferLike[] = [];
	const storage: MemoryDetachedBlobStorage = {
		[MemoryDetachedBlobStorageIdentifier]: MemoryDetachedBlobStorageIdentifier,
		createBlob: async (file: ArrayBufferLike): Promise<ICreateBlobResponse> => ({
			id: `${blobs.push(file) - 1}`,
		}),
		readBlob: async (id: string): Promise<ArrayBufferLike> => blobs[Number(id)],
		get size() {
			return blobs.length;
		},
		getBlobIds: (): string[] => blobs.map((_, i) => `${i}`),
		dispose: () => blobs.splice(0),
		serialize: () => JSON.stringify(blobs.map((b) => bufferToString(b, "utf-8"))),
		initialize: (attachmentBlobs: string[]) => {
			blobs.push(...attachmentBlobs.map((maybeBlob) => stringToBuffer(maybeBlob, "utf-8")));
		},
	};
	return storage;
}
