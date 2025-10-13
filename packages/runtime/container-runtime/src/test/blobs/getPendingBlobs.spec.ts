/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IPendingBlobs, SerializableLocalBlobRecord } from "../../blobManager/index.js";

import {
	attachHandle,
	blobToText,
	createTestMaterial,
	ensureBlobsShared,
	getDedupedStorageIdForString,
	getSerializedBlobForString,
	getSummaryContentsWithFormatValidation,
	MIN_TTL,
	textToBlob,
	unpackHandle,
} from "./blobTestUtils.js";

// ADO#44999: Update for placeholder pending blob creation and getPendingLocalState
for (const createBlobPayloadPending of [false, true]) {
	describe(`getPendingBlobs (pending payloads): ${createBlobPayloadPending}`, () => {
		it("With no pending blobs", async () => {
			const { blobManager } = createTestMaterial({ createBlobPayloadPending });
			const pendingState = blobManager.getPendingBlobs();
			assert.strictEqual(pendingState, undefined);
		});

		it("getPendingBlobs while uploading", async () => {
			const { mockBlobStorage, blobManager } = createTestMaterial({
				createBlobPayloadPending,
			});
			// Pause storage, so we can leave the upload in pending state
			mockBlobStorage.pause();
			const handleP = blobManager.createBlob(textToBlob("hello"));
			if (createBlobPayloadPending) {
				const handle = await handleP;
				attachHandle(handle);
			}

			// Wait until we are sure the upload is pending
			await mockBlobStorage.waitBlobAvailable();

			const pendingBlobs = blobManager.getPendingBlobs();
			if (createBlobPayloadPending) {
				const { localId } = unpackHandle(await handleP);
				assert.deepStrictEqual(pendingBlobs, {
					[localId]: {
						state: "localOnly",
						blob: getSerializedBlobForString("hello"),
					},
				});
			} else {
				// Non-payload-pending can't have its handle attached, so the pending blob will
				// be omitted.
				assert.strictEqual(pendingBlobs, undefined);
			}

			// Since everything is still pending, shouldn't have anything in the summary
			const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
			assert.strictEqual(ids, undefined);
			assert.strictEqual(redirectTable, undefined);
		});

		it("getPendingBlobs while attaching", async () => {
			const { mockOrderingService, blobManager } = createTestMaterial({
				createBlobPayloadPending,
			});
			// Pause sequencing, so we can leave the attach in pending state
			mockOrderingService.pause();
			const handleP = blobManager.createBlob(textToBlob("hello"));
			if (createBlobPayloadPending) {
				const handle = await handleP;
				attachHandle(handle);
			}

			// Wait until we are sure the BlobAttach message is pending
			await mockOrderingService.waitMessageAvailable();

			const pendingBlobs = blobManager.getPendingBlobs();
			if (createBlobPayloadPending) {
				const { localId } = unpackHandle(await handleP);
				assert(
					pendingBlobs !== undefined && Object.entries(pendingBlobs).length === 1,
					"Expect one pending blob",
				);
				const pendingBlob: SerializableLocalBlobRecord | undefined = pendingBlobs[localId];
				assert(pendingBlob !== undefined, "Expect pending blob with localId");
				assert.strictEqual(pendingBlob.state, "uploaded");
				assert.strictEqual(pendingBlob.blob, getSerializedBlobForString("hello"));
				assert.strictEqual(pendingBlob.storageId, await getDedupedStorageIdForString("hello"));
				assert.strictEqual(typeof pendingBlob.uploadTime, "number");
				assert.strictEqual(pendingBlob.minTTLInSeconds, MIN_TTL);
			} else {
				// Non-payload-pending can't have its handle attached, so the pending blob will
				// be omitted.
				assert.strictEqual(pendingBlobs, undefined);
			}

			// Since everything is still pending, shouldn't have anything in the summary
			const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
			assert.strictEqual(ids, undefined);
			assert.strictEqual(redirectTable, undefined);
		});

		it("getPendingBlobs after attach completes", async () => {
			const { blobManager } = createTestMaterial({ createBlobPayloadPending });
			const handle = await blobManager.createBlob(textToBlob("hello"));
			await ensureBlobsShared([handle]);
			const pendingState = blobManager.getPendingBlobs();
			assert.strictEqual(pendingState, undefined);

			const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
			assert.strictEqual(ids?.length, 1);
			assert.strictEqual(redirectTable?.length, 1);
		});

		it("Multiple blobs in multiple states", async () => {
			const { mockBlobStorage, mockOrderingService, blobManager } = createTestMaterial({
				createBlobPayloadPending,
			});

			// First blob fully uploaded/attached
			const handle1 = await blobManager.createBlob(textToBlob("hello"));
			await ensureBlobsShared([handle1]);

			// Pause storage and sequencing, so we can advance each blob to a different state
			mockBlobStorage.pause();
			mockOrderingService.pause();

			// Second blob attaching
			const handleP2 = blobManager.createBlob(textToBlob("world"));
			if (createBlobPayloadPending) {
				const handle2 = await handleP2;
				attachHandle(handle2);
			}
			await mockBlobStorage.waitCreateOne();
			await mockOrderingService.waitMessageAvailable();

			// Third blob uploading
			const handleP3 = blobManager.createBlob(textToBlob("fizz"));
			if (createBlobPayloadPending) {
				const handle3 = await handleP3;
				attachHandle(handle3);
			}
			await mockBlobStorage.waitBlobAvailable();

			if (createBlobPayloadPending) {
				// Fourth blob just created but handle not attached, so upload not started
				await blobManager.createBlob(textToBlob("buzz"));
				const pendingBlobs = blobManager.getPendingBlobs();
				const { localId: localId2 } = unpackHandle(await handleP2);
				const { localId: localId3 } = unpackHandle(await handleP3);
				assert(
					pendingBlobs !== undefined && Object.entries(pendingBlobs).length === 2,
					"Expect two pending blobs",
				);
				const pendingBlob2: SerializableLocalBlobRecord | undefined = pendingBlobs[localId2];
				assert(pendingBlob2 !== undefined, "Expect pending blob with localId2");
				assert.strictEqual(pendingBlob2.state, "uploaded");
				assert.strictEqual(pendingBlob2.blob, getSerializedBlobForString("world"));
				assert.strictEqual(
					pendingBlob2.storageId,
					await getDedupedStorageIdForString("world"),
				);
				assert.strictEqual(typeof pendingBlob2.uploadTime, "number");
				assert.strictEqual(pendingBlob2.minTTLInSeconds, MIN_TTL);

				const pendingBlob3: SerializableLocalBlobRecord | undefined = pendingBlobs[localId3];
				assert(pendingBlob3 !== undefined, "Expect pending blob with localId3");
				assert.strictEqual(pendingBlob3.state, "localOnly");
				assert.strictEqual(pendingBlob3.blob, getSerializedBlobForString("fizz"));
			} else {
				const pendingBlobs = blobManager.getPendingBlobs();
				assert.strictEqual(pendingBlobs, undefined);
			}

			// Only the first blob should be in the summary
			const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
			assert.strictEqual(ids?.length, 1);
			assert.strictEqual(redirectTable?.length, 1);
		});

		it("Round-trips pending blobs when they are not shared", async () => {
			const pendingBlobs: IPendingBlobs = {
				["blob1"]: {
					state: "uploaded",
					blob: getSerializedBlobForString("hello"),
					storageId: await getDedupedStorageIdForString("hello"),
					// Even though this is expired, it should still round-trip as-is since this test
					// doesn't try to start the share process for it.
					uploadTime: 0,
					minTTLInSeconds: MIN_TTL,
				},
				["blob2"]: {
					state: "localOnly",
					blob: getSerializedBlobForString("world"),
				},
				["blob3"]: {
					state: "uploaded",
					blob: getSerializedBlobForString("fizz"),
					storageId: await getDedupedStorageIdForString("fizz"),
					uploadTime: Date.now(),
					minTTLInSeconds: MIN_TTL,
				},
			};

			const { blobManager } = createTestMaterial({
				pendingBlobs,
				createBlobPayloadPending,
			});

			const roundTrippedPendingBlobs = blobManager.getPendingBlobs();

			assert.deepStrictEqual(roundTrippedPendingBlobs, pendingBlobs);

			// Nothing should have made it into the summary
			const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
			assert.strictEqual(ids, undefined);
			assert.strictEqual(redirectTable, undefined);
		});
	});

	describe(`Load with pending blobs (pending payloads): ${createBlobPayloadPending}`, () => {
		it("Can read blobs loaded from pending state before sharing", async () => {
			const pendingBlobs: IPendingBlobs = {
				["blob1"]: {
					state: "localOnly",
					blob: getSerializedBlobForString("hello"),
				},
				["blob2"]: {
					state: "uploaded",
					blob: getSerializedBlobForString("world"),
					storageId: await getDedupedStorageIdForString("world"),
					uploadTime: Date.now(),
					minTTLInSeconds: MIN_TTL,
				},
			};

			const { blobManager } = createTestMaterial({
				pendingBlobs,
				createBlobPayloadPending,
			});

			assert(blobManager.hasBlob("blob1"));
			const blob1 = await blobManager.getBlob("blob1", createBlobPayloadPending);
			assert.strictEqual(blobToText(blob1), "hello");

			assert(blobManager.hasBlob("blob2"));
			const blob2 = await blobManager.getBlob("blob2", createBlobPayloadPending);
			assert.strictEqual(blobToText(blob2), "world");

			// Nothing should have made it into the summary
			const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
			assert.strictEqual(ids, undefined);
			assert.strictEqual(redirectTable, undefined);
		});

		it("Can complete sharing for a blob loaded in localOnly state", async () => {
			const pendingBlobs: IPendingBlobs = {
				["blob1"]: {
					state: "localOnly",
					blob: getSerializedBlobForString("hello"),
				},
			};

			const { mockBlobStorage, mockOrderingService, blobManager } = createTestMaterial({
				pendingBlobs,
				createBlobPayloadPending,
			});

			await blobManager.sharePendingBlobs();

			assert(blobManager.hasBlob("blob1"));
			const blob1 = await blobManager.getBlob("blob1", createBlobPayloadPending);
			assert.strictEqual(blobToText(blob1), "hello");

			// Verify only a single blob uploaded and a single message sequenced
			assert.strictEqual(mockBlobStorage.blobsCreated, 1);
			assert.strictEqual(mockOrderingService.messagesSequenced, 1);

			// Shared blob should be in the summary
			const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
			assert.strictEqual(ids?.length, 1);
			assert.strictEqual(redirectTable?.length, 1);

			// Blob should no longer appear in pending state
			assert.strictEqual(blobManager.getPendingBlobs(), undefined);
		});

		it("Can complete sharing for a blob loaded in uploaded state that is not expired", async () => {
			const pendingBlobs: IPendingBlobs = {
				["blob1"]: {
					state: "uploaded",
					blob: getSerializedBlobForString("hello"),
					storageId: await getDedupedStorageIdForString("hello"),
					uploadTime: Date.now(),
					minTTLInSeconds: MIN_TTL,
				},
			};

			const { mockBlobStorage, mockOrderingService, blobManager } = createTestMaterial({
				pendingBlobs,
				createBlobPayloadPending,
			});

			await blobManager.sharePendingBlobs();

			assert(blobManager.hasBlob("blob1"));
			const blob1 = await blobManager.getBlob("blob1", createBlobPayloadPending);
			assert.strictEqual(blobToText(blob1), "hello");

			// Verify no blobs uploaded and a single message sequenced
			assert.strictEqual(mockBlobStorage.blobsCreated, 0);
			assert.strictEqual(mockOrderingService.messagesSequenced, 1);

			// Shared blob should be in the summary
			const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
			assert.strictEqual(ids?.length, 1);
			assert.strictEqual(redirectTable?.length, 1);

			// Blob should no longer appear in pending state
			assert.strictEqual(blobManager.getPendingBlobs(), undefined);
		});

		it("Can complete sharing for a blob loaded in uploaded state that is expired", async () => {
			const pendingBlobs: IPendingBlobs = {
				["blob1"]: {
					state: "uploaded",
					blob: getSerializedBlobForString("hello"),
					storageId: await getDedupedStorageIdForString("hello"),
					uploadTime: 0,
					minTTLInSeconds: MIN_TTL,
				},
			};

			const { mockBlobStorage, mockOrderingService, blobManager } = createTestMaterial({
				pendingBlobs,
				createBlobPayloadPending,
			});

			await blobManager.sharePendingBlobs();

			assert(blobManager.hasBlob("blob1"));
			const blob1 = await blobManager.getBlob("blob1", createBlobPayloadPending);
			assert.strictEqual(blobToText(blob1), "hello");

			// Verify a single blobs uploaded (the reupload) and a single message sequenced
			assert.strictEqual(mockBlobStorage.blobsCreated, 1);
			assert.strictEqual(mockOrderingService.messagesSequenced, 1);

			// Shared blob should be in the summary
			const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
			assert.strictEqual(ids?.length, 1);
			assert.strictEqual(redirectTable?.length, 1);

			// Blob should no longer appear in pending state
			assert.strictEqual(blobManager.getPendingBlobs(), undefined);
		});

		it("Multiple blobs in multiple states", async () => {
			const pendingBlobs: IPendingBlobs = {
				["blob1"]: {
					state: "localOnly",
					blob: getSerializedBlobForString("hello"),
				},
				["blob2"]: {
					state: "uploaded",
					blob: getSerializedBlobForString("world"),
					storageId: await getDedupedStorageIdForString("world"),
					uploadTime: Date.now(),
					minTTLInSeconds: MIN_TTL,
				},
				["blob3"]: {
					state: "uploaded",
					blob: getSerializedBlobForString("fizz"),
					storageId: await getDedupedStorageIdForString("fizz"),
					uploadTime: 0,
					minTTLInSeconds: MIN_TTL,
				},
			};

			const { mockBlobStorage, mockOrderingService, blobManager } = createTestMaterial({
				pendingBlobs,
				createBlobPayloadPending,
			});

			await blobManager.sharePendingBlobs();

			assert(blobManager.hasBlob("blob1"));
			const blob1 = await blobManager.getBlob("blob1", createBlobPayloadPending);
			assert.strictEqual(blobToText(blob1), "hello");
			assert(blobManager.hasBlob("blob2"));
			const blob2 = await blobManager.getBlob("blob2", createBlobPayloadPending);
			assert.strictEqual(blobToText(blob2), "world");
			assert(blobManager.hasBlob("blob3"));
			const blob3 = await blobManager.getBlob("blob3", createBlobPayloadPending);
			assert.strictEqual(blobToText(blob3), "fizz");

			// Two blobs uploaded (blob1 and blob3) and three messages sequenced
			assert.strictEqual(mockBlobStorage.blobsCreated, 2);
			assert.strictEqual(mockOrderingService.messagesSequenced, 3);

			// Shared blobs should be in the summary
			const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
			assert.strictEqual(ids?.length, 3);
			assert.strictEqual(redirectTable?.length, 3);

			// Blobs should no longer appear in pending state
			assert.strictEqual(blobManager.getPendingBlobs(), undefined);
		});

		describe("Seeing an attach message from a prior client", () => {
			it("Attach message arrives before calling sharePendingBlobs()", async () => {
				const pendingBlobs: IPendingBlobs = {
					["blob1"]: {
						state: "localOnly",
						blob: getSerializedBlobForString("hello"),
					},
					["blob2"]: {
						state: "uploaded",
						blob: getSerializedBlobForString("world"),
						storageId: await getDedupedStorageIdForString("world"),
						uploadTime: Date.now(),
						minTTLInSeconds: MIN_TTL,
					},
					["blob3"]: {
						state: "uploaded",
						blob: getSerializedBlobForString("fizz"),
						storageId: await getDedupedStorageIdForString("fizz"),
						uploadTime: 0,
						minTTLInSeconds: MIN_TTL,
					},
				};

				const { mockBlobStorage, mockOrderingService, blobManager } = createTestMaterial({
					pendingBlobs,
					createBlobPayloadPending,
				});

				mockOrderingService.sendBlobAttachMessage("priorClientId", "blob1", "remoteBlob1");
				mockOrderingService.sendBlobAttachMessage("priorClientId", "blob2", "remoteBlob2");
				mockOrderingService.sendBlobAttachMessage("priorClientId", "blob3", "remoteBlob3");

				// Should already have sequenced all three messages sent above
				assert.strictEqual(mockBlobStorage.blobsCreated, 0);
				assert.strictEqual(mockOrderingService.messagesSequenced, 3);

				// The blobs should be attached after processing the attach messages, and so should no longer
				// be in the pending state
				assert.strictEqual(blobManager.getPendingBlobs(), undefined);
				// Shared blobs should be in the summary
				const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
				assert.strictEqual(ids?.length, 3);
				assert.strictEqual(redirectTable?.length, 3);

				// Should be a no-op
				await blobManager.sharePendingBlobs();

				// Verify no uploads and no additional messages sequenced.
				assert.strictEqual(mockBlobStorage.blobsCreated, 0);
				assert.strictEqual(mockOrderingService.messagesSequenced, 3);
			});

			it("Attach message arrives during upload attempts", async () => {
				const pendingBlobs: IPendingBlobs = {
					["blob1"]: {
						state: "localOnly",
						blob: getSerializedBlobForString("hello"),
					},
					["blob2"]: {
						state: "uploaded",
						blob: getSerializedBlobForString("world"),
						storageId: await getDedupedStorageIdForString("world"),
						uploadTime: 0,
						minTTLInSeconds: MIN_TTL,
					},
				};

				const { mockBlobStorage, mockOrderingService, blobManager } = createTestMaterial({
					pendingBlobs,
					createBlobPayloadPending,
				});

				mockBlobStorage.pause();

				const sharePendingBlobsP = blobManager.sharePendingBlobs();

				// Wait and make sure both blobs have started uploading
				if (mockBlobStorage.blobsReceived < 2) {
					await new Promise<void>((resolve) => {
						const onBlobReceived = () => {
							if (mockBlobStorage.blobsReceived === 2) {
								mockBlobStorage.events.off("blobReceived", onBlobReceived);
								resolve();
							}
						};
						mockBlobStorage.events.on("blobReceived", onBlobReceived);
					});
				}

				mockOrderingService.sendBlobAttachMessage("priorClientId", "blob1", "remoteBlob1");
				mockOrderingService.sendBlobAttachMessage("priorClientId", "blob2", "remoteBlob2");

				// Should already have sequenced both messages sent above
				assert.strictEqual(mockBlobStorage.blobsCreated, 0);
				assert.strictEqual(mockOrderingService.messagesSequenced, 2);

				// The sharePendingBlobs() call should have resolved since all blobs are now attached
				await sharePendingBlobsP;
				// The blobs should be attached after processing the attach messages, and so should no longer
				// be in the pending state
				assert.strictEqual(blobManager.getPendingBlobs(), undefined);
				// Shared blobs should be in the summary
				const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
				assert.strictEqual(ids?.length, 2);
				assert.strictEqual(redirectTable?.length, 2);

				// Allow the uploads to complete
				await mockBlobStorage.waitCreateOne();
				await mockBlobStorage.waitCreateOne();

				// The two uploads will complete, but we should stop afterwards and not submit attach messages.
				assert.strictEqual(mockBlobStorage.blobsCreated, 2);
				// TODO: Make sure this would not run too soon to catch an incorrectly sequenced message
				assert.strictEqual(mockOrderingService.messagesSequenced, 2);
			});
		});
	});
}
