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

for (const createBlobPayloadPending of [false, true]) {
	describe(`Pending blobs (pending payloads: ${createBlobPayloadPending})`, () => {
		describe("getPendingBlobs", () => {
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
					assert.strictEqual(
						pendingBlob.storageId,
						await getDedupedStorageIdForString("hello"),
					);
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

			it("Round-trips pending blobs when they are partially shared", async () => {
				const pendingBlobs = {
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
					["blob3"]: {
						state: "uploaded",
						blob: getSerializedBlobForString("fizz"),
						storageId: await getDedupedStorageIdForString("fizz"),
						uploadTime: Date.now(),
						minTTLInSeconds: MIN_TTL,
					},
				} as const satisfies IPendingBlobs;

				const { mockBlobStorage, mockOrderingService, blobManager } = createTestMaterial({
					pendingBlobs,
					createBlobPayloadPending,
				});

				mockBlobStorage.pause();
				mockOrderingService.pause();

				const sharePendingBlobsP = blobManager.sharePendingBlobs();

				// Wait and make sure we are waiting on the uploads and messages
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
				if (mockOrderingService.messagesReceived < 1) {
					await new Promise<void>((resolve) => {
						const onMessageReceived = () => {
							if (mockOrderingService.messagesReceived === 1) {
								mockOrderingService.events.off("messageReceived", onMessageReceived);
								resolve();
							}
						};
						mockOrderingService.events.on("messageReceived", onMessageReceived);
					});
				}

				const roundTrippedPendingBlobs1 = blobManager.getPendingBlobs();
				const expectedPendingBlobs1: IPendingBlobs = {
					// blob1 and blob3 should be unmodified (including retaining the uploadTime blob3 started with)
					// since they were not expired and did not progress.
					...pendingBlobs,
					// Since blob2 was expired, it will be back in uploading state when we getPendingBlobs(),
					// and so will be downgraded to localOnly.
					["blob2"]: {
						state: "localOnly",
						blob: getSerializedBlobForString("world"),
					},
				};

				assert.deepStrictEqual(roundTrippedPendingBlobs1, expectedPendingBlobs1);

				// Nothing should have made it into the summary
				const { ids: ids1, redirectTable: redirectTable1 } =
					getSummaryContentsWithFormatValidation(blobManager);
				assert.strictEqual(ids1, undefined);
				assert.strictEqual(redirectTable1, undefined);

				// Allow the blob1 upload to succeed
				await mockBlobStorage.waitCreateOne();
				// And allow the blob3 attach to succeed
				await mockOrderingService.waitSequenceOne();

				const roundTrippedPendingBlobs2 = blobManager.getPendingBlobs();

				assert(roundTrippedPendingBlobs2 !== undefined);
				const {
					blob1: roundTrippedPendingBlob1,
					blob2: roundTrippedPendingBlob2,
					blob3: roundTrippedPendingBlob3,
				} = roundTrippedPendingBlobs2;
				// blob1 was allowed to upload
				assert.strictEqual(roundTrippedPendingBlob1.state, "uploaded");
				assert.strictEqual(roundTrippedPendingBlob1.blob, getSerializedBlobForString("hello"));
				assert.strictEqual(
					roundTrippedPendingBlob1.storageId,
					await getDedupedStorageIdForString("hello"),
				);
				assert.strictEqual(typeof roundTrippedPendingBlob1.uploadTime, "number");
				assert.strictEqual(roundTrippedPendingBlob1.minTTLInSeconds, MIN_TTL);
				// blob2 is still waiting on upload
				assert.strictEqual(roundTrippedPendingBlob2.state, "localOnly");
				assert.strictEqual(roundTrippedPendingBlob2.blob, getSerializedBlobForString("world"));
				// blob3 should be shared and no longer in the pending blobs.
				assert.strictEqual(roundTrippedPendingBlob3, undefined);

				// blob3 will now be in the summary
				const { ids: ids2, redirectTable: redirectTable2 } =
					getSummaryContentsWithFormatValidation(blobManager);
				assert.strictEqual(ids2?.length, 1);
				assert.strictEqual(redirectTable2?.length, 1);

				// Unpause everything and let the share complete
				mockBlobStorage.unpause();
				mockOrderingService.unpause();
				await sharePendingBlobsP;

				// Nothing should be pending any more, and everything should be in the summary.
				assert.strictEqual(blobManager.getPendingBlobs(), undefined);
				const { ids: ids3, redirectTable: redirectTable3 } =
					getSummaryContentsWithFormatValidation(blobManager);
				assert.strictEqual(ids3?.length, 3);
				assert.strictEqual(redirectTable3?.length, 3);
			});
		});

		describe("Load with pending blobs", () => {
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

				// Verify a single blob uploaded (the reupload) and a single message sequenced
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

					// Should already have received and sequenced all three messages sent above
					assert.strictEqual(mockBlobStorage.blobsReceived, 0);
					assert.strictEqual(mockOrderingService.messagesReceived, 3);

					// The blobs should be attached after processing the attach messages, and so should no longer
					// be in the pending state
					assert.strictEqual(blobManager.getPendingBlobs(), undefined);
					// Shared blobs should be in the summary
					const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
					assert.strictEqual(ids?.length, 3);
					assert.strictEqual(redirectTable?.length, 3);

					// Should be a no-op
					await blobManager.sharePendingBlobs();

					// Verify no uploads and no additional messages received.
					// Wait briefly to ensure there aren't any uploads or messages queued in microtasks
					await new Promise<void>((resolve) => {
						setTimeout(() => resolve(), 10);
					});
					assert.strictEqual(mockBlobStorage.blobsReceived, 0);
					assert.strictEqual(mockOrderingService.messagesReceived, 3);
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

					// Should already have received and sequenced both messages sent above
					assert.strictEqual(mockBlobStorage.blobsReceived, 2);
					assert.strictEqual(mockOrderingService.messagesReceived, 2);

					// The sharePendingBlobs() call should resolve since all blobs are now attached
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
					// Wait briefly to ensure there aren't any messages queued in microtasks
					await new Promise<void>((resolve) => {
						setTimeout(() => resolve(), 10);
					});
					assert.strictEqual(mockBlobStorage.blobsReceived, 2);
					assert.strictEqual(mockOrderingService.messagesReceived, 2);
				});

				it("Attach message arrives during attach attempt", async () => {
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

					mockOrderingService.pause();

					// Enqueue the attach messages from the prior client, so they will be sequenced before the
					// new messages resulting from the sharePendingBlobs() call.
					mockOrderingService.sendBlobAttachMessage("priorClientId", "blob1", "remoteBlob1");
					mockOrderingService.sendBlobAttachMessage("priorClientId", "blob2", "remoteBlob2");
					mockOrderingService.sendBlobAttachMessage("priorClientId", "blob3", "remoteBlob3");

					const sharePendingBlobsP = blobManager.sharePendingBlobs();

					// Wait and make sure all three blobs are awaiting an ack (on top of the three messages
					// from the prior client)
					if (mockOrderingService.messagesReceived < 6) {
						await new Promise<void>((resolve) => {
							const onMessageReceived = () => {
								if (mockOrderingService.messagesReceived === 6) {
									mockOrderingService.events.off("messageReceived", onMessageReceived);
									resolve();
								}
							};
							mockOrderingService.events.on("messageReceived", onMessageReceived);
						});
					}

					assert.strictEqual(mockBlobStorage.blobsReceived, 2);
					assert.strictEqual(mockOrderingService.messagesReceived, 6);

					// Sequence the three messages from the prior client
					mockOrderingService.sequenceOne();
					mockOrderingService.sequenceOne();
					mockOrderingService.sequenceOne();

					// The sharePendingBlobs() call should resolve since all blobs are now attached
					await sharePendingBlobsP;
					// The blobs should be attached after processing the attach messages, and so should no longer
					// be in the pending state
					assert.strictEqual(blobManager.getPendingBlobs(), undefined);
					// Shared blobs should be in the summary
					const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
					assert.strictEqual(ids?.length, 3);
					assert.strictEqual(redirectTable?.length, 3);

					// Sequence/drop the messages generated by sharePendingBlobs() - either way we should not error
					// or generate any further messages.
					mockOrderingService.sequenceOne();
					mockOrderingService.dropOne();
					mockOrderingService.dropOne();

					// Wait briefly to ensure there aren't any messages queued in microtasks
					await new Promise<void>((resolve) => {
						setTimeout(() => resolve(), 10);
					});
					assert.strictEqual(mockBlobStorage.blobsReceived, 2);
					assert.strictEqual(mockOrderingService.messagesReceived, 6);
				});

				it("Attach message arrives after attach completes", async () => {
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

					mockOrderingService.pause();

					const sharePendingBlobsP = blobManager.sharePendingBlobs();

					// Wait and make sure all three blobs are awaiting an ack (on top of the three messages
					// from the prior client)
					if (mockOrderingService.messagesReceived < 3) {
						await new Promise<void>((resolve) => {
							const onMessageReceived = () => {
								if (mockOrderingService.messagesReceived === 3) {
									mockOrderingService.events.off("messageReceived", onMessageReceived);
									resolve();
								}
							};
							mockOrderingService.events.on("messageReceived", onMessageReceived);
						});
					}

					// Enqueue the attach messages from the prior client after the ones from the sharePendingBlobs
					// call, so they will be sequenced after. This scenario is probably rare in normal/intended use,
					// since it would imply the prior client is still connected.
					mockOrderingService.sendBlobAttachMessage("priorClientId", "blob1", "remoteBlob1");
					mockOrderingService.sendBlobAttachMessage("priorClientId", "blob2", "remoteBlob2");
					mockOrderingService.sendBlobAttachMessage("priorClientId", "blob3", "remoteBlob3");

					assert.strictEqual(mockBlobStorage.blobsReceived, 2);
					assert.strictEqual(mockOrderingService.messagesReceived, 6);

					// Sequence the three messages from the new client
					mockOrderingService.sequenceOne();
					mockOrderingService.sequenceOne();
					mockOrderingService.sequenceOne();

					// The sharePendingBlobs() call should resolve since all blobs are now attached
					await sharePendingBlobsP;
					// The blobs should be attached after processing the attach messages, and so should no longer
					// be in the pending state
					assert.strictEqual(blobManager.getPendingBlobs(), undefined);
					// Shared blobs should be in the summary
					const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
					assert.strictEqual(ids?.length, 3);
					assert.strictEqual(redirectTable?.length, 3);

					// Sequence the messages from the prior client. We should not error.
					mockOrderingService.sequenceOne();
					mockOrderingService.sequenceOne();
					mockOrderingService.sequenceOne();

					// Wait briefly to ensure there aren't any messages queued in microtasks
					await new Promise<void>((resolve) => {
						setTimeout(() => resolve(), 10);
					});
					assert.strictEqual(mockBlobStorage.blobsReceived, 2);
					assert.strictEqual(mockOrderingService.messagesReceived, 6);
				});
			});
		});
	});
}
