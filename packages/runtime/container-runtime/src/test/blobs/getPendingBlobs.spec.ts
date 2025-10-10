/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { bufferToString } from "@fluid-internal/client-utils";

import type { SerializableLocalBlobRecord } from "../../blobManager/index.js";

import {
	attachHandle,
	createTestMaterial,
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
						blob: bufferToString(textToBlob("hello"), "base64"),
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

			// Wait until we are sure the BlobAttach op is pending
			await mockOrderingService.waitOpAvailable();

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
				assert.strictEqual(pendingBlob.blob, bufferToString(textToBlob("hello"), "base64"));
				assert.strictEqual(pendingBlob.storageId, "b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0");
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

		// TODO: Ensure we have both an uploaded with/without expired TTL
		// TODO: Ensure one of the tests has multiple blobs
		// TODO: Add test for repeat calls on single blob manager
		// TODO: Add test for round-tripping through multiple blob managers
		// TODO: Add comments
	});
}
