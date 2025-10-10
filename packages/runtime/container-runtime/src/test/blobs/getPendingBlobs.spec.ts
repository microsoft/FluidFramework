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
	ensureBlobsShared,
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
			await mockOrderingService.waitOpAvailable();

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
				assert.strictEqual(pendingBlob2.blob, bufferToString(textToBlob("world"), "base64"));
				assert.strictEqual(pendingBlob2.storageId, "04fea06420ca60892f73becee3614f6d023a4b7f");
				assert.strictEqual(typeof pendingBlob2.uploadTime, "number");
				assert.strictEqual(pendingBlob2.minTTLInSeconds, MIN_TTL);

				const pendingBlob3: SerializableLocalBlobRecord | undefined = pendingBlobs[localId3];
				assert(pendingBlob3 !== undefined, "Expect pending blob with localId3");
				assert.strictEqual(pendingBlob3.state, "localOnly");
				assert.strictEqual(pendingBlob3.blob, bufferToString(textToBlob("fizz"), "base64"));
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
			const pendingBlobs = {
				"a11323e2-27c1-417a-a5c3-e202cf515188": {
					state: "uploaded",
					blob: "aGVsbG8=", // "hello"
					storageId: "b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0",
					// Even though this is expired, it should still round-trip as-is since this test
					// doesn't try to start the share process for it.
					uploadTime: 0,
					minTTLInSeconds: 86400,
				},
				"0f2e8b7e-bec9-4694-9aee-6d635713e5e6": {
					state: "localOnly",
					blob: "d29ybGQ=", // "world"
				},
				"97268155-d656-4bd2-8271-8ed9a14fc179": {
					state: "uploaded",
					blob: "Zml6eg==", // "fizz"
					storageId: "9b00ce20c29ae905c86d7ae0e832d95d63a468ca",
					uploadTime: Date.now(),
					minTTLInSeconds: 86400,
				},
			} as const;

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
}
