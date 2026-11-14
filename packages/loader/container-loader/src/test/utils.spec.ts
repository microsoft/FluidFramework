/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import type {
	IDocumentStorageService,
	ISnapshot,
	IDocumentAttributes,
	ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";

import type { ISerializableBlobContents } from "../containerStorageAdapter.js";
import type { SerializedSnapshotInfo } from "../serializedStateManager.js";
import {
	convertSnapshotInfoToSnapshot,
	convertSnapshotToSnapshotInfo,
	deserializeBlobContents,
	getDocumentAttributes,
	runSingle,
	serializeBlobContents,
} from "../utils.js";

describe("container-loader utils", () => {
	describe("summary blob serialization", () => {
		it("retains legacy strings for lossless UTF-8 text", () => {
			for (const text of ["", "plain text", "\u00E9\uD83D\uDE00", "\uFFFD"]) {
				const bytes = stringToBuffer(text, "utf8");
				assert.strictEqual(serializeBlobContents(bytes), text);
				assert.deepStrictEqual(deserializeBlobContents(text), bytes);
			}
		});

		it("preserves arbitrary bytes through snapshot conversions", () => {
			for (const bytes of [
				Uint8Array.from({ length: 256 }, (_, index) => index),
				new Uint8Array([0xef, 0xbb, 0xbf, 0x61]),
			]) {
				const snapshot: ISnapshot = {
					snapshotTree: { blobs: { binary: "binary-id" }, trees: {} },
					blobContents: new Map([["binary-id", bytes.buffer]]),
					ops: [],
					sequenceNumber: 1,
					latestSequenceNumber: undefined,
					snapshotFormatV: 1,
				};
				const serialized = convertSnapshotToSnapshotInfo(snapshot);
				const restored = convertSnapshotInfoToSnapshot(serialized);
				assert.deepStrictEqual(restored.blobContents.get("binary-id"), bytes.buffer);
			}
		});
	});

	describe("runSingle", () => {
		it("correctly calls internal func", async () => {
			const wrappedFunc = runSingle(async (base: number, plus: number) => base + plus);

			assert.strictEqual(await wrappedFunc(4, 1), 5);
		});

		it("returns same promise for same args", async () => {
			const wrappedFunc = runSingle(async (base: number, plus: number) => base + plus);

			const [p1, p2] = [wrappedFunc(4, 1), wrappedFunc(4, 1)];

			assert.strictEqual(p2, p1);
			assert.strictEqual(await p1, 5);
			assert.strictEqual(await p2, 5);
		});

		it("fails for different args", async () => {
			const wrappedFunc = runSingle(async (base: number, plus: number) => base + plus);

			const [p1, p2] = [wrappedFunc(4, 1), wrappedFunc(4, 2)];

			assert.notStrictEqual(p2, p1);
			assert.strictEqual(await p1, 5);
			await p2
				.then(() => assert.fail("should fail"))
				.catch((error: Error) =>
					assert.strictEqual(
						error.message,
						"Subsequent calls cannot use different arguments.",
					),
				);
		});
	});

	describe("getDocumentAttributes", () => {
		it("returns default attributes when tree is undefined", async () => {
			const storageMock: Pick<IDocumentStorageService, "readBlob"> = {
				readBlob: async () => new ArrayBuffer(0),
			};

			const attributes = await getDocumentAttributes(storageMock, undefined);

			assert.deepEqual(attributes, {
				minimumSequenceNumber: 0,
				sequenceNumber: 0,
			});
		});

		it("returns attributes from the tree", async () => {
			const tree: ISnapshotTree = {
				blobs: {
					".attributes": "someKey",
				},
				trees: {},
			};

			const expectedAttributes: IDocumentAttributes = {
				minimumSequenceNumber: 10,
				sequenceNumber: 20,
			};

			const storageMock: Pick<IDocumentStorageService, "readBlob"> = {
				readBlob: async (key: string) => {
					if (key === "someKey") {
						const jsonStr = JSON.stringify(expectedAttributes);
						return new TextEncoder().encode(jsonStr).buffer;
					}
					throw new Error("Wrong key");
				},
			};

			const attributes = await getDocumentAttributes(storageMock, tree);

			assert.strictEqual(attributes.minimumSequenceNumber, 10);
			assert.strictEqual(attributes.sequenceNumber, 20);
		});

		it("returns attributes from previous tree format", async () => {
			const tree: ISnapshotTree = {
				trees: {
					".protocol": {
						blobs: {
							attributes: "someKey",
						},
						trees: {},
					},
				},
				blobs: {},
			};

			const expectedAttributes: IDocumentAttributes = {
				minimumSequenceNumber: 10,
				sequenceNumber: 20,
			};

			const storageMock: Pick<IDocumentStorageService, "readBlob"> = {
				readBlob: async (key: string) => {
					if (key === "someKey") {
						const jsonStr = JSON.stringify(expectedAttributes);
						return new TextEncoder().encode(jsonStr).buffer;
					}
					throw new Error("Wrong key");
				},
			};

			const attributes = await getDocumentAttributes(storageMock, tree);

			assert.strictEqual(attributes.minimumSequenceNumber, 10);
			assert.strictEqual(attributes.sequenceNumber, 20);
		});
	});

	describe("SnapshotInfo and Snapshot", () => {
		const snapshotTree: ISnapshotTree = {
			trees: {
				".protocol": {
					blobs: {
						attributes: "someKey",
					},
					trees: {},
				},
			},
			blobs: {},
		};

		const snapshotBlobs: ISerializableBlobContents = {
			someKey: JSON.stringify({ some: 10, data: 20 }),
		};

		const blobContents: Map<string, ArrayBuffer> = new Map([
			["someKey", stringToBuffer(JSON.stringify({ some: 10, data: 20 }), "utf8")],
		]);

		const snapshot: ISnapshot = {
			snapshotTree,
			blobContents,
			ops: [],
			sequenceNumber: 123,
			latestSequenceNumber: undefined,
			snapshotFormatV: 1,
		};

		const snapshotInfo: SerializedSnapshotInfo = {
			snapshotSequenceNumber: 123,
			baseSnapshot: snapshotTree,
			snapshotBlobs,
		};

		it("Converts SnapshotInfo to Snapshot", async () => {
			const convertedSnapshot = convertSnapshotInfoToSnapshot(snapshotInfo);
			assert.deepEqual(convertedSnapshot, snapshot);
		});

		it("Converts Snapshot to SnapshotInfo", async () => {
			const convertedSnapshotInfo = convertSnapshotToSnapshotInfo(snapshot);
			assert.deepEqual<SerializedSnapshotInfo>(convertedSnapshotInfo, {
				baseSnapshot: snapshot.snapshotTree,
				snapshotSequenceNumber: snapshot.sequenceNumber ?? 0,
				snapshotBlobs,
			});
		});
	});
});
