/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import type { ISequencedMessageEnvelope } from "@fluidframework/runtime-definitions/internal";
import {
	isFluidHandlePayloadPending,
	isLocalFluidHandle,
} from "@fluidframework/runtime-utils/internal";
import { LoggingError } from "@fluidframework/telemetry-utils/internal";

import type { IBlobManagerLoadInfo } from "../../blobManager/index.js";

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
	describe.only(`BlobManager (pending payloads): ${createBlobPayloadPending}`, () => {
		// #region Detached usage
		describe("Detached usage", () => {
			it("Responds as expected for retrieving unknown blob IDs", async () => {
				const { blobManager } = createTestMaterial({ createBlobPayloadPending });
				assert(!blobManager.hasBlob("blobId"));
				await assert.rejects(async () => {
					// Handles for detached blobs are never payload pending, even if the flag is set.
					await blobManager.getBlob("blobId", false);
				});
			});

			it("Can create a blob and retrieve it", async () => {
				const { mockOrderingService, blobManager } = createTestMaterial({
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
					createBlobPayloadPending,
				});
				await simulateAttach(mockBlobStorage, mockRuntime, blobManager);
			});

			it("Can get a detached blob after attaching", async () => {
				const { mockBlobStorage, mockRuntime, blobManager } = createTestMaterial({
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
					const { mockBlobStorage, mockRuntime, blobManager } = createTestMaterial({
						createBlobPayloadPending,
					});
					await simulateAttach(mockBlobStorage, mockRuntime, blobManager);
					assert(!blobManager.hasBlob("blobId"));
					// When payloadPending is false, we throw for unknown blobs
					await assert.rejects(async () => {
						await blobManager.getBlob("blobId", false);
					});

					// When payloadPending is true, we allow the promise to remain pending (waiting
					// for the blob to later arrive)
					const getBlobP = blobManager.getBlob("blobId", true);
					// Simulate the blob being created by some remote client
					const { id: remoteId } = await mockBlobStorage.attachedStorage.createBlob(
						textToBlob("hello"),
					);
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
					const { mockBlobStorage, mockOrderingService, mockRuntime, blobManager } =
						createTestMaterial({ createBlobPayloadPending });
					await simulateAttach(mockBlobStorage, mockRuntime, blobManager);
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

					assert.strictEqual(
						mockOrderingService.messagesReceived,
						1,
						"Should have sent one message for blob attach",
					);
				});

				it("Can retrieve a blob using its storageId", async () => {
					const { mockBlobStorage, mockOrderingService, mockRuntime, blobManager } =
						createTestMaterial({ createBlobPayloadPending });
					await simulateAttach(mockBlobStorage, mockRuntime, blobManager);
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
					const mockBlobStorage = new MockStorageAdapter();
					mockBlobStorage.readBlob = async () => {
						throw new Error("BOOM!");
					};
					const { mockLogger, mockRuntime, blobManager } = createTestMaterial({
						mockBlobStorage,
						createBlobPayloadPending,
					});
					await simulateAttach(mockBlobStorage, mockRuntime, blobManager);

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
					const { mockBlobStorage, mockRuntime, blobManager } = createTestMaterial({
						createBlobPayloadPending,
					});
					await simulateAttach(mockBlobStorage, mockRuntime, blobManager);
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
						await mockBlobStorage.attachedStorage.waitProcessOne(
							new LoggingError("fake driver error"),
						);
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
						await mockBlobStorage.attachedStorage.waitProcessOne(
							new LoggingError("fake driver error"),
						);
						mockBlobStorage.unpause();

						await assert.rejects(createBlobP, { message: "fake driver error" });
					}

					const { ids, redirectTable } = getSummaryContentsWithFormatValidation(blobManager);
					assert.strictEqual(ids, undefined);
					assert.strictEqual(redirectTable, undefined);
				});
			});

			describe("Blobs from remote clients", () => {
				it("Can retrieve blobs uploaded by a remote client", async () => {
					const { mockBlobStorage, mockOrderingService, mockRuntime, blobManager } =
						createTestMaterial({ createBlobPayloadPending });
					await simulateAttach(mockBlobStorage, mockRuntime, blobManager);
					const { mockRuntime: mockRuntime2, blobManager: blobManager2 } = createTestMaterial({
						mockBlobStorage,
						mockOrderingService,
						createBlobPayloadPending,
					});
					mockRuntime2.attachState = AttachState.Attached;

					const handle = await blobManager2.createBlob(textToBlob("hello"));
					const { localId } = unpackHandle(handle);
					if (createBlobPayloadPending) {
						await ensureBlobsShared([handle]);
					}

					assert(blobManager.hasBlob(localId));
					const blobFromManager = await blobManager.getBlob(localId, createBlobPayloadPending);
					assert.strictEqual(blobToText(blobFromManager), "hello", "Blob content mismatch");

					// Also confirm we can request payloadPending blobs before the blobManager has them,
					// and wait for them to arrive.
					if (createBlobPayloadPending) {
						const handle2 = await blobManager2.createBlob(textToBlob("world"));
						const { localId: localId2 } = unpackHandle(handle2);
						attachHandle(handle2);

						assert(!blobManager.hasBlob(localId2));
						await ensureBlobsShared([handle2]);
						assert(blobManager.hasBlob(localId2));

						const blob2FromManager = await blobManager.getBlob(
							localId2,
							createBlobPayloadPending,
						);
						assert.strictEqual(blobToText(blob2FromManager), "world", "Blob content mismatch");
					}
				});

				it("Handles deduping against a remote blob", async () => {
					const { mockBlobStorage, mockOrderingService, mockRuntime, blobManager } =
						createTestMaterial({ createBlobPayloadPending });
					await simulateAttach(mockBlobStorage, mockRuntime, blobManager);
					const { mockRuntime: mockRuntime2, blobManager: blobManager2 } = createTestMaterial({
						mockBlobStorage,
						mockOrderingService,
						createBlobPayloadPending,
					});
					mockRuntime2.attachState = AttachState.Attached;

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
					const { mockBlobStorage, mockOrderingService, mockRuntime, blobManager } =
						createTestMaterial({ createBlobPayloadPending });
					await simulateAttach(mockBlobStorage, mockRuntime, blobManager);
					const { mockRuntime: mockRuntime2, blobManager: blobManager2 } = createTestMaterial({
						mockBlobStorage,
						mockOrderingService,
						createBlobPayloadPending,
					});
					mockRuntime2.attachState = AttachState.Attached;

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
					const { mockBlobStorage, mockOrderingService, mockRuntime, blobManager } =
						createTestMaterial({ createBlobPayloadPending });
					await simulateAttach(mockBlobStorage, mockRuntime, blobManager);

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
					const { mockBlobStorage, mockOrderingService, mockRuntime, blobManager } =
						createTestMaterial({ createBlobPayloadPending });
					await simulateAttach(mockBlobStorage, mockRuntime, blobManager);

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

			describe("Failure", () => {});

			describe("Abort", () => {});

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
					const { blobManager } = createTestMaterial({ createBlobPayloadPending });

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
					const { mockBlobStorage, mockRuntime, blobManager } = createTestMaterial({
						createBlobPayloadPending,
					});
					await simulateAttach(mockBlobStorage, mockRuntime, blobManager);

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

			// TODO: Default to attached storage, make the adapter be the opt-in
			describe("Loading from summaries", () => {
				it("Can load from a summary and retrieve its blobs", async () => {
					const { mockBlobStorage, mockOrderingService, mockRuntime, blobManager } =
						createTestMaterial({ createBlobPayloadPending });
					await simulateAttach(mockBlobStorage, mockRuntime, blobManager);
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

					const { mockRuntime: mockRuntime2, blobManager: blobManager2 } = createTestMaterial({
						mockBlobStorage,
						mockOrderingService,
						blobManagerLoadInfo,
						createBlobPayloadPending,
					});
					mockRuntime2.attachState = AttachState.Attached;

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
					const { mockBlobStorage, mockOrderingService, mockRuntime, blobManager } =
						createTestMaterial({ createBlobPayloadPending });
					await simulateAttach(mockBlobStorage, mockRuntime, blobManager);
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

					const { mockRuntime: mockRuntime2, blobManager: blobManager2 } = createTestMaterial({
						mockBlobStorage,
						mockOrderingService,
						blobManagerLoadInfo,
						createBlobPayloadPending,
					});
					mockRuntime2.attachState = AttachState.Attached;

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
		describe("Garbage collection", () => {});

		// #region Storage ID lookup
		describe("Storage ID lookup", () => {
			it("lookupTemporaryBlobStorageId returns correct storage ID for attached blobs", async () => {
				const { mockBlobStorage, mockRuntime, blobManager } = createTestMaterial({
					createBlobPayloadPending,
				});
				await simulateAttach(mockBlobStorage, mockRuntime, blobManager);
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

			it("lookupTemporaryBlobStorageId returns undefined for pending blobs", async () => {
				if (!createBlobPayloadPending) {
					// This test only applies when payload pending is enabled
					return;
				}
				const { mockBlobStorage, mockOrderingService, mockRuntime, blobManager } =
					createTestMaterial({ createBlobPayloadPending });
				await simulateAttach(mockBlobStorage, mockRuntime, blobManager);
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
				await mockBlobStorage.attachedStorage.waitProcessOne();
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

			it("lookupTemporaryBlobStorageId returns undefined for unknown blob ID", async () => {
				const { mockBlobStorage, mockRuntime, blobManager } = createTestMaterial({
					createBlobPayloadPending,
				});
				await simulateAttach(mockBlobStorage, mockRuntime, blobManager);
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

// #region OLD

// for (const createBlobPayloadPending of [false, true]) {
// 	describe(`BlobManager (pending payloads): ${createBlobPayloadPending}`, () => {
// 		const mockLogger = new MockLogger();
// 		let runtime: MockRuntime;
// 		let createBlob: (blob: ArrayBufferLike, signal?: AbortSignal) => Promise<void>;
// 		let waitForBlob: (blob: ArrayBufferLike) => Promise<void>;
// 		let mc: MonitoringContext;
// 		let injectedSettings: Record<string, ConfigTypes> = {};

// 		beforeEach(() => {
// 			const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
// 				getRawConfig: (name: string): ConfigTypes => settings[name],
// 			});
// 			mc = mixinMonitoringContext(
// 				createChildLogger({ logger: mockLogger }),
// 				configProvider(injectedSettings),
// 			);
// 			runtime = new MockRuntime(mc, createBlobPayloadPending);

// 			// ensures this blob will be processed next time runtime.processBlobs() is called
// 			waitForBlob = async (blob) => {
// 				if (!runtime.unprocessedBlobs.has(blob)) {
// 					await new Promise<void>((resolve) =>
// 						runtime.on("blob", () => {
// 							if (runtime.unprocessedBlobs.has(blob)) {
// 								resolve();
// 							}
// 						}),
// 					);
// 				}
// 			};

// 			// create blob and await the handle after the test
// 			createBlob = async (blob: ArrayBufferLike, signal?: AbortSignal) => {
// 				runtime
// 					.createBlob(blob, signal)
// 					.then((handle) => {
// 						if (createBlobPayloadPending) {
// 							handle.attachGraph();
// 						}
// 						return handle;
// 					})
// 					// Suppress errors here, we expect them to be detected elsewhere
// 					.catch(() => {});
// 				await waitForBlob(blob);
// 			};

// 			const onNoPendingBlobs = () => {
// 				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- Accessing private property
// 				assert((runtime.blobManager as any).pendingBlobs.size === 0);
// 			};

// 			runtime.blobManager.events.on("noPendingBlobs", () => onNoPendingBlobs());
// 		});

// 		afterEach(async () => {
// 			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- Accessing private property
// 			assert.strictEqual((runtime.blobManager as any).pendingBlobs.size, 0);
// 			injectedSettings = {};
// 			mockLogger.clear();
// 		});

// 		it("reupload blob if expired", async () => {
// 			await runtime.attach();
// 			await runtime.connect();
// 			// TODO: Fix this violation and remove the disable
// 			// eslint-disable-next-line require-atomic-updates
// 			runtime.attachedStorage.minTTL = 0.001; // force expired TTL being less than connection time (50ms)
// 			await createBlob(textToBlob("blob"));
// 			await runtime.processBlobs(true);
// 			runtime.disconnect();
// 			await new Promise<void>((resolve) => setTimeout(resolve, 50));
// 			await runtime.connect();
// 			await runtime.processAll();
// 		});

// 		describe("Abort Signal", () => {
// 			it("abort before upload", async function () {
// 				if (createBlobPayloadPending) {
// 					// Blob creation with pending payload doesn't support abort
// 					this.skip();
// 				}
// 				await runtime.attach();
// 				await runtime.connect();
// 				const ac = new AbortController();
// 				ac.abort("abort test");
// 				try {
// 					const blob = textToBlob("blob");
// 					await runtime.createBlob(blob, ac.signal);
// 					assert.fail("Should not succeed");

// 					// TODO: better typing
// 					// eslint-disable-next-line @typescript-eslint/no-explicit-any
// 				} catch (error: any) {
// 					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
// 					assert.strictEqual(error.status, undefined);
// 					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
// 					assert.strictEqual(error.uploadTime, undefined);
// 					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
// 					assert.strictEqual(error.acked, undefined);
// 					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
// 					assert.strictEqual(error.message, "uploadBlob aborted");
// 				}
// 				const summaryData = getSummaryContentsWithFormatValidation(runtime.blobManager);
// 				assert.strictEqual(summaryData.ids, undefined);
// 				assert.strictEqual(summaryData.redirectTable, undefined);
// 			});

// 			it("abort while upload", async function () {
// 				if (createBlobPayloadPending) {
// 					// Blob creation with pending payload doesn't support abort
// 					this.skip();
// 				}
// 				await runtime.attach();
// 				await runtime.connect();
// 				const ac = new AbortController();
// 				const blob = textToBlob("blob");
// 				const handleP = runtime.createBlob(blob, ac.signal);
// 				ac.abort("abort test");
// 				assert.strictEqual(runtime.unprocessedBlobs.size, 1);
// 				await runtime.processBlobs(true);
// 				try {
// 					await handleP;
// 					assert.fail("Should not succeed");
// 					// TODO: better typing
// 					// eslint-disable-next-line @typescript-eslint/no-explicit-any
// 				} catch (error: any) {
// 					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
// 					assert.strictEqual(error.uploadTime, undefined);
// 					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
// 					assert.strictEqual(error.acked, false);
// 					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
// 					assert.strictEqual(error.message, "uploadBlob aborted");
// 				}
// 				assert(handleP);
// 				await assert.rejects(handleP);
// 				const summaryData = getSummaryContentsWithFormatValidation(runtime.blobManager);
// 				assert.strictEqual(summaryData.ids, undefined);
// 				assert.strictEqual(summaryData.redirectTable, undefined);
// 			});

// 			it("abort while failed upload", async function () {
// 				if (createBlobPayloadPending) {
// 					// Blob creation with pending payload doesn't support abort
// 					this.skip();
// 				}
// 				await runtime.attach();
// 				await runtime.connect();
// 				const ac = new AbortController();
// 				const blob = textToBlob("blob");
// 				const handleP = runtime.createBlob(blob, ac.signal);
// 				const handleP2 = runtime.createBlob(textToBlob("blob2"));
// 				ac.abort("abort test");
// 				assert.strictEqual(runtime.unprocessedBlobs.size, 2);
// 				await runtime.processBlobs(false);
// 				try {
// 					await handleP;
// 					assert.fail("Should not succeed");
// 				} catch (error: unknown) {
// 					assert.strictEqual((error as Error).message, "uploadBlob aborted");
// 				}
// 				try {
// 					await handleP2;
// 					assert.fail("Should not succeed");
// 				} catch (error: unknown) {
// 					assert.strictEqual((error as Error).message, "fake driver error");
// 				}
// 				await assert.rejects(handleP);
// 				await assert.rejects(handleP2);
// 				const summaryData = getSummaryContentsWithFormatValidation(runtime.blobManager);
// 				assert.strictEqual(summaryData.ids, undefined);
// 				assert.strictEqual(summaryData.redirectTable, undefined);
// 			});

// 			it("abort while disconnected", async function () {
// 				if (createBlobPayloadPending) {
// 					// Blob creation with pending payload doesn't support abort
// 					this.skip();
// 				}
// 				await runtime.attach();
// 				await runtime.connect();
// 				const ac = new AbortController();
// 				const blob = textToBlob("blob");
// 				const handleP = runtime.createBlob(blob, ac.signal);
// 				runtime.disconnect();
// 				ac.abort();
// 				await runtime.processBlobs(true);
// 				try {
// 					await handleP;
// 					assert.fail("Should not succeed");
// 				} catch (error: unknown) {
// 					assert.strictEqual((error as Error).message, "uploadBlob aborted");
// 				}
// 				await assert.rejects(handleP);
// 				const summaryData = getSummaryContentsWithFormatValidation(runtime.blobManager);
// 				assert.strictEqual(summaryData.ids, undefined);
// 				assert.strictEqual(summaryData.redirectTable, undefined);
// 			});

// 			it("abort after blob succeeds", async function () {
// 				if (createBlobPayloadPending) {
// 					// Blob creation with pending payload doesn't support abort
// 					this.skip();
// 				}
// 				await runtime.attach();
// 				await runtime.connect();
// 				const ac = new AbortController();
// 				let handleP: Promise<IFluidHandleInternal<ArrayBufferLike>> | undefined;
// 				try {
// 					const blob = textToBlob("blob");
// 					handleP = runtime.createBlob(blob, ac.signal);
// 					await runtime.processAll();
// 					ac.abort();
// 				} catch {
// 					assert.fail("abort after processing should not throw");
// 				}
// 				assert(handleP);
// 				await assert.doesNotReject(handleP);
// 				const summaryData = getSummaryContentsWithFormatValidation(runtime.blobManager);
// 				assert.strictEqual(summaryData.ids?.length, 1);
// 				assert.strictEqual(summaryData.redirectTable?.length, 1);
// 			});

// 			it("abort while waiting for op", async function () {
// 				if (createBlobPayloadPending) {
// 					// Blob creation with pending payload doesn't support abort
// 					this.skip();
// 				}
// 				await runtime.attach();
// 				await runtime.connect();
// 				const ac = new AbortController();
// 				const blob = textToBlob("blob");
// 				const handleP = runtime.createBlob(blob, ac.signal);
// 				const p1 = runtime.processBlobs(true);
// 				const p2 = runtime.processHandles();
// 				// finish upload
// 				await Promise.race([p1, p2]);
// 				ac.abort();
// 				runtime.processOps();
// 				try {
// 					// finish op
// 					await handleP;
// 					assert.fail("Should not succeed");

// 					// TODO: better typing
// 					// eslint-disable-next-line @typescript-eslint/no-explicit-any
// 				} catch (error: any) {
// 					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
// 					assert.strictEqual(error.message, "uploadBlob aborted");
// 					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
// 					assert.ok(error.uploadTime);
// 					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
// 					assert.strictEqual(error.acked, false);
// 				}
// 				await assert.rejects(handleP);
// 				const summaryData = getSummaryContentsWithFormatValidation(runtime.blobManager);
// 				assert.strictEqual(summaryData.ids, undefined);
// 				assert.strictEqual(summaryData.redirectTable, undefined);
// 			});

// 			it("resubmit on aborted pending op", async function () {
// 				if (createBlobPayloadPending) {
// 					// Blob creation with pending payload doesn't support abort
// 					this.skip();
// 				}
// 				await runtime.attach();
// 				await runtime.connect();
// 				const ac = new AbortController();
// 				let handleP: Promise<IFluidHandleInternal<ArrayBufferLike>> | undefined;
// 				try {
// 					handleP = runtime.createBlob(textToBlob("blob"), ac.signal);
// 					const p1 = runtime.processBlobs(true);
// 					const p2 = runtime.processHandles();
// 					// finish upload
// 					await Promise.race([p1, p2]);
// 					runtime.disconnect();
// 					ac.abort();
// 					await handleP;
// 					assert.fail("Should not succeed");
// 					// TODO: better typing
// 					// eslint-disable-next-line @typescript-eslint/no-explicit-any
// 				} catch (error: any) {
// 					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
// 					assert.strictEqual(error.message, "uploadBlob aborted");
// 					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
// 					assert.ok(error.uploadTime);
// 					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
// 					assert.strictEqual(error.acked, false);
// 				}
// 				await runtime.connect();
// 				runtime.processOps();

// 				// TODO: `handleP` can be `undefined`; this should be made safer.
// 				await assert.rejects(handleP as Promise<IFluidHandleInternal<ArrayBufferLike>>);
// 				const summaryData = getSummaryContentsWithFormatValidation(runtime.blobManager);
// 				assert.strictEqual(summaryData.ids, undefined);
// 				assert.strictEqual(summaryData.redirectTable, undefined);
// 			});
// 		});

// 		describe("Garbage Collection", () => {
// 			let redirectTable: Map<string, string>;

// 			/**
// 			 * Creates a blob with the given content and returns its local and storage id.
// 			 */
// 			async function createBlobAndGetIds(content: string) {
// 				// For a given blob's id, returns the GC node id.
// 				const getGCNodeIdFromBlobId = (blobId: string) => {
// 					return `/${blobManagerBasePath}/${blobId}`;
// 				};

// 				const blobContents = textToBlob(content);
// 				const handleP = runtime.createBlob(blobContents);
// 				await runtime.processAll();

// 				const blobHandle = await handleP;
// 				const { localId } = unpackHandle(blobHandle);
// 				assert(redirectTable.has(localId), "blob not found in redirect table");
// 				const storageId = redirectTable.get(localId);
// 				assert(storageId !== undefined, "storage id not found in redirect table");
// 				return {
// 					localId,
// 					localGCNodeId: getGCNodeIdFromBlobId(localId),
// 					storageId,
// 					storageGCNodeId: getGCNodeIdFromBlobId(storageId),
// 				};
// 			}

// 			beforeEach(() => {
// 				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- Mutating private property
// 				redirectTable = (runtime.blobManager as any).redirectTable;
// 			});

// 			it("fetching deleted blob fails", async () => {
// 				await runtime.attach();
// 				await runtime.connect();
// 				const blob1Contents = textToBlob("blob1");
// 				const blob2Contents = textToBlob("blob2");
// 				const handle1P = runtime.createBlob(blob1Contents);
// 				const handle2P = runtime.createBlob(blob2Contents);
// 				await runtime.processAll();

// 				const blob1Handle = await handle1P;
// 				const blob2Handle = await handle2P;

// 				// Validate that the blobs can be retrieved.
// 				assert.strictEqual(await runtime.getBlob(blob1Handle), blob1Contents);
// 				assert.strictEqual(await runtime.getBlob(blob2Handle), blob2Contents);

// 				// Delete blob1. Retrieving it should result in an error.
// 				runtime.deleteBlob(blob1Handle);
// 				await assert.rejects(
// 					async () => runtime.getBlob(blob1Handle),
// 					(error: IErrorBase & { code: number | undefined }) => {
// 						const blob1Id = blob1Handle.absolutePath.split("/")[2];
// 						const correctErrorType = error.code === 404;
// 						const correctErrorMessage = error.message === `Blob was deleted: ${blob1Id}`;
// 						return correctErrorType && correctErrorMessage;
// 					},
// 					"Deleted blob2 fetch should have failed",
// 				);

// 				// Delete blob2. Retrieving it should result in an error.
// 				runtime.deleteBlob(blob2Handle);
// 				await assert.rejects(
// 					async () => runtime.getBlob(blob2Handle),
// 					(error: IErrorBase & { code: number | undefined }) => {
// 						const blob2Id = blob2Handle.absolutePath.split("/")[2];
// 						const correctErrorType = error.code === 404;
// 						const correctErrorMessage = error.message === `Blob was deleted: ${blob2Id}`;
// 						return correctErrorType && correctErrorMessage;
// 					},
// 					"Deleted blob2 fetch should have failed",
// 				);
// 			});

// 			// Support for this config has been removed.
// 			const legacyKey_disableAttachmentBlobSweep =
// 				"Fluid.GarbageCollection.DisableAttachmentBlobSweep";
// 			for (const disableAttachmentBlobsSweep of [true, undefined])
// 				it(`deletes unused blobs regardless of DisableAttachmentBlobsSweep setting [DisableAttachmentBlobsSweep=${disableAttachmentBlobsSweep}]`, async () => {
// 					injectedSettings[legacyKey_disableAttachmentBlobSweep] = disableAttachmentBlobsSweep;

// 					await runtime.attach();
// 					await runtime.connect();

// 					const blob1 = await createBlobAndGetIds("blob1");
// 					const blob2 = await createBlobAndGetIds("blob2");

// 					// Delete blob1's local id. The local id and the storage id should both be deleted from the redirect table
// 					// since the blob only had one reference.
// 					runtime.blobManager.deleteSweepReadyNodes([blob1.localGCNodeId]);
// 					assert(!redirectTable.has(blob1.localId));
// 					assert(!redirectTable.has(blob1.storageId));

// 					// Delete blob2's local id. The local id and the storage id should both be deleted from the redirect table
// 					// since the blob only had one reference.
// 					runtime.blobManager.deleteSweepReadyNodes([blob2.localGCNodeId]);
// 					assert(!redirectTable.has(blob2.localId));
// 					assert(!redirectTable.has(blob2.storageId));
// 				});

// 			it("deletes unused de-duped blobs", async () => {
// 				await runtime.attach();
// 				await runtime.connect();

// 				// Create 2 blobs with the same content. They should get de-duped.
// 				const blob1 = await createBlobAndGetIds("blob1");
// 				const blob1Duplicate = await createBlobAndGetIds("blob1");
// 				assert(blob1.storageId === blob1Duplicate.storageId, "blob1 not de-duped");

// 				// Create another 2 blobs with the same content. They should get de-duped.
// 				const blob2 = await createBlobAndGetIds("blob2");
// 				const blob2Duplicate = await createBlobAndGetIds("blob2");
// 				assert(blob2.storageId === blob2Duplicate.storageId, "blob2 not de-duped");

// 				// Delete blob1's local id. The local id should both be deleted from the redirect table but the storage id
// 				// should not because the blob has another referenced from the de-duped blob.
// 				runtime.blobManager.deleteSweepReadyNodes([blob1.localGCNodeId]);
// 				assert(!redirectTable.has(blob1.localId), "blob1 localId should have been deleted");
// 				assert(
// 					redirectTable.has(blob1.storageId),
// 					"blob1 storageId should not have been deleted",
// 				);
// 				// Delete blob1's de-duped local id. The local id and the storage id should both be deleted from the redirect table
// 				// since all the references for the blob are now deleted.
// 				runtime.blobManager.deleteSweepReadyNodes([blob1Duplicate.localGCNodeId]);
// 				assert(
// 					!redirectTable.has(blob1Duplicate.localId),
// 					"blob1Duplicate localId should have been deleted",
// 				);
// 				assert(
// 					!redirectTable.has(blob1.storageId),
// 					"blob1 storageId should have been deleted",
// 				);

// 				// Delete blob2's local id. The local id should both be deleted from the redirect table but the storage id
// 				// should not because the blob has another referenced from the de-duped blob.
// 				runtime.blobManager.deleteSweepReadyNodes([blob2.localGCNodeId]);
// 				assert(!redirectTable.has(blob2.localId), "blob2 localId should have been deleted");
// 				assert(
// 					redirectTable.has(blob2.storageId),
// 					"blob2 storageId should not have been deleted",
// 				);
// 				// Delete blob2's de-duped local id. The local id and the storage id should both be deleted from the redirect table
// 				// since all the references for the blob are now deleted.
// 				runtime.blobManager.deleteSweepReadyNodes([blob2Duplicate.localGCNodeId]);
// 				assert(
// 					!redirectTable.has(blob2Duplicate.localId),
// 					"blob2Duplicate localId should have been deleted",
// 				);
// 				assert(
// 					!redirectTable.has(blob2.storageId),
// 					"blob2 storageId should have been deleted",
// 				);
// 			});
// 		});
// 	});
// }
