/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { bufferToString } from "@fluid-internal/client-utils";

import {
	attachHandle,
	blobToText,
	createTestMaterial,
	ensureBlobsShared,
	getSummaryContentsWithFormatValidation,
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
			const pendingBlobs = blobManager1.getPendingBlobs();
			assert.deepStrictEqual(pendingBlobs, {
				[localId]: { state: "localOnly", blob: bufferToString(textToBlob("hello"), "base64") },
			});

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
		});

		// it("shutdown multiple blobs", async () => {
		// 	await runtime.attach();
		// 	await runtime.connect();
		// 	const blob = textToBlob("blob");
		// 	const handleP = runtime.createBlob(blob);
		// 	await runtime.processBlobs(true);
		// 	const blob2 = textToBlob("blob2");
		// 	const handleP2 = runtime.createBlob(blob2);
		// 	const pendingStateP = runtime.getPendingLocalState();
		// 	await runtime.processHandles();
		// 	await assert.doesNotReject(handleP);
		// 	await assert.doesNotReject(handleP2);
		// 	const pendingState = await pendingStateP;
		// 	const pendingBlobs = pendingState[1] ?? {};
		// 	assert.strictEqual(Object.keys(pendingBlobs).length, 2);

		// 	const summaryData = getSummaryContentsWithFormatValidation(runtime.blobManager);
		// 	assert.strictEqual(summaryData.ids?.length, 0);
		// 	assert.strictEqual(summaryData.redirectTable, undefined);

		// 	const runtime2 = new MockRuntime(
		// 		mc,
		// 		false, // createBlobPayloadPending
		// 		summaryData,
		// 		false,
		// 		pendingState,
		// 	);
		// 	await runtime2.attach();
		// 	await runtime2.connect();
		// 	await runtime2.processAll();

		// 	const summaryData2 = getSummaryContentsWithFormatValidation(runtime2.blobManager);
		// 	assert.strictEqual(summaryData2.ids?.length, 2);
		// 	assert.strictEqual(summaryData2.redirectTable?.length, 2);
		// });

		// it("upload blob while getting pending state", async () => {
		// 	await runtime.attach();
		// 	await runtime.connect();
		// 	const blob = textToBlob("blob");
		// 	const handleP = runtime.createBlob(blob);
		// 	await runtime.processBlobs(true);
		// 	const blob2 = textToBlob("blob2");
		// 	const handleP2 = runtime.createBlob(blob2);
		// 	const pendingStateP = runtime.getPendingLocalState();
		// 	await runtime.processHandles();
		// 	const handleP3 = runtime.createBlob(textToBlob("blob3"));
		// 	await runtime.processBlobs(true);
		// 	await runtime.processHandles();
		// 	await assert.doesNotReject(handleP);
		// 	await assert.doesNotReject(handleP2);
		// 	await assert.doesNotReject(handleP3);
		// 	const pendingState = await pendingStateP;
		// 	const pendingBlobs = pendingState[1] ?? {};
		// 	assert.strictEqual(Object.keys(pendingBlobs).length, 3);

		// 	const summaryData = getSummaryContentsWithFormatValidation(runtime.blobManager);
		// 	assert.strictEqual(summaryData.ids?.length, 0);
		// 	assert.strictEqual(summaryData.redirectTable, undefined);

		// 	const runtime2 = new MockRuntime(
		// 		mc,
		// 		false, // createBlobPayloadPending
		// 		summaryData,
		// 		false,
		// 		pendingState,
		// 	);
		// 	await runtime2.attach();
		// 	await runtime2.connect();
		// 	await runtime2.processAll();

		// 	const summaryData2 = getSummaryContentsWithFormatValidation(runtime2.blobManager);
		// 	assert.strictEqual(summaryData2.ids?.length, 3);
		// 	assert.strictEqual(summaryData2.redirectTable?.length, 3);
		// });

		// it("retries blob after being rejected if it was stashed", async () => {
		// 	await runtime.attach();
		// 	await runtime.connect();
		// 	const blob = textToBlob("blob");
		// 	const handleP = runtime.createBlob(blob);
		// 	const pendingStateP = runtime.getPendingLocalState();
		// 	await runtime.processHandles();
		// 	await assert.doesNotReject(handleP);
		// 	const pendingState = await pendingStateP;
		// 	const pendingBlobs = (pendingState[1] ?? {}) as IPendingBlobs;
		// 	assert.strictEqual(Object.keys(pendingBlobs).length, 1);
		// 	assert.strictEqual(Object.values(pendingBlobs)[0].acked, false);
		// 	assert.strictEqual(Object.values(pendingBlobs)[0].uploadTime, undefined);

		// 	const summaryData = getSummaryContentsWithFormatValidation(runtime.blobManager);
		// 	assert.strictEqual(summaryData.ids?.length, 0);
		// 	assert.strictEqual(summaryData.redirectTable, undefined);

		// 	const runtime2 = new MockRuntime(
		// 		mc,
		// 		false, // createBlobPayloadPending
		// 		summaryData,
		// 		false,
		// 		pendingState,
		// 	);
		// 	await runtime2.attach();
		// 	await runtime2.connect(0, true);
		// 	await runtime2.processAll();
		// 	const summaryData2 = getSummaryContentsWithFormatValidation(runtime2.blobManager);
		// 	assert.strictEqual(summaryData2.ids?.length, 1);
		// 	assert.strictEqual(summaryData2.redirectTable?.length, 1);
		// });

		// it("does not restart upload after applying stashed ops if not expired", async () => {
		// 	await runtime.attach();
		// 	await runtime.connect();
		// 	const blob = textToBlob("blob");
		// 	const handleP = runtime.createBlob(blob);
		// 	await runtime.processBlobs(true);
		// 	const pendingStateP = runtime.getPendingLocalState();
		// 	await runtime.processHandles();
		// 	await assert.doesNotReject(handleP);
		// 	const pendingState = await pendingStateP;
		// 	const pendingBlobs = pendingState[1] ?? {};
		// 	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		// 	assert.ok(pendingBlobs[Object.keys(pendingBlobs)[0]].storageId);
		// 	const summaryData = getSummaryContentsWithFormatValidation(runtime.blobManager);

		// 	const runtime2 = new MockRuntime(
		// 		mc,
		// 		false, // createBlobPayloadPending
		// 		summaryData,
		// 		false,
		// 		pendingState,
		// 	);
		// 	await runtime2.attach();
		// 	assert.strictEqual(runtime2.unprocessedBlobs.size, 0);
		// 	await runtime2.connect();
		// 	await runtime2.processAll();

		// 	const summaryData2 = getSummaryContentsWithFormatValidation(runtime2.blobManager);
		// 	assert.strictEqual(summaryData2.ids?.length, 1);
		// 	assert.strictEqual(summaryData2.redirectTable?.length, 1);
		// });

		// it("does restart upload after applying stashed ops if expired", async () => {
		// 	await runtime.attach();
		// 	await runtime.connect();
		// 	// TODO: Fix this violation and remove the disable
		// 	// eslint-disable-next-line require-atomic-updates
		// 	runtime.attachedStorage.minTTL = 0.001;
		// 	const blob = textToBlob("blob");
		// 	const handleP = runtime.createBlob(blob);
		// 	await runtime.processBlobs(true);
		// 	const pendingStateP = runtime.getPendingLocalState();
		// 	await runtime.processHandles();
		// 	await assert.doesNotReject(handleP);
		// 	const pendingState = await pendingStateP;
		// 	const pendingBlobs = pendingState[1] ?? {};
		// 	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		// 	assert.ok(pendingBlobs[Object.keys(pendingBlobs)[0]].storageId);
		// 	const summaryData = getSummaryContentsWithFormatValidation(runtime.blobManager);

		// 	const runtime2 = new MockRuntime(
		// 		mc,
		// 		false, // createBlobPayloadPending
		// 		summaryData,
		// 		false,
		// 		pendingState,
		// 	);
		// 	await runtime2.attach();
		// 	await runtime2.connect();
		// 	await runtime2.processAll();

		// 	const summaryData2 = getSummaryContentsWithFormatValidation(runtime2.blobManager);
		// 	assert.strictEqual(summaryData2.ids?.length, 1);
		// 	assert.strictEqual(summaryData2.redirectTable?.length, 1);
		// });
	});
}
