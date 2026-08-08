/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import type {
	IDocumentStorageService,
	ISnapshot,
	IDocumentAttributes,
	ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";

import type { ISerializableBlobContents } from "../containerStorageAdapter.js";
import { wireFormatConstants } from "../captureReferencedContents.js";
import type { SerializedSnapshotInfo } from "../serializedStateManager.js";
import {
	convertISnapshotToSnapshotWithBlobs,
	convertSnapshotInfoToSnapshot,
	convertSnapshotToSnapshotInfo,
	getDocumentAttributes,
	runSingle,
} from "../utils.js";

describe("container-loader utils", () => {
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

		it("round-trips textual payloads nested under .blobs as UTF-8", () => {
			const binaryBlobId = "binary-blob";
			const binaryBlob = new Uint8Array([0xff, 0xfe, 0x00, 0x80]).buffer;
			const encodedBlob = bufferToString(binaryBlob, "base64");
			const binarySnapshot: ISnapshot = {
				snapshotTree: {
					blobs: {},
					trees: {
						[wireFormatConstants.blobsTreeName]: {
							blobs: {},
							trees: {
								runtimePayload: {
									blobs: {
										content: binaryBlobId,
									},
									trees: {},
									groupId: "runtime-group",
								},
							},
						},
					},
				},
				blobContents: new Map([[binaryBlobId, stringToBuffer(encodedBlob, "utf8")]]),
				ops: [],
				sequenceNumber: 123,
				latestSequenceNumber: undefined,
				snapshotFormatV: 1,
			};

			const serialized = convertSnapshotToSnapshotInfo(binarySnapshot);
			assert.deepStrictEqual(serialized.snapshotBlobs, {
				[binaryBlobId]: encodedBlob,
			});

			const restored = convertSnapshotInfoToSnapshot(serialized);
			assert.deepStrictEqual(
				bufferToString(restored.blobContents.get(binaryBlobId) ?? new ArrayBuffer(0), "utf8"),
				encodedBlob,
			);
		});

		it("preserves known ordinary attachment blobs as base64", () => {
			const binaryBlobId = "attachment-blob";
			const binaryBlob = new Uint8Array([0xff, 0x00, 0x80]).buffer;
			const binarySnapshot: ISnapshot = {
				snapshotTree: {
					blobs: { attachment: binaryBlobId },
					trees: {},
				},
				blobContents: new Map([[binaryBlobId, binaryBlob]]),
				ops: [],
				sequenceNumber: 123,
				latestSequenceNumber: undefined,
				snapshotFormatV: 1,
			};
			const serialized = convertISnapshotToSnapshotWithBlobs(
				binarySnapshot,
				new Set([binaryBlobId]),
			);
			assert.deepStrictEqual(serialized.snapshotBlobs, {});
			assert.deepStrictEqual(serialized.attachmentBlobContents, {
				[binaryBlobId]: bufferToString(binaryBlob, "base64"),
			});
		});
	});
});
