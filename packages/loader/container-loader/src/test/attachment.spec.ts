/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { AttachState } from "@fluidframework/container-definitions";
import { v4 as uuid } from "uuid";
import { SummaryType } from "@fluidframework/protocol-definitions";
import { stringToBuffer } from "@fluid-internal/client-utils";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import {
	AttachProcessProps,
	AttachingDataWithBlobs,
	DetachedDataWithOutstandingBlobs,
	runRetriableAttachProcess,
	DetachedDefaultData,
	AttachmentData,
	AttachingDataWithoutBlobs,
} from "../attachment.js";
import { combineAppAndProtocolSummary } from "../utils.js";

const emptySummary = combineAppAndProtocolSummary(
	{ tree: {}, type: SummaryType.Tree },
	{ tree: {}, type: SummaryType.Tree },
);

type ObjectWithCallCounts<T extends Record<string, any>> = T &
	Record<"calls", Record<keyof T, number>>;

const addCallCounts = <T extends Record<string, any>>(obj: T): ObjectWithCallCounts<T> => {
	const calls = Object.keys(obj).reduce((pv, cv) => {
		pv[cv] = 0;
		return pv;
	}, {}) as Record<keyof T, number>;

	return new Proxy<ObjectWithCallCounts<T>>(obj as ObjectWithCallCounts<T>, {
		get: (t, p, r): any => {
			if (p === "calls") {
				return calls;
			} else {
				calls[p as keyof T]++;
				return Reflect.get(t, p, r);
			}
		},
	});
};

const createDetachStorage = (
	blobCount: number,
): ObjectWithCallCounts<Exclude<AttachProcessProps["detachedBlobStorage"], undefined>> => {
	const blobs = new Map<string, ArrayBufferLike>(
		Array.from({ length: blobCount }).map((_, i) => [
			i.toString(),
			stringToBuffer(`${i}-content`, "utf-8"),
		]),
	);

	return addCallCounts({
		get size() {
			return blobs.size;
		},
		getBlobIds() {
			return [...blobs.keys()];
		},
		async readBlob(id) {
			const content = blobs.get(id);
			assert(content !== undefined, `no blob content for [${id}]`);
			return content;
		},
	});
};

const createProxyWithFailDefault = <T extends Record<string, any> | undefined>(
	partial: Partial<T> = {},
): T => {
	return new Proxy(partial, {
		get: (t, p, r): any => {
			if (p in t) {
				return Reflect.get(t, p, r);
			}

			return new Proxy(
				{},
				{
					get: () => assert.fail(`unexpected call too ${p.toString()}`),
				},
			);
		},
	}) as T;
};

