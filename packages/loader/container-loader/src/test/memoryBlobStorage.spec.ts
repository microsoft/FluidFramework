/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { stringToBuffer } from "@fluid-internal/client-utils";

import type { IDetachedBlobStorage } from "../loader.js";
import {
	createMemoryDetachedBlobStorage,
	serializeMemoryDetachedBlobStorage,
	tryInitializeMemoryDetachedBlobStorage,
} from "../memoryBlobStorage.js";

describe("MemoryBlobStorage", () => {
	it("Can create and read blobs", async () => {
		const blobContent = stringToBuffer("test content", "utf-8"); // Add the encoding argument

		const storage = createMemoryDetachedBlobStorage();
		const blobResponse = await storage.createBlob(blobContent);

		const readContent = await storage.readBlob(blobResponse.id);
		assert.deepStrictEqual(
			readContent,
			blobContent,
			"Read content does not match written content",
		);
	});

	it("Throws error when reading non-existent blob", async () => {
		const storage = createMemoryDetachedBlobStorage();

		await assert.rejects(async () => {
			await storage.readBlob("non-existent-id");
		}, "Expected an error when reading non-existent blob");
	});

	it("Can handle multiple blobs", async () => {
		const blobContent1 = stringToBuffer("test content 1", "utf-8");
		const blobContent2 = stringToBuffer("test content 2", "utf-8");

		const storage = createMemoryDetachedBlobStorage();
		const blobResponse1 = await storage.createBlob(blobContent1);
		const blobResponse2 = await storage.createBlob(blobContent2);

		const readContent1 = await storage.readBlob(blobResponse1.id);
		const readContent2 = await storage.readBlob(blobResponse2.id);

		assert.deepStrictEqual(
			readContent1,
			blobContent1,
			"Read content does not match written content for blob 1",
		);

		assert.deepStrictEqual(
			readContent2,
			blobContent2,
			"Read content does not match written content for blob 2",
		);
	});

	it("Can serialize and initialize blob storage", async () => {
		const blobContent = stringToBuffer("test content", "utf-8");

		// Create and populate blob storage
		const storage = createMemoryDetachedBlobStorage();
		const blobResponse = await storage.createBlob(blobContent);

		// Serialize the storage
		const serializedStorage = serializeMemoryDetachedBlobStorage(storage);
		assert(serializedStorage !== undefined, "Serialized storage is undefined");

		const newStorage = createMemoryDetachedBlobStorage();
		// Initialize a new storage from the serialized one
		tryInitializeMemoryDetachedBlobStorage(newStorage, serializedStorage);

		// Check that the new storage has the same blobs
		const readContent = await newStorage.readBlob(blobResponse.id);
		assert.deepStrictEqual(
			readContent,
			blobContent,
			"Read content does not match written content",
		);
	});

	it("Throws error when initializing from invalid serialized storage", async () => {
		const newStorage = createMemoryDetachedBlobStorage();
		const invalidSerializedStorage = "invalid serialized storage";

		assert.throws(() => {
			tryInitializeMemoryDetachedBlobStorage(newStorage, invalidSerializedStorage);
		}, "Expected an error when initializing from invalid serialized storage");
	});

	it("Throws error when tryInitializeMemoryDetachedBlobStorage is called on storage with existing blobs", async () => {
		const blobContent = stringToBuffer("test content", "utf-8");

		// Create and populate blob storage
		const storage = createMemoryDetachedBlobStorage();
		await storage.createBlob(blobContent);

		// Serialize the storage
		const serializedStorage = serializeMemoryDetachedBlobStorage(storage);

		assert(serializedStorage !== undefined, "Serialized storage is undefined");

		const newStorage = createMemoryDetachedBlobStorage();
		// Add another blob to the storage
		await newStorage.createBlob(stringToBuffer("another test content", "utf-8"));
		assert.throws(() => {
			tryInitializeMemoryDetachedBlobStorage(newStorage, serializedStorage);
		}, "Expected an error when initializing storage that already has blobs");
	});

	it("Throws error when tryInitializeMemoryDetachedBlobStorage is called on non-MemoryBlobStorage", () => {
		const notMemoryBlobStorage: IDetachedBlobStorage = {
			size: 0,
			createBlob: async () => {
				throw new Error("createBlob not implemented");
			},
			readBlob: async () => {
				throw new Error("readBlob not implemented");
			},
			getBlobIds: () => {
				throw new Error("getBlobIds not implemented");
			},
			dispose: () => {
				throw new Error("dispose not implemented");
			},
		};

		assert.throws(() => {
			tryInitializeMemoryDetachedBlobStorage(notMemoryBlobStorage, "");
		}, "Expected an error when initializing non-MemoryBlobStorage");
	});

	it("Returns undefined when serializing empty storage", () => {
		const storage = createMemoryDetachedBlobStorage();
		const serializedStorage = serializeMemoryDetachedBlobStorage(storage);
		assert.strictEqual(
			serializedStorage,
			undefined,
			"Expected undefined when serializing empty storage",
		);
	});
});
