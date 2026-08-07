/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { stringToBuffer } from "@fluid-internal/client-utils";

import {
	createMemoryDetachedBlobStorage,
	tryInitializeMemoryDetachedBlobStorage,
} from "../memoryBlobStorage.js";

describe("MemoryBlobStorage", () => {
	it("Can create and read blobs", async () => {
		const blobContent = stringToBuffer("test content", "utf8"); // Add the encoding argument

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
		const blobContent1 = stringToBuffer("test content 1", "utf8");
		const blobContent2 = stringToBuffer("test content 2", "utf8");

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
		const blobContent = stringToBuffer("test content", "utf8");

		// Create and populate blob storage
		const storage = createMemoryDetachedBlobStorage();
		const blobResponse = await storage.createBlob(blobContent);

		// Serialize the storage
		const serializedStorage = storage.serialize();
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

	it("Serializes binary blobs as versioned base64 and preserves their IDs and order", async () => {
		const blobContents = [
			new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xfe, 0xff]),
			new Uint8Array([]),
			new Uint8Array([0x80, 0x00, 0x7f]),
		];
		const storage = createMemoryDetachedBlobStorage();
		const blobResponses = await Promise.all(
			blobContents.map((blobContent) => storage.createBlob(blobContent.buffer)),
		);

		assert.deepStrictEqual(
			blobResponses.map(({ id }) => id),
			["0", "1", "2"],
		);
		const serializedStorage = storage.serialize();
		assert(serializedStorage !== undefined, "Serialized storage is undefined");
		const parsedSerializedStorage: unknown = JSON.parse(serializedStorage);
		assert.deepStrictEqual(parsedSerializedStorage, {
			version: 1,
			blobs: ["AAECA/7/", "", "gAB/"],
		});

		const newStorage = createMemoryDetachedBlobStorage();
		tryInitializeMemoryDetachedBlobStorage(newStorage, serializedStorage);

		assert.deepStrictEqual(newStorage.getBlobIds(), ["0", "1", "2"]);
		const rehydratedBlobContents = await Promise.all(
			newStorage
				.getBlobIds()
				.map(async (id) => Array.from(new Uint8Array(await newStorage.readBlob(id)))),
		);
		assert.deepStrictEqual(
			rehydratedBlobContents,
			blobContents.map((blobContent) => Array.from(blobContent)),
		);
	});

	it("Can initialize blob storage serialized in the legacy UTF-8 format", async () => {
		const legacyBlobContents = ["legacy content", "legacy\u0000content"];
		const storage = createMemoryDetachedBlobStorage();

		tryInitializeMemoryDetachedBlobStorage(storage, JSON.stringify(legacyBlobContents));

		assert.deepStrictEqual(storage.getBlobIds(), ["0", "1"]);
		const rehydratedBlobContents = await Promise.all(
			storage
				.getBlobIds()
				.map(async (id) => Array.from(new Uint8Array(await storage.readBlob(id)))),
		);
		assert.deepStrictEqual(
			rehydratedBlobContents,
			legacyBlobContents.map((blobContent) =>
				Array.from(new Uint8Array(stringToBuffer(blobContent, "utf8"))),
			),
		);
	});

	it("Throws error when initializing from invalid serialized storage", async () => {
		const newStorage = createMemoryDetachedBlobStorage();
		const invalidSerializedStorage = "invalid serialized storage";

		assert.throws(() => {
			tryInitializeMemoryDetachedBlobStorage(newStorage, invalidSerializedStorage);
		}, "Expected an error when initializing from invalid serialized storage");
	});

	it("Throws error when initializing from an unsupported serialized storage version", () => {
		const newStorage = createMemoryDetachedBlobStorage();

		assert.throws(
			() =>
				tryInitializeMemoryDetachedBlobStorage(
					newStorage,
					JSON.stringify({ version: 2, blobs: [] }),
				),
			/Invalid attachmentBlobs/,
		);
	});

	it("Throws error when tryInitializeMemoryDetachedBlobStorage is called on storage with existing blobs", async () => {
		const blobContent = stringToBuffer("test content", "utf8");

		// Create and populate blob storage
		const storage = createMemoryDetachedBlobStorage();
		await storage.createBlob(blobContent);

		// Serialize the storage
		const serializedStorage = storage.serialize();

		assert(serializedStorage !== undefined, "Serialized storage is undefined");

		const newStorage = createMemoryDetachedBlobStorage();
		// Add another blob to the storage
		await newStorage.createBlob(stringToBuffer("another test content", "utf8"));
		assert.throws(() => {
			tryInitializeMemoryDetachedBlobStorage(newStorage, serializedStorage);
		}, "Expected an error when initializing storage that already has blobs");
	});
	it("Returns undefined when serializing empty storage", () => {
		const storage = createMemoryDetachedBlobStorage();
		const serializedStorage = storage.serialize();
		assert.strictEqual(
			serializedStorage,
			undefined,
			"Expected undefined when serializing empty storage",
		);
	});
});
