/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { IDocumentAttributes, ISnapshotTree } from "@fluidframework/protocol-definitions";

import { getDocumentAttributes, runSingle } from "../utils.js";

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
				.catch((e: Error) =>
					assert.strictEqual(
						e.message,
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
});
