/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { bufferToString } from "@fluid-internal/client-utils";

import type { SerializableLocalBlobRecord } from "../../blobManager/index.js";

import {
	attachHandle,
	blobToText,
	createTestMaterial,
	ensureBlobsShared,
	getSummaryContentsWithFormatValidation,
	MIN_TTL,
	textToBlob,
	unpackHandle,
	waitHandlePayloadShared,
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
			const {
				mockBlobStorage,
				mockOrderingService,
				blobManager: blobManager1,
			} = createTestMaterial({ createBlobPayloadPending });
			mockBlobStorage.pause();
			const handleP = blobManager1.createBlob(textToBlob("hello"));
			if (!createBlobPayloadPending) {
				assert.strictEqual(blobManager1.getPendingBlobs(), undefined);
				return;
			}

			const handle = await handleP;
			const { localId } = unpackHandle(handle);
			attachHandle(handle);
			const pendingBlobs = blobManager1.getPendingBlobs();
			assert.deepStrictEqual(pendingBlobs, {
				[localId]: { state: "localOnly", blob: bufferToString(textToBlob("hello"), "base64") },
			});

			const { ids: ids1, redirectTable: redirectTable1 } =
				getSummaryContentsWithFormatValidation(blobManager1);
			assert.strictEqual(ids1, undefined);
			assert.strictEqual(redirectTable1, undefined);

			// Error the original upload, so we can be sure that the created blob came from the load with pending blobs.
			await mockBlobStorage.waitProcessOne({ error: new Error("Upload failed") });
			await assert.rejects(waitHandlePayloadShared(handle), { message: "Upload failed" });

			const { blobManager: blobManager2 } = createTestMaterial({
				mockBlobStorage,
				mockOrderingService,
				pendingBlobs,
				createBlobPayloadPending,
			});
			const blobBeforeSharing = await blobManager2.getBlob(localId, createBlobPayloadPending);
			assert.strictEqual(blobToText(blobBeforeSharing), "hello");

			const sharePendingBlobsP = blobManager2.sharePendingBlobs();
			// Let the upload from pending state succeed
			await mockBlobStorage.waitProcessOne();
			await sharePendingBlobsP;
			const blobAfterSharing = await blobManager2.getBlob(localId, createBlobPayloadPending);
			assert.strictEqual(blobToText(blobAfterSharing), "hello");

			const { ids: ids2, redirectTable: redirectTable2 } =
				getSummaryContentsWithFormatValidation(blobManager2);
			assert.strictEqual(ids2?.length, 1);
			assert.strictEqual(redirectTable2?.length, 1);
		});

		it("getPendingBlobs while attaching", async () => {
			const {
				mockBlobStorage,
				mockOrderingService,
				blobManager: blobManager1,
			} = createTestMaterial({ createBlobPayloadPending });
			mockOrderingService.pause();
			const handleP = blobManager1.createBlob(textToBlob("hello"));
			if (!createBlobPayloadPending) {
				assert.strictEqual(blobManager1.getPendingBlobs(), undefined);
				return;
			}

			const handle = await handleP;
			const { localId } = unpackHandle(handle);
			attachHandle(handle);
			await new Promise<void>((resolve) =>
				mockOrderingService.events.on("opReceived", () => resolve()),
			);
			assert.strictEqual(
				mockBlobStorage.blobsProcessed,
				1,
				"Blob should have been uploaded from the original blob manager",
			);

			const pendingBlobs = blobManager1.getPendingBlobs();
			assert(
				pendingBlobs !== undefined && Object.entries(pendingBlobs).length === 1,
				"Expect one pending blob",
			);
			const pendingBlob: SerializableLocalBlobRecord | undefined = pendingBlobs[localId];
			assert(pendingBlob !== undefined, "Expect pending blob with localId");
			assert.strictEqual(pendingBlob.state, "uploaded");
			assert.strictEqual(pendingBlob.blob, bufferToString(textToBlob("hello"), "base64"));
			assert.strictEqual(pendingBlob.storageId, "b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0");
			assert.strictEqual(typeof pendingBlob.uploadTime, "number");
			assert.strictEqual(pendingBlob.minTTLInSeconds, MIN_TTL);

			const { ids: ids1, redirectTable: redirectTable1 } =
				getSummaryContentsWithFormatValidation(blobManager1);
			assert.strictEqual(ids1, undefined);
			assert.strictEqual(redirectTable1, undefined);

			const { blobManager: blobManager2 } = createTestMaterial({
				mockBlobStorage,
				mockOrderingService,
				pendingBlobs,
				createBlobPayloadPending,
			});
			const blobBeforeSharing = await blobManager2.getBlob(localId, createBlobPayloadPending);
			assert.strictEqual(blobToText(blobBeforeSharing), "hello");

			const sharePendingBlobsP = blobManager2.sharePendingBlobs();

			// Drop the original attach op, so we can be sure that the created blob came from the load with pending blobs.
			// Note that the original blob manager will resubmit it, but it will go to the back of the queue after the
			// one from the blob manager created from pending blobs.
			await mockOrderingService.waitDropOne();
			// Sequence the attach op from the load with pending blobs.
			await mockOrderingService.waitSequenceOne();

			await sharePendingBlobsP;
			const blobAfterSharing = await blobManager2.getBlob(localId, createBlobPayloadPending);
			assert.strictEqual(blobToText(blobAfterSharing), "hello");

			const { ids: ids2, redirectTable: redirectTable2 } =
				getSummaryContentsWithFormatValidation(blobManager2);
			assert.strictEqual(ids2?.length, 1);
			assert.strictEqual(redirectTable2?.length, 1);

			// The attach from the blob manager created from pending blobs will have completed the attach on the original
			// blob manager too, even though it has an outstanding attach op.
			await ensureBlobsShared([handle]);

			// In normal cases we don't expect both the original blob manager and the one created from pending blobs to
			// coexist, but we'll make sure that nothing bad happens if they both get their attach op sequenced.
			await mockOrderingService.waitSequenceOne();
			const blobAfterOriginalAttach1 = await blobManager1.getBlob(
				localId,
				createBlobPayloadPending,
			);
			assert.strictEqual(blobToText(blobAfterOriginalAttach1), "hello");
			const blobAfterOriginalAttach2 = await blobManager2.getBlob(
				localId,
				createBlobPayloadPending,
			);
			assert.strictEqual(blobToText(blobAfterOriginalAttach2), "hello");
			const { ids: ids3, redirectTable: redirectTable3 } =
				getSummaryContentsWithFormatValidation(blobManager1);
			assert.strictEqual(ids3?.length, 1);
			assert.strictEqual(redirectTable3?.length, 1);
			const { ids: ids4, redirectTable: redirectTable4 } =
				getSummaryContentsWithFormatValidation(blobManager2);
			assert.strictEqual(ids4?.length, 1);
			assert.strictEqual(redirectTable4?.length, 1);

			// Also verify that the only upload was the one from the original BlobManager.
			assert.strictEqual(
				mockBlobStorage.blobsProcessed,
				1,
				"Should not have reuploaded the blob, it was not expired",
			);
		});

		it("getPendingBlobs while attaching, then reupload after TTL expiry", async () => {
			const {
				mockBlobStorage,
				mockOrderingService,
				blobManager: blobManager1,
			} = createTestMaterial({ createBlobPayloadPending });
			mockOrderingService.pause();
			const handleP = blobManager1.createBlob(textToBlob("hello"));
			if (!createBlobPayloadPending) {
				assert.strictEqual(blobManager1.getPendingBlobs(), undefined);
				return;
			}

			const handle = await handleP;
			const { localId } = unpackHandle(handle);
			attachHandle(handle);
			await new Promise<void>((resolve) =>
				mockOrderingService.events.on("opReceived", () => resolve()),
			);
			assert.strictEqual(
				mockBlobStorage.blobsProcessed,
				1,
				"Blob should have been uploaded from the original blob manager",
			);

			const pendingBlobs = blobManager1.getPendingBlobs();
			assert(
				pendingBlobs !== undefined && Object.entries(pendingBlobs).length === 1,
				"Expect one pending blob",
			);
			const pendingBlob: SerializableLocalBlobRecord | undefined = pendingBlobs[localId];
			assert(pendingBlob !== undefined, "Expect pending blob with localId");
			assert.strictEqual(pendingBlob.state, "uploaded");
			assert.strictEqual(pendingBlob.blob, bufferToString(textToBlob("hello"), "base64"));
			assert.strictEqual(pendingBlob.storageId, "b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0");
			assert.strictEqual(typeof pendingBlob.uploadTime, "number");
			assert.strictEqual(pendingBlob.minTTLInSeconds, MIN_TTL);

			// Tweak the TTL so it appears expired when the new blob manager loads it.
			pendingBlob.minTTLInSeconds = -1;

			const { ids: ids1, redirectTable: redirectTable1 } =
				getSummaryContentsWithFormatValidation(blobManager1);
			assert.strictEqual(ids1, undefined);
			assert.strictEqual(redirectTable1, undefined);

			const { blobManager: blobManager2 } = createTestMaterial({
				mockBlobStorage,
				mockOrderingService,
				pendingBlobs,
				createBlobPayloadPending,
			});
			const blobBeforeSharing = await blobManager2.getBlob(localId, createBlobPayloadPending);
			assert.strictEqual(blobToText(blobBeforeSharing), "hello");

			const sharePendingBlobsP = blobManager2.sharePendingBlobs();
			await new Promise<void>((resolve) =>
				mockOrderingService.events.on("opReceived", () => resolve()),
			);

			// Drop the original attach op, so we can be sure that the created blob came from the load with pending blobs.
			// Note that the original blob manager will resubmit it, but it will go to the back of the queue after the
			// one from the blob manager created from pending blobs.
			await mockOrderingService.waitDropOne();
			// Sequence the attach op from the load with pending blobs.
			await mockOrderingService.waitSequenceOne();

			await sharePendingBlobsP;
			const blobAfterSharing = await blobManager2.getBlob(localId, createBlobPayloadPending);
			assert.strictEqual(blobToText(blobAfterSharing), "hello");

			const { ids: ids2, redirectTable: redirectTable2 } =
				getSummaryContentsWithFormatValidation(blobManager2);
			assert.strictEqual(ids2?.length, 1);
			assert.strictEqual(redirectTable2?.length, 1);

			// The attach from the blob manager created from pending blobs will have completed the attach on the original
			// blob manager too, even though it has an outstanding attach op.
			await ensureBlobsShared([handle]);

			// In normal cases we don't expect both the original blob manager and the one created from pending blobs to
			// coexist, but we'll make sure that nothing bad happens if they both get their attach op sequenced.
			await mockOrderingService.waitSequenceOne();
			const blobAfterOriginalAttach1 = await blobManager1.getBlob(
				localId,
				createBlobPayloadPending,
			);
			assert.strictEqual(blobToText(blobAfterOriginalAttach1), "hello");
			const blobAfterOriginalAttach2 = await blobManager2.getBlob(
				localId,
				createBlobPayloadPending,
			);
			assert.strictEqual(blobToText(blobAfterOriginalAttach2), "hello");
			const { ids: ids3, redirectTable: redirectTable3 } =
				getSummaryContentsWithFormatValidation(blobManager1);
			assert.strictEqual(ids3?.length, 1);
			assert.strictEqual(redirectTable3?.length, 1);
			const { ids: ids4, redirectTable: redirectTable4 } =
				getSummaryContentsWithFormatValidation(blobManager2);
			assert.strictEqual(ids4?.length, 1);
			assert.strictEqual(redirectTable4?.length, 1);

			// Also verify that the second BlobManager did a reupload.
			assert.strictEqual(
				mockBlobStorage.blobsProcessed,
				2,
				"Should have reuploaded the blob, it was expired",
			);
		});

		// TODO: Ensure one of the tests has multiple blobs
		// TODO: Add test for repeat calls on single blob manager
		// TODO: Add test for round-tripping through multiple blob managers
		// TODO: Add comments
	});
}