describe("runRetriableAttachProcess", () => {
	describe("end to end process", () => {
		it("From DetachedDefaultData without blobs or offline", async () => {
			const initial: DetachedDefaultData = {
				state: AttachState.Detached,
			};
			let attachmentData: AttachmentData | undefined;
			await runRetriableAttachProcess({
				initialAttachmentData: initial,
				offlineLoadEnabled: false,
				setAttachmentData: (data) => (attachmentData = data),
				createAttachmentSummary: (redirectTable) => {
					assert.strictEqual(redirectTable, undefined, "redirectTable");
					return emptySummary;
				},
				createOrGetStorageService: async () =>
					createProxyWithFailDefault<IDocumentStorageService>(),
			});

			assert.strictEqual(attachmentData?.state, AttachState.Attached, "should be attached");
		});

		it("From DetachedDefaultData with offline and without blobs", async () => {
			const initial: DetachedDefaultData = {
				state: AttachState.Detached,
			};
			let attachmentData: AttachmentData | undefined;
			const snapshot = await runRetriableAttachProcess({
				initialAttachmentData: initial,
				offlineLoadEnabled: true,
				setAttachmentData: (data) => (attachmentData = data),
				createAttachmentSummary: (redirectTable) => {
					assert.strictEqual(redirectTable, undefined, "redirectTable");
					return emptySummary;
				},
				createOrGetStorageService: async () => ({
					createBlob: async () => assert.fail("no blobs should be created"),
					uploadSummaryWithContext: async () =>
						assert.fail("no summary should be uploaded outside of create"),
				}),
			});

			assert.strictEqual(attachmentData?.state, AttachState.Attached, "should be attached");
			assert.notStrictEqual(snapshot, undefined, "should have snapshot");
		});

		it("From DetachedDefaultData with blobs and without offline", async () => {
			const initial: DetachedDefaultData = {
				state: AttachState.Detached,
			};
			let attachmentData: AttachmentData | undefined;
			const blobCount = 10;
			const detachedBlobStorage = createDetachStorage(blobCount);
			const storageAdapter = addCallCounts({
				createBlob: async () => Promise.resolve({ id: uuid() }),
				uploadSummaryWithContext: async () => Promise.resolve(uuid()),
			});
			await runRetriableAttachProcess({
				initialAttachmentData: initial,
				offlineLoadEnabled: false,
				setAttachmentData: (data) => (attachmentData = data),
				createAttachmentSummary: (redirectTable) => {
					assert.strictEqual(redirectTable?.size, blobCount, "redirectTable?.size");
					return emptySummary;
				},
				createOrGetStorageService: async () => storageAdapter,
				detachedBlobStorage,
			});

			// expect every blob to read, and uploaded
			assert.strictEqual(
				detachedBlobStorage.calls.readBlob,
				blobCount,
				"detachedBlobStorage.calls.readBlob",
			);
			assert.strictEqual(
				storageAdapter.calls.createBlob,
				blobCount,
				"storageAdapter.calls.createBlob",
			);

			// after blobs are uploaded summary should be
			assert.strictEqual(
				storageAdapter.calls.uploadSummaryWithContext,
				1,
				"storageAdapter.calls.uploadSummaryWithContext",
			);

			assert.strictEqual(attachmentData?.state, AttachState.Attached, "should be attached");
		});

		it("From DetachedDefaultData with zero blobs and without offline", async () => {
			const initial: DetachedDefaultData = {
				state: AttachState.Detached,
			};
			let attachmentData: AttachmentData | undefined;
			await runRetriableAttachProcess({
				initialAttachmentData: initial,
				offlineLoadEnabled: false,
				setAttachmentData: (data) => (attachmentData = data),
				createAttachmentSummary: (redirectTable) => {
					assert.strictEqual(redirectTable, undefined, "redirectTable");
					return emptySummary;
				},
				createOrGetStorageService: async () => createProxyWithFailDefault(),
				// we have blobs storage, but it is empty,
				// so it should be treat like there are no blobs
				detachedBlobStorage: createProxyWithFailDefault<
					AttachProcessProps["detachedBlobStorage"]
				>({ size: 0 }),
			});

			assert.strictEqual(attachmentData?.state, AttachState.Attached, "should be attached");
		});
	});

	describe("ends in intermediate state due to failure", () => {
		it("From DetachedDefaultData without blobs with createAttachmentSummary failure", async () => {
			const initial: DetachedDefaultData = {
				state: AttachState.Detached,
			};
			let attachmentData: AttachmentData | undefined;
			const error = new Error("createAttachmentSummary failure");
			try {
				await runRetriableAttachProcess(
					createProxyWithFailDefault<AttachProcessProps>({
						initialAttachmentData: initial,
						detachedBlobStorage: undefined,
						createAttachmentSummary: () => {
							throw error;
						},
					}),
				);
				assert.fail("failure expected");
			} catch (e) {
				assert.deepStrictEqual(e, error);
			}

			assert.deepStrictEqual(
				attachmentData,
				undefined,
				"attachment data shouldn't have been set",
			);
		});

		it("From DetachedDefaultData without blobs getStorageService failure", async () => {
			const initial: DetachedDefaultData = {
				state: AttachState.Detached,
			};
			let attachmentData: AttachmentData | undefined;
			const error = new Error("getStorageService failure");
			try {
				await runRetriableAttachProcess(
					createProxyWithFailDefault<AttachProcessProps>({
						initialAttachmentData: initial,
						setAttachmentData: (data) => (attachmentData = data),
						createAttachmentSummary: () => emptySummary,
						detachedBlobStorage: undefined,
						createOrGetStorageService: () => {
							throw error;
						},
					}),
				);
				assert.fail("failure expected");
			} catch (e) {
				assert.deepStrictEqual(e, error);
			}

			assert.deepStrictEqual<AttachingDataWithoutBlobs>(
				attachmentData,
				{
					state: AttachState.Attaching,
					blobs: "none",
					summary: emptySummary,
				},
				"should have made it to attaching state",
			);
		});

		it("From DetachedDefaultData with blobs with createBlob failure", async () => {
			const initial: DetachedDefaultData = {
				state: AttachState.Detached,
			};
			let attachmentData: AttachmentData | undefined;
			const blobCount = 10;
			const detachedBlobStorage = createDetachStorage(blobCount);
			const error = new Error("createBlob failure");
			try {
				await runRetriableAttachProcess({
					initialAttachmentData: initial,
					offlineLoadEnabled: false,
					setAttachmentData: (data) => (attachmentData = data),
					createAttachmentSummary: () => emptySummary,
					createOrGetStorageService: async () =>
						createProxyWithFailDefault<IDocumentStorageService>({
							createBlob: () => {
								throw error;
							},
						}),
					detachedBlobStorage,
				});
				assert.fail("failure expected");
			} catch (e) {
				assert.deepStrictEqual(e, error);
			}

			assert.deepStrictEqual<DetachedDataWithOutstandingBlobs>(
				attachmentData,
				{
					state: AttachState.Detached,
					blobs: "outstanding",
					redirectTable: new Map(),
				},
				"should have made it to attaching state",
			);
		});

		it("From DetachedDefaultData with blobs with createAttachmentSummary failure", async () => {
			const initial: DetachedDefaultData = {
				state: AttachState.Detached,
			};
			let attachmentData: AttachmentData | undefined;
			const blobCount = 10;
			const detachedBlobStorage = createDetachStorage(blobCount);
			const error = new Error("createAttachmentSummary failure");
			try {
				await runRetriableAttachProcess({
					initialAttachmentData: initial,
					offlineLoadEnabled: false,
					setAttachmentData: (data) => (attachmentData = data),
					createAttachmentSummary: () => {
						throw error;
					},
					createOrGetStorageService: async () =>
						createProxyWithFailDefault<IDocumentStorageService>({
							createBlob: async () => Promise.resolve({ id: uuid() }),
						}),
					detachedBlobStorage,
				});
				assert.fail("failure expected");
			} catch (e) {
				assert.deepStrictEqual(e, error);
			}

			assert.deepStrictEqual<DetachedDataWithOutstandingBlobs>(
				// override redirectTable as it makes validation pain, and we have good coverage in other tests
				{
					...attachmentData,
					redirectTable:
						attachmentData && "redirectTable" in attachmentData ? new Map() : undefined,
				},
				{
					state: AttachState.Detached,
					blobs: "outstanding",
					redirectTable: new Map(),
				},
				"should have made it to attaching state",
			);
		});

		it("From DetachedDefaultData with blobs with uploadSummaryWithContext failure", async () => {
			const initial: DetachedDefaultData = {
				state: AttachState.Detached,
			};
			let attachmentData: AttachmentData | undefined;
			const blobCount = 10;
			const detachedBlobStorage = createDetachStorage(blobCount);
			const error = new Error("uploadSummaryWithContext failure");
			try {
				await runRetriableAttachProcess({
					initialAttachmentData: initial,
					offlineLoadEnabled: false,
					setAttachmentData: (data) => (attachmentData = data),
					createAttachmentSummary: (redirectTable) => {
						assert.strictEqual(redirectTable?.size, 10, "redirectTable?.size");
						return emptySummary;
					},
					createOrGetStorageService: async () => ({
						createBlob: async () => Promise.resolve({ id: uuid() }),
						uploadSummaryWithContext: () => {
							throw error;
						},
					}),
					detachedBlobStorage,
				});
				assert.fail("failure expected");
			} catch (e) {
				assert.deepStrictEqual(e, error);
			}

			assert.deepStrictEqual<AttachingDataWithBlobs>(
				attachmentData,
				{
					state: AttachState.Attaching,
					blobs: "done",
					summary: emptySummary,
				},
				"should have made it to attaching state",
			);
		});
	});

	describe("from intermediate state", () => {
		it("From DetachedDataWithOutstandingBlobs", async () => {
			const initial: DetachedDataWithOutstandingBlobs = {
				state: AttachState.Detached,
				blobs: "outstanding",
				redirectTable: new Map(),
			};
			let attachmentData: AttachmentData | undefined;
			const blobCount = 10;
			const detachedBlobStorage = createDetachStorage(blobCount);
			const storageAdapter = addCallCounts({
				createBlob: async () => Promise.resolve({ id: uuid() }),
				uploadSummaryWithContext: async () => Promise.resolve(uuid()),
			});
			await runRetriableAttachProcess({
				initialAttachmentData: initial,
				offlineLoadEnabled: false,
				setAttachmentData: (data) => (attachmentData = data),
				createAttachmentSummary: (redirectTable) => {
					assert.strictEqual(redirectTable?.size, blobCount, "redirectTable?.size");
					return emptySummary;
				},
				createOrGetStorageService: async () => storageAdapter,
				detachedBlobStorage,
			});

			// expect every blob to read, and uploaded
			assert.strictEqual(initial.redirectTable.size, blobCount, "initial.redirectTable.size");

			assert.strictEqual(
				detachedBlobStorage.calls.readBlob,
				blobCount,
				"detachedBlobStorage.calls.readBlob",
			);
			assert.strictEqual(
				storageAdapter.calls.createBlob,
				blobCount,
				"storageAdapter.calls.createBlob",
			);

			// after blobs are uploaded summary should be
			assert.strictEqual(
				storageAdapter.calls.uploadSummaryWithContext,
				1,
				"storageAdapter.calls.uploadSummaryWithContext",
			);

			assert.strictEqual(attachmentData?.state, AttachState.Attached, "should be attached");
		});

		it("From AttachingDataWithBlobs", async () => {
			const initial: AttachingDataWithBlobs = {
				state: AttachState.Attaching,
				blobs: "done",
				summary: emptySummary,
			};
			let attachmentData: AttachmentData | undefined;
			const snapshot = await runRetriableAttachProcess(
				createProxyWithFailDefault<AttachProcessProps>({
					initialAttachmentData: initial,
					offlineLoadEnabled: true,
					setAttachmentData: (data) => (attachmentData = data),
					createOrGetStorageService: async () =>
						// only the summary should be left to upload
						createProxyWithFailDefault<IDocumentStorageService>({
							uploadSummaryWithContext: async () => Promise.resolve(uuid()),
						}),
				}),
			);

			assert.strictEqual(attachmentData?.state, AttachState.Attached, "should be attached");
			assert.notStrictEqual(snapshot, undefined, "should have snapshot");
		});

		it("From AttachingDataWithoutBlobs", async () => {
			const initial: AttachingDataWithoutBlobs = {
				state: AttachState.Attaching,
				blobs: "none",
				summary: emptySummary,
			};
			let attachmentData: AttachmentData | undefined;
			const snapshot = await runRetriableAttachProcess(
				createProxyWithFailDefault<AttachProcessProps>({
					initialAttachmentData: initial,
					offlineLoadEnabled: true,
					setAttachmentData: (data) => (attachmentData = data),
					createOrGetStorageService: async (summary) => {
						assert.notStrictEqual(summary, undefined, "data.summary");
						return createProxyWithFailDefault();
					},
				}),
			);

			assert.strictEqual(attachmentData?.state, AttachState.Attached, "should be attached");
			assert.notStrictEqual(snapshot, undefined, "should have snapshot");
		});
	});
});
