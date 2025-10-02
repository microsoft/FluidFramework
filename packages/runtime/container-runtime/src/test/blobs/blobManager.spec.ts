/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISequencedMessageEnvelope } from "@fluidframework/runtime-definitions/internal";
import {
	isFluidHandlePayloadPending,
	isLocalFluidHandle,
} from "@fluidframework/runtime-utils/internal";
import { LoggingError } from "@fluidframework/telemetry-utils/internal";

import {
	getGCNodePathFromLocalId,
	type IBlobManagerLoadInfo,
} from "../../blobManager/index.js";

import {
	attachHandle,
	blobToText,
	createTestMaterial,
	ensureBlobsShared,
	getSummaryContentsWithFormatValidation,
	MockStorageAdapter,
	simulateAttach,
	textToBlob,
	unpackHandle,
	waitHandlePayloadShared,
	type UnprocessedOp,
} from "./blobTestUtils.js";

for (const createBlobPayloadPending of [false, true]) {
	describe(`BlobManager (pending payloads): ${createBlobPayloadPending}`, () => {
		// #region Detached usage
		describe("Detached usage", () => {
			it("Responds as expected for retrieving unknown blob IDs", async () => {
				const { blobManager } = createTestMaterial({
					attached: false,
					createBlobPayloadPending,
				});
				assert(!blobManager.hasBlob("blobId"));
				await assert.rejects(async () => {
					// Handles for detached blobs are never payload pending, even if the flag is set.
					await blobManager.getBlob("blobId", false);
				});
			});

			it("Can create a blob and retrieve it", async () => {
				const { mockOrderingService, blobManager } = createTestMaterial({
					attached: false,
					createBlobPayloadPending,
				});
				const handle = await blobManager.createBlob(textToBlob("hello"));
				const { localId } = unpackHandle(handle);
				assert(blobManager.hasBlob(localId));
				// Handles for detached blobs are never payload pending, even if the flag is set.
				assert(!handle.payloadPending);
				const blobFromManager = await blobManager.getBlob(localId, false);
				assert.strictEqual(blobToText(blobFromManager), "hello", "Blob content mismatch");
				const blobFromHandle = await handle.get();
				assert.strictEqual(blobToText(blobFromHandle), "hello", "Blob content mismatch");
				assert.strictEqual(
					mockOrderingService.messagesReceived,
					0,
					"Should not try to send messages in detached state",
				);
			});
		});

		describe("Attaching", () => {
			it("Can attach when empty", async () => {
				const { mockBlobStorage, mockRuntime, blobManager } = createTestMaterial({
					attached: false,
					createBlobPayloadPending,
				});
				await simulateAttach(mockBlobStorage, mockRuntime, blobManager);
			});

			it("Can get a detached blob after attaching", async () => {
				const { mockBlobStorage, mockRuntime, blobManager } = createTestMaterial({
					attached: false,
					createBlobPayloadPending,
				});
				const handle = await blobManager.createBlob(textToBlob("hello"));
				const { localId } = unpackHandle(handle);

				await simulateAttach(mockBlobStorage, mockRuntime, blobManager);

				assert(blobManager.hasBlob(localId));
				// Handles for detached blobs are never payload pending, even if the flag is set.
				const blobFromManager = await blobManager.getBlob(localId, false);
				assert.strictEqual(blobToText(blobFromManager), "hello", "Blob content mismatch");
				const blobFromHandle = await handle.get();
				assert.strictEqual(blobToText(blobFromHandle), "hello", "Blob content mismatch");
			});
		});

		// #region Attached usage
		describe("Attached usage", () => {
			describe("Normal usage", () => {
				it("Responds as expected for unknown blob IDs", async () => {
					const { mockBlobStorage, blobManager } = createTestMaterial({
						createBlobPayloadPending,
					});
					assert(!blobManager.hasBlob("blobId"));
					// When payloadPending is false, we throw for unknown blobs
					await assert.rejects(async () => {
						await blobManager.getBlob("blobId", false);
					});

					// When payloadPending is true, we allow the promise to remain pending (waiting
					// for the blob to later arrive)
					const getBlobP = blobManager.getBlob("blobId", true);
					// Simulate the blob being created by some remote client
					const { id: remoteId } = await mockBlobStorage.createBlob(textToBlob("hello"));
					blobManager.processBlobAttachMessage(
						// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
						{ metadata: { localId: "blobId", blobId: remoteId } } as ISequencedMessageEnvelope,
						false,
					);

					const blob = await getBlobP;
					assert.strictEqual(blobToText(blob), "hello", "Blob content mismatch");
				});

				// TODO: Separate test for the network-visible effects of blob creation?
				it("Can create a blob and retrieve it", async () => {
					const { blobManager } = createTestMaterial({ createBlobPayloadPending });
					const handle = await blobManager.createBlob(textToBlob("hello"));
					const { localId } = unpackHandle(handle);

					// TODO: For now, the blob manager can't find pending blobs in unattached handles,
					// like the ones we will have just created if createBlobPayloadPending. Once the
					// internal bookkeeping has been updated to include these, we don't need to
					// ensureBlobsShared() here anymore and these checks can be applied to both the
					// legacy and payloadPending flows.
					if (!createBlobPayloadPending) {
						assert(blobManager.hasBlob(localId));
						const _blobFromManager = await blobManager.getBlob(
							localId,
							createBlobPayloadPending,
						);
						assert.strictEqual(blobToText(_blobFromManager), "hello", "Blob content mismatch");
					}

					assert.strictEqual(
						handle.payloadPending,
						createBlobPayloadPending,
						"Wrong handle type created",
					);
					const blobFromHandle = await handle.get();
					assert.strictEqual(blobToText(blobFromHandle), "hello", "Blob content mismatch");

					assert(isFluidHandlePayloadPending(handle));
					// With payloadPending handles, we won't actually upload and send the attach op until the
					// handle is attached.
					if (createBlobPayloadPending) {
						assert.strictEqual(
							handle.payloadState,
							"pending",
							"Payload should be pending before handle attach",
						);
						let eventRaised = false;
						const onPayloadShared = () => {
							eventRaised = true;
							handle.events.off("payloadShared", onPayloadShared);
						};
						handle.events.on("payloadShared", onPayloadShared);
						await ensureBlobsShared([handle]);
						assert(eventRaised, "payloadShared event was not raised when expected");
					}
					assert.strictEqual(
						handle.payloadState,
						"shared",
						"Payload should be in shared state",
					);

					assert(blobManager.hasBlob(localId));
					const blobFromManager = await blobManager.getBlob(localId, createBlobPayloadPending);
					assert.strictEqual(blobToText(blobFromManager), "hello", "Blob content mismatch");
				});

				it("Can retrieve a blob using its storageId", async () => {
					const { mockOrderingService, blobManager } = createTestMaterial({
						createBlobPayloadPending,
					});
					let storageId: string | undefined;
					const onOpReceived = (op: UnprocessedOp) => {
						storageId = op.metadata.blobId;
						mockOrderingService.events.off("opReceived", onOpReceived);
					};
					mockOrderingService.events.on("opReceived", onOpReceived);
					const handle = await blobManager.createBlob(textToBlob("hello"));
					if (createBlobPayloadPending) {
						await ensureBlobsShared([handle]);
					}

					assert(storageId !== undefined, "Should have been able to sniff out the storageId");
					assert(blobManager.hasBlob(storageId));

					const blobFromManager = await blobManager.getBlob(
						storageId,
						createBlobPayloadPending,
					);
					assert.strictEqual(blobToText(blobFromManager), "hello", "Blob content mismatch");
				});

				it("Does not log an error if runtime is disposed during readBlob error", async () => {
					const mockBlobStorage = new MockStorageAdapter(true);
					mockBlobStorage.readBlob = async () => {
						throw new Error("BOOM!");
					};
					const { mockLogger, mockRuntime, blobManager } = createTestMaterial({
						mockBlobStorage,
						createBlobPayloadPending,
					});

					const handle = await blobManager.createBlob(textToBlob("hello"));
					const { localId } = unpackHandle(handle);
					if (createBlobPayloadPending) {
						await ensureBlobsShared([handle]);
					} else {
						// We have to attach the handle in the legacy flow, or else getBlob will
						// short-circuit storage and get the blob from the pendingBlobs.
						attachHandle(handle);
					}

					mockLogger.clear();
					mockRuntime.disposed = true;
					const getBlobP = blobManager.getBlob(localId, createBlobPayloadPending);
					await assert.rejects(
						getBlobP,
						(e: Error) => e.message === "BOOM!",
						"Expected getBlob to throw with test error message",
					);
					mockLogger.assertMatchNone(
						[{ category: "error" }],
						"Should not have logged any errors",
						undefined,
						false /* clearEventsAfterCheck */,
					);
					mockLogger.assertMatch(
						[{ category: "generic", eventName: "BlobManager:AttachmentReadBlob_cancel" }],
						"Expected the _cancel event to be logged with 'generic' category",
					);
				});

				it("Fails as expected for upload failure", async () => {
					const { mockBlobStorage, blobManager } = createTestMaterial({
						createBlobPayloadPending,
					});
					mockBlobStorage.pause();

					if (createBlobPayloadPending) {
						const handle = await blobManager.createBlob(textToBlob("hello"));
						assert.strict(isLocalFluidHandle(handle));
						assert.strictEqual(
							handle.payloadState,
							"pending",
							"Handle should be in pending state",
						);
						assert.strictEqual(
							handle.payloadShareError,
							undefined,
							"handle should not have an error yet",
						);
						let eventRaised = false;
						const onPayloadShareFailed = (error: unknown): void => {
							eventRaised = true;
							assert.strictEqual(
								(error as Error).message,
								"fake driver error",
								"Did not receive the expected error",
							);
							handle.events.off("payloadShareFailed", onPayloadShareFailed);
						};
						handle.events.on("payloadShareFailed", onPayloadShareFailed);

						attachHandle(handle);
						await mockBlobStorage.waitProcessOne({
							error: new LoggingError("fake driver error"),
						});
						mockBlobStorage.unpause();

						await assert.rejects(waitHandlePayloadShared(handle), {
							message: "fake driver error",
						});

						assert.strict(eventRaised, "should emit payloadShareFailed");
						assert.strictEqual(
							handle.payloadState,
							"pending",
							"Handle should still be in pending state",
						);
						assert.strictEqual(
							(handle.payloadShareError as unknown as Error).message,
							"fake driver error",
							"Handle did not have the expected error",
						);
					} else {
						// If the blobs are created without pending payloads, we don't get to see the handle at
						// all so we can't inspect its state.
						const createBlobP = blobManager.createBlob(textToBlob("hello"));
						await mockBlobStorage.waitProcessOne({
							error: new LoggingError("fake driver error"),
						});
						mockBlobStorage.unpause();

						await assert.rejects(createBlobP, { message: "fake driver error" });
					}

					const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
					assert.strictEqual(ids, undefined);
					assert.strictEqual(redirectTable, undefined);
				});

				it("Reuploads blobs if they are expired", async () => {
					const { mockBlobStorage, blobManager } = createTestMaterial({
						createBlobPayloadPending,
					});
					mockBlobStorage.pause();

					const handleP = blobManager.createBlob(textToBlob("hello"));

					if (createBlobPayloadPending) {
						const _handle = await handleP;
						attachHandle(_handle);
					}
					// Use a negative TTL to force the blob to be expired immediately
					await mockBlobStorage.waitProcessOne({ minTTLOverride: -1 });
					// After unpausing, the second attempt will be processed with a normal TTL
					mockBlobStorage.unpause();
					const handle = await handleP;
					await ensureBlobsShared([handle]);
					assert.strictEqual(
						mockBlobStorage.blobsProcessed,
						2,
						"Blob should have been reuploaded once",
					);

					const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
					assert.strictEqual(ids?.length, 1);
					assert.strictEqual(redirectTable?.length, 1);
				});
			});

			describe("Blobs from remote clients", () => {
				it("Can retrieve blobs uploaded by a remote client", async () => {
					const { mockBlobStorage, mockOrderingService, blobManager } = createTestMaterial({
						createBlobPayloadPending,
					});
					const { blobManager: blobManager2 } = createTestMaterial({
						mockBlobStorage,
						mockOrderingService,
						createBlobPayloadPending,
					});

					const handle = await blobManager2.createBlob(textToBlob("hello"));
					const { localId } = unpackHandle(handle);
					if (createBlobPayloadPending) {
						await ensureBlobsShared([handle]);
					}

					assert(blobManager.hasBlob(localId));
					const blobFromManager = await blobManager.getBlob(localId, createBlobPayloadPending);
					assert.strictEqual(blobToText(blobFromManager), "hello", "Blob content mismatch");
				});

				it("Handles deduping against a remote blob", async () => {
					const { mockBlobStorage, mockOrderingService, blobManager } = createTestMaterial({
						createBlobPayloadPending,
					});
					const { blobManager: blobManager2 } = createTestMaterial({
						mockBlobStorage,
						mockOrderingService,
						createBlobPayloadPending,
					});

					const remoteHandle = await blobManager2.createBlob(textToBlob("hello"));
					if (createBlobPayloadPending) {
						await ensureBlobsShared([remoteHandle]);
					}

					const localHandle = await blobManager.createBlob(textToBlob("hello"));
					if (createBlobPayloadPending) {
						await ensureBlobsShared([localHandle]);
					}

					const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
					assert.strictEqual(ids?.length, 1);
					assert.strictEqual(redirectTable?.length, 2);
				});

				it("Handles deduping against a remote blob between upload and BlobAttach", async () => {
					const { mockBlobStorage, mockOrderingService, blobManager } = createTestMaterial({
						createBlobPayloadPending,
					});
					const { blobManager: blobManager2 } = createTestMaterial({
						mockBlobStorage,
						mockOrderingService,
						createBlobPayloadPending,
					});

					mockOrderingService.pause();
					const remoteHandleP = blobManager2.createBlob(textToBlob("hello"));
					const localHandleP = blobManager.createBlob(textToBlob("hello"));
					if (createBlobPayloadPending) {
						const [remoteHandle, localHandle] = await Promise.all([
							remoteHandleP,
							localHandleP,
						]);
						// Attach the handle to generate an op, but don't wait for the blob to be shared yet
						// until we unpause the ordering service and can process those ops.
						attachHandle(remoteHandle);
						attachHandle(localHandle);
					}
					// Ensure both blobs have completed upload and are waiting for their ops to be ack'd
					await new Promise<void>((resolve) => {
						if (mockOrderingService.messagesReceived !== 2) {
							const onOpReceived = () => {
								if (mockOrderingService.messagesReceived === 2) {
									resolve();
									mockOrderingService.events.off("opReceived", onOpReceived);
								}
							};
							mockOrderingService.events.on("opReceived", onOpReceived);
						}
					});
					mockOrderingService.unpause();
					// Await the handle promises here for the legacy createBlob flow
					await Promise.all([remoteHandleP, localHandleP]);
					const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
					assert.strictEqual(ids?.length, 1);
					assert.strictEqual(redirectTable?.length, 2);
				});
			});

			describe("Resubmit", () => {
				it("Can complete blob attach with resubmit", async () => {
					const { mockOrderingService, blobManager } = createTestMaterial({
						createBlobPayloadPending,
					});

					mockOrderingService.pause();
					// Generate the original message
					const handleP = blobManager.createBlob(textToBlob("hello"));
					if (createBlobPayloadPending) {
						const _handle = await handleP;
						_handle.attachGraph();
					}
					// Drop the original message
					await mockOrderingService.waitDropOne();
					// Sequence the resubmitted message
					await mockOrderingService.waitSequenceOne();

					const handle = await handleP;
					if (createBlobPayloadPending) {
						await ensureBlobsShared([handle]);
					}
					assert(isFluidHandlePayloadPending(handle));
					assert.strictEqual(handle.payloadState, "shared", "Payload should be shared");

					const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
					assert.strictEqual(ids?.length, 1);
					assert.strictEqual(redirectTable?.length, 1);
				});

				it("Can complete blob attach with multiple resubmits", async () => {
					const { mockOrderingService, blobManager } = createTestMaterial({
						createBlobPayloadPending,
					});

					mockOrderingService.pause();
					// Generate the original message
					const handle1P = blobManager.createBlob(textToBlob("hello"));
					if (createBlobPayloadPending) {
						const _handle = await handle1P;
						_handle.attachGraph();
					}
					// Drop the original message for handle1
					await mockOrderingService.waitDropOne();

					const handle2P = blobManager.createBlob(textToBlob("world"));
					if (createBlobPayloadPending) {
						const _handle = await handle2P;
						_handle.attachGraph();
					}

					// Drop the resubmitted message for handle1
					await mockOrderingService.waitDropOne();
					// Drop the original message for handle2
					await mockOrderingService.waitDropOne();
					// Sequence the doubly-resubmitted message for handle1
					await mockOrderingService.waitSequenceOne();
					// Sequence the resubmitted message for handle2
					await mockOrderingService.waitSequenceOne();

					const handle1 = await handle1P;
					const handle2 = await handle2P;
					if (createBlobPayloadPending) {
						await ensureBlobsShared([handle1, handle2]);
					}
					assert(isFluidHandlePayloadPending(handle1));
					assert(isFluidHandlePayloadPending(handle2));
					assert.strictEqual(handle1.payloadState, "shared", "Payload should be shared");
					assert.strictEqual(handle2.payloadState, "shared", "Payload should be shared");

					const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
					assert.strictEqual(ids?.length, 2);
					assert.strictEqual(redirectTable?.length, 2);
				});
			});

			describe("Abort", () => {
				it("Can abort before blob upload", async function () {
					if (createBlobPayloadPending) {
						// Blob creation with pending payload doesn't support abort
						this.skip();
					}
					const { blobManager } = createTestMaterial({ createBlobPayloadPending });
					const ac = new AbortController();
					ac.abort("abort test");
					await assert.rejects(blobManager.createBlob(textToBlob("hello"), ac.signal), {
						message: "uploadBlob aborted",
						uploadTime: undefined,
						acked: undefined,
					});
					const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
					assert.strictEqual(ids, undefined);
					assert.strictEqual(redirectTable, undefined);
				});

				it("Can abort during blob upload", async function () {
					if (createBlobPayloadPending) {
						// Blob creation with pending payload doesn't support abort
						this.skip();
					}
					const { mockBlobStorage, blobManager } = createTestMaterial({
						createBlobPayloadPending,
					});
					mockBlobStorage.pause();
					const ac = new AbortController();
					const createP = blobManager.createBlob(textToBlob("hello"), ac.signal);
					ac.abort("abort test");
					await assert.rejects(createP, {
						message: "uploadBlob aborted",
						uploadTime: undefined,
						acked: false,
					});
					const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
					assert.strictEqual(ids, undefined);
					assert.strictEqual(redirectTable, undefined);
				});

				it("Can abort before failed blob upload", async function () {
					if (createBlobPayloadPending) {
						// Blob creation with pending payload doesn't support abort
						this.skip();
					}
					const { mockBlobStorage, blobManager } = createTestMaterial({
						createBlobPayloadPending,
					});
					mockBlobStorage.pause();
					const ac = new AbortController();
					const createP = blobManager.createBlob(textToBlob("hello"), ac.signal);
					const createP2 = blobManager.createBlob(textToBlob("world"));
					ac.abort("abort test");
					await assert.rejects(createP, {
						message: "uploadBlob aborted",
						uploadTime: undefined,
						acked: false,
					});
					await mockBlobStorage.waitProcessOne({ error: new Error("fake driver error") });
					await mockBlobStorage.waitProcessOne({ error: new Error("fake driver error") });
					await assert.rejects(createP2, {
						message: "fake driver error",
					});
					const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
					assert.strictEqual(ids, undefined);
					assert.strictEqual(redirectTable, undefined);
				});

				it("Can abort while blob attach op is in flight", async function () {
					if (createBlobPayloadPending) {
						// Blob creation with pending payload doesn't support abort
						this.skip();
					}
					const { mockOrderingService, blobManager } = createTestMaterial({
						createBlobPayloadPending,
					});
					mockOrderingService.pause();
					const ac = new AbortController();
					const createP = blobManager.createBlob(textToBlob("hello"), ac.signal);
					// Wait for the op to be sent
					await new Promise<void>((resolve) => {
						if (mockOrderingService.messagesReceived !== 1) {
							const onOpReceived = () => {
								if (mockOrderingService.messagesReceived === 1) {
									resolve();
									mockOrderingService.events.off("opReceived", onOpReceived);
								}
							};
							mockOrderingService.events.on("opReceived", onOpReceived);
						}
					});
					ac.abort("abort test");
					await assert.rejects(createP, (error) => {
						assert.strictEqual((error as Error).message, "uploadBlob aborted");
						// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
						assert.strictEqual(typeof (error as any).uploadTime, "number");
						// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
						assert.strictEqual((error as any).acked, false);
						return true;
					});

					// Also verify that BlobManager doesn't resubmit the op for an already-aborted blob
					await mockOrderingService.waitDropOne();
					// TODO: Today we still resubmit the attach op even after abort, but probably shouldn't.
					// This also means that only the local client will believe the snapshot is empty, other clients will have added
					// the blob to their snapshot after seeing the resubmitted attach op.
					// assert.strictEqual(
					// 	mockOrderingService.messagesReceived,
					// 	1,
					// 	"Shouldn't have sent more ops",
					// );

					const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
					assert.strictEqual(ids, undefined);
					assert.strictEqual(redirectTable, undefined);
				});

				it("Abort does nothing after blob creation succeeds", async function () {
					if (createBlobPayloadPending) {
						// Blob creation with pending payload doesn't support abort
						this.skip();
					}
					const { blobManager } = createTestMaterial({ createBlobPayloadPending });
					const ac = new AbortController();
					await blobManager.createBlob(textToBlob("hello"), ac.signal);
					ac.abort("abort test");
					const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
					assert.strictEqual(ids?.length, 1);
					assert.strictEqual(redirectTable?.length, 1);
				});
			});

			describe("getPendingBlobs", () => {});
		});

		// #region Summaries
		describe("Summaries", () => {
			describe("Generating summaries", () => {
				it("Empty summary", () => {
					const { blobManager } = createTestMaterial({ createBlobPayloadPending });

					const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
					assert.strictEqual(ids, undefined, "Shouldn't have ids for empty summary");
					assert.strictEqual(
						redirectTable,
						undefined,
						"Shouldn't have redirectTable for empty summary",
					);
				});

				it("Detached, non-dedupe storage", async () => {
					const { blobManager } = createTestMaterial({
						attached: false,
						createBlobPayloadPending,
					});

					await blobManager.createBlob(textToBlob("hello"));
					await blobManager.createBlob(textToBlob("world"));
					await blobManager.createBlob(textToBlob("world"));
					// Note that this summary is not generated in normal usage, it's just a means to
					// validate what is being put into the detached storage. In normal use we'd see
					// a BlobManager.patchRedirectTable() call before being asked to produce a summary.
					const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
					assert.strictEqual(ids?.length, 3);
					assert.strictEqual(redirectTable?.length, 3);
				});

				it("Attached, dedupe storage", async () => {
					const { blobManager } = createTestMaterial({
						createBlobPayloadPending,
					});

					const handle1 = await blobManager.createBlob(textToBlob("hello"));
					const handle2 = await blobManager.createBlob(textToBlob("world"));
					const handle3 = await blobManager.createBlob(textToBlob("world"));
					// Ensure the blobs are attached so they are included in the summary.
					if (createBlobPayloadPending) {
						await ensureBlobsShared([handle1, handle2, handle3]);
					}
					const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
					assert.strictEqual(ids?.length, 2);
					assert.strictEqual(redirectTable?.length, 3);
				});

				it("Detached -> attached, deduping after attach", async () => {
					const { mockBlobStorage, mockRuntime, blobManager } = createTestMaterial({
						attached: false,
						createBlobPayloadPending,
					});

					await blobManager.createBlob(textToBlob("hello"));
					await blobManager.createBlob(textToBlob("world"));
					await blobManager.createBlob(textToBlob("world"));
					await simulateAttach(mockBlobStorage, mockRuntime, blobManager);
					const { ids: ids1, redirectTable: redirectTable1 } =
						getSummaryContentsWithFormatValidation(blobManager);
					// As attach uploads the non-deduped blobs to the deduping storage, the duplicate
					// "world" will remain in the redirectTable (since it has a unique localId), but
					// its attachment will be deduplicated.
					assert.strictEqual(ids1?.length, 2);
					assert.strictEqual(redirectTable1?.length, 3);

					const handle1 = await blobManager.createBlob(textToBlob("hello"));
					const handle2 = await blobManager.createBlob(textToBlob("world"));
					const handle3 = await blobManager.createBlob(textToBlob("another"));
					const handle4 = await blobManager.createBlob(textToBlob("another"));
					// Ensure the blobs are attached so they are included in the summary.
					if (createBlobPayloadPending) {
						await ensureBlobsShared([handle1, handle2, handle3, handle4]);
					}
					const { ids: ids2, redirectTable: redirectTable2 } =
						getSummaryContentsWithFormatValidation(blobManager);
					assert.strictEqual(ids2?.length, 3);
					assert.strictEqual(redirectTable2?.length, 7);
				});
			});

			describe("Loading from summaries", () => {
				it("Can load from a summary and retrieve its blobs", async () => {
					const { mockBlobStorage, mockOrderingService, blobManager } = createTestMaterial({
						createBlobPayloadPending,
					});
					const handle1 = await blobManager.createBlob(textToBlob("hello"));
					const handle2 = await blobManager.createBlob(textToBlob("world"));
					const { localId: localId1 } = unpackHandle(handle1);
					const { localId: localId2 } = unpackHandle(handle2);
					if (createBlobPayloadPending) {
						await ensureBlobsShared([handle1, handle2]);
					}
					const blobManagerLoadInfo: IBlobManagerLoadInfo =
						getSummaryContentsWithFormatValidation(blobManager);
					const { ids: ids1, redirectTable: redirectTable1 } = blobManagerLoadInfo;

					const { blobManager: blobManager2 } = createTestMaterial({
						mockBlobStorage,
						mockOrderingService,
						blobManagerLoadInfo,
						createBlobPayloadPending,
					});

					assert(blobManager2.hasBlob(localId1));
					assert(blobManager2.hasBlob(localId2));
					const blob1FromManager2 = await blobManager2.getBlob(
						localId1,
						createBlobPayloadPending,
					);
					assert.strictEqual(blobToText(blob1FromManager2), "hello", "Blob content mismatch");
					const blob2FromManager2 = await blobManager2.getBlob(
						localId2,
						createBlobPayloadPending,
					);
					assert.strictEqual(blobToText(blob2FromManager2), "world", "Blob content mismatch");

					// Verify that resummarizing gives the same results
					const { ids: ids2, redirectTable: redirectTable2 } =
						getSummaryContentsWithFormatValidation(blobManager2);
					assert.deepStrictEqual(ids2, ids1, "IDs mismatch");
					assert.deepStrictEqual(redirectTable2, redirectTable1, "Redirect table mismatch");
				});

				it("Can load from a summary with only ids and retrieve blobs using remoteId", async () => {
					const { mockBlobStorage, mockOrderingService, blobManager } = createTestMaterial({
						createBlobPayloadPending,
					});
					const handle = await blobManager.createBlob(textToBlob("hello"));
					if (createBlobPayloadPending) {
						await ensureBlobsShared([handle]);
					}
					// This is stripping out the redirectTable from the summary, to simulate an older
					// BlobManager behavior that blobs created after attach would only be represented in the
					// attachments and not in the redirectTable.
					const blobManagerLoadInfo: IBlobManagerLoadInfo = {
						ids: getSummaryContentsWithFormatValidation(blobManager).ids,
					};
					const remoteId = blobManagerLoadInfo.ids?.[0];
					assert(remoteId !== undefined, "Should have one attachment");

					const { blobManager: blobManager2 } = createTestMaterial({
						mockBlobStorage,
						mockOrderingService,
						blobManagerLoadInfo,
						createBlobPayloadPending,
					});

					// That older behavior made the blob retrievable using its remoteId directly.
					assert(blobManager2.hasBlob(remoteId));
					const blobFromManager2 = await blobManager2.getBlob(
						remoteId,
						createBlobPayloadPending,
					);
					assert.strictEqual(blobToText(blobFromManager2), "hello", "Blob content mismatch");

					// The identity redirectTable entry should be stripped out of the summary, but the
					// attachment should remain.
					const { ids: ids2, redirectTable: redirectTable2 } =
						getSummaryContentsWithFormatValidation(blobManager2);
					assert.strictEqual(ids2?.length, 1);
					assert.strictEqual(redirectTable2, undefined);
				});
			});
		});

		// #region GC
		describe("Garbage collection", () => {
			it("Errors when trying to get a deleted blob", async () => {
				const { mockGarbageCollector, blobManager } = createTestMaterial({
					createBlobPayloadPending,
				});
				const handle = await blobManager.createBlob(textToBlob("hello"));
				if (createBlobPayloadPending) {
					await ensureBlobsShared([handle]);
				}
				const { localId } = unpackHandle(handle);
				mockGarbageCollector.simulateBlobDeletion(getGCNodePathFromLocalId(localId));
				await assert.rejects(blobManager.getBlob(localId, createBlobPayloadPending), {
					message: `Blob was deleted: ${localId}`,
					code: 404,
				});
			});

			it("Deletes unused blobs", async () => {
				const { blobManager } = createTestMaterial({
					createBlobPayloadPending,
				});
				const handle1 = await blobManager.createBlob(textToBlob("hello"));
				const { localId: localId1 } = unpackHandle(handle1);
				if (createBlobPayloadPending) {
					await ensureBlobsShared([handle1]);
				}

				const { ids: ids1, redirectTable: redirectTable1 } =
					getSummaryContentsWithFormatValidation(blobManager);
				assert.strictEqual(ids1?.length, 1);
				assert.strictEqual(redirectTable1?.length, 1);

				blobManager.deleteSweepReadyNodes([getGCNodePathFromLocalId(localId1)]);
				const { ids: ids2, redirectTable: redirectTable2 } =
					getSummaryContentsWithFormatValidation(blobManager);
				assert.strictEqual(ids2, undefined);
				assert.strictEqual(redirectTable2, undefined);
			});

			it("Deletes unused blobs only after all duplicates are deleted", async () => {
				const { blobManager } = createTestMaterial({
					createBlobPayloadPending,
				});
				// These blobs will be deduped against each other
				const handle1 = await blobManager.createBlob(textToBlob("hello"));
				const handle2 = await blobManager.createBlob(textToBlob("hello"));
				const { localId: localId1 } = unpackHandle(handle1);
				const { localId: localId2 } = unpackHandle(handle2);
				if (createBlobPayloadPending) {
					await ensureBlobsShared([handle1, handle2]);
				}

				const { ids: ids1, redirectTable: redirectTable1 } =
					getSummaryContentsWithFormatValidation(blobManager);
				assert.strictEqual(ids1?.length, 1);
				assert.strictEqual(redirectTable1?.length, 2);

				blobManager.deleteSweepReadyNodes([getGCNodePathFromLocalId(localId1)]);
				const { ids: ids2, redirectTable: redirectTable2 } =
					getSummaryContentsWithFormatValidation(blobManager);
				assert.strictEqual(ids2?.length, 1);
				assert.strictEqual(redirectTable2?.length, 1);

				blobManager.deleteSweepReadyNodes([getGCNodePathFromLocalId(localId2)]);
				const { ids: ids3, redirectTable: redirectTable3 } =
					getSummaryContentsWithFormatValidation(blobManager);
				assert.strictEqual(ids3, undefined);
				assert.strictEqual(redirectTable3, undefined);
			});
		});

		// #region Storage ID lookup
		describe("Storage ID lookup", () => {
			it("lookupTemporaryBlobStorageId returns correct storage ID for attached blobs", async () => {
				const { blobManager } = createTestMaterial({
					createBlobPayloadPending,
				});
				const handle = await blobManager.createBlob(textToBlob("hello"));
				await ensureBlobsShared([handle]);
				const { localId } = unpackHandle(handle);
				const { ids } = getSummaryContentsWithFormatValidation(blobManager);
				const expectedStorageId = ids?.[0];
				assert(expectedStorageId !== undefined, "Storage id not found in summary");
				const foundStorageId = blobManager.lookupTemporaryBlobStorageId(localId);
				assert.strictEqual(
					foundStorageId,
					expectedStorageId,
					"Storage ID should match expected value",
				);
			});

			it("lookupTemporaryBlobStorageId returns undefined for pending blobs", async function () {
				if (!createBlobPayloadPending) {
					// This test only applies when payload pending is enabled
					this.skip();
				}
				const { mockBlobStorage, mockOrderingService, blobManager } = createTestMaterial({
					createBlobPayloadPending,
				});
				// Pause blob storage and ordering service so the upload will remain pending
				mockBlobStorage.pause();
				mockOrderingService.pause();

				// Create a blob and attach the handle to start the upload attempt
				const handle = await blobManager.createBlob(textToBlob("hello"));
				attachHandle(handle);

				const { localId } = unpackHandle(handle);

				// The blob upload should be pending, so lookupTemporaryBlobStorageId should return undefined
				const storageId1 = blobManager.lookupTemporaryBlobStorageId(localId);
				assert.strictEqual(
					storageId1,
					undefined,
					"Storage ID should be undefined while blob upload pending",
				);

				// Allow just the blob upload to process, but not the attach op
				await mockBlobStorage.waitProcessOne();
				const storageId2 = blobManager.lookupTemporaryBlobStorageId(localId);
				assert.strictEqual(
					storageId2,
					undefined,
					"Storage ID should be undefined while blob attach op pending",
				);

				// Now allow the attach op to be sequenced
				await mockOrderingService.waitSequenceOne();
				await ensureBlobsShared([handle]);
				const storageIdAfterProcessing = blobManager.lookupTemporaryBlobStorageId(localId);
				assert(
					storageIdAfterProcessing !== undefined,
					"Storage ID should be found after processing",
				);
			});

			it("lookupTemporaryBlobStorageId returns undefined for unknown blob ID", () => {
				const { blobManager } = createTestMaterial({
					createBlobPayloadPending,
				});
				const unknownId = "unknown-blob-id";
				const storageId = blobManager.lookupTemporaryBlobStorageId(unknownId);
				assert.strictEqual(
					storageId,
					undefined,
					"Storage ID should be undefined for unknown blob ID",
				);
			});
		});
	});
}
