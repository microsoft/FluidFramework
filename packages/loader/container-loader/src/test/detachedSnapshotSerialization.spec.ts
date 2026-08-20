/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISnapshot, ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	detachedSnapshotBlobsEncoding,
	type IPendingDetachedContainerState,
} from "../serializedStateManager.js";
import {
	convertDetachedSnapshotToISnapshot,
	convertISnapshotToDetachedSnapshotWithBlobs,
	getDetachedContainerStateFromSerializedContainer,
} from "../utils.js";

const binaryBlobContents = [0x00, 0x7f, 0x80, 0xc3, 0x28, 0xff];
const utf8Text = "ASCII\u0000\u00E9\uD83D\uDE00\uFFFD";
const utf8BlobContents = [...new TextEncoder().encode(utf8Text)];

function toArrayBuffer(contents: readonly number[]): ArrayBuffer {
	return Uint8Array.from(contents).buffer;
}

function assertBlobContents(
	snapshot: ISnapshot,
	blobId: string,
	expectedContents: readonly number[],
): void {
	const blob = snapshot.blobContents.get(blobId);
	assert(blob !== undefined, `Blob ${blobId} is missing`);
	assert.deepStrictEqual([...new Uint8Array(blob)], expectedContents);
}

describe("detached snapshot serialization", () => {
	it("round-trips binary and UTF-8 summary blobs through JSON", () => {
		const snapshotTree: ISnapshotTree = {
			blobs: {
				binary: "binary-id",
				utf8: "utf8-id",
			},
			trees: {},
		};
		const snapshot: ISnapshot = {
			blobContents: new Map([
				["binary-id", toArrayBuffer(binaryBlobContents)],
				["utf8-id", toArrayBuffer(utf8BlobContents)],
			]),
			latestSequenceNumber: undefined,
			ops: [],
			sequenceNumber: 0,
			snapshotFormatV: 1,
			snapshotTree,
		};

		const serializedSnapshot = convertISnapshotToDetachedSnapshotWithBlobs(snapshot);
		assert.strictEqual(
			serializedSnapshot.snapshotBlobsEncoding,
			detachedSnapshotBlobsEncoding,
		);
		assert.strictEqual(serializedSnapshot.snapshotBlobs["binary-id"], "AH+Awyj/");
		assert.strictEqual(serializedSnapshot.snapshotBlobs["utf8-id"], "QVNDSUkAw6nwn5iA77+9");

		const pendingState: IPendingDetachedContainerState = {
			...serializedSnapshot,
			attached: false,
			hasAttachmentBlobs: false,
		};
		const parsedState = getDetachedContainerStateFromSerializedContainer(
			JSON.stringify(pendingState),
		);
		const rehydratedSnapshot = convertDetachedSnapshotToISnapshot(parsedState);

		assertBlobContents(rehydratedSnapshot, "binary-id", binaryBlobContents);
		assertBlobContents(rehydratedSnapshot, "utf8-id", utf8BlobContents);
	});

	it("normalizes a legacy UTF-8 pending state without changing its text bytes", () => {
		const legacySerializedState =
			'{"attached":false,"baseSnapshot":{"blobs":{"text":"legacy-text-id"},"trees":{}},"snapshotBlobs":{"legacy-text-id":"ASCII\\u0000\\u00e9\\ud83d\\ude00\\ufffd"},"hasAttachmentBlobs":false}';

		const parsedState =
			getDetachedContainerStateFromSerializedContainer(legacySerializedState);
		assert.strictEqual(parsedState.snapshotBlobsEncoding, detachedSnapshotBlobsEncoding);
		assert.strictEqual(parsedState.snapshotBlobs["legacy-text-id"], "QVNDSUkAw6nwn5iA77+9");

		const rehydratedSnapshot = convertDetachedSnapshotToISnapshot(parsedState);
		assertBlobContents(rehydratedSnapshot, "legacy-text-id", utf8BlobContents);
	});

	it("converts a legacy combined summary and preserves its attachment marker", () => {
		const legacyCombinedSummary =
			'{"type":1,"tree":{".app":{"type":1,"tree":{"text":{"type":2,"content":"ASCII\\u0000\\u00e9\\ud83d\\ude00\\ufffd"}}},".protocol":{"type":1,"tree":{}},".hasAttachmentBlobs":{"type":2,"content":"true"}}}';

		const parsedState =
			getDetachedContainerStateFromSerializedContainer(legacyCombinedSummary);
		assert.strictEqual(parsedState.hasAttachmentBlobs, true);
		assert.strictEqual(parsedState.snapshotBlobsEncoding, detachedSnapshotBlobsEncoding);
		const textBlobId = parsedState.baseSnapshot.blobs.text;
		assert(textBlobId !== undefined, "Legacy text summary blob ID is missing");

		const rehydratedSnapshot = convertDetachedSnapshotToISnapshot(parsedState);
		assertBlobContents(rehydratedSnapshot, textBlobId, utf8BlobContents);
	});

	it("rejects unsupported encodings and malformed snapshot data", () => {
		const validState = {
			attached: false,
			baseSnapshot: { blobs: {}, trees: {} },
			hasAttachmentBlobs: false,
			snapshotBlobs: {},
		};
		const invalidStates: Record<string, unknown>[] = [
			{
				...validState,
				snapshotBlobsEncoding: "utf8",
			},
			{
				...validState,
				snapshotBlobs: { blob: 1 },
			},
			{
				...validState,
				baseSnapshot: { blobs: [], trees: {} },
			},
		];

		for (const invalidState of invalidStates) {
			assert.throws(
				() => getDetachedContainerStateFromSerializedContainer(JSON.stringify(invalidState)),
				UsageError,
			);
		}
	});
});
