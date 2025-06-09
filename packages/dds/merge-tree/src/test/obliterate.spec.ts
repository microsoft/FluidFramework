/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISegmentPrivate, ObliterateInfo } from "../mergeTreeNodes.js";
import { MergeTreeDeltaType } from "../ops.js";
import { TextSegment } from "../textSegment.js";

import { TestClient } from "./testClient.js";
import { makeRemoteClient } from "./testUtils.js";

describe("obliterate", () => {
	let client: TestClient;
	let refSeq: number;
	const remoteClient1 = makeRemoteClient({ clientId: 18 });
	const remoteClient2 = makeRemoteClient({ clientId: 19 });

	beforeEach(() => {
		client = new TestClient({
			mergeTreeEnableObliterate: true,
		});
		client.startOrUpdateCollaboration("local");
		for (const char of "hello world") {
			client.applyMsg(
				client.makeOpMessage(
					client.insertTextLocal(client.getLength(), char),
					client.getCurrentSeq() + 1,
				),
			);
		}
		assert.equal(client.getText(), "hello world");
		refSeq = client.getCurrentSeq();
	});

	it("removes text", () => {
		client.obliterateRangeLocal(0, client.getLength());
		assert.equal(client.getText(), "");
	});

	describe("concurrent obliterate and insert", () => {
		it("removes text for obliterate then insert", () => {
			client.mergeTree.obliterateRange(
				0,
				client.getLength(),
				remoteClient1.perspectiveAt({ refSeq }),
				remoteClient1.stampAt({ seq: refSeq + 1 }),
				undefined as never,
			);
			client.mergeTree.insertSegments(
				1,
				[TextSegment.make("more ")],
				remoteClient2.perspectiveAt({ refSeq }),
				remoteClient2.stampAt({ seq: refSeq + 2 }),
				{ op: { type: MergeTreeDeltaType.INSERT } },
			);
			assert.equal(client.getText(), "");
		});
		it("removes text for insert then obliterate when deleting entire string", () => {
			client.mergeTree.insertSegments(
				1,
				[TextSegment.make("more ")],
				remoteClient2.perspectiveAt({ refSeq }),
				remoteClient2.stampAt({ seq: refSeq + 1 }),
				{ op: { type: MergeTreeDeltaType.INSERT } },
			);
			client.mergeTree.obliterateRange(
				0,
				"hello world".length,
				remoteClient1.perspectiveAt({ refSeq }),
				remoteClient1.stampAt({ seq: refSeq + 2 }),
				undefined as never,
			);
			assert.equal(client.getText(), "");
		});
		it("removes text for insert then obliterate", () => {
			client.mergeTree.insertSegments(
				5,
				[TextSegment.make("more ")],
				remoteClient2.perspectiveAt({ refSeq }),
				remoteClient2.stampAt({ seq: refSeq + 1 }),
				{ op: { type: MergeTreeDeltaType.INSERT } },
			);
			client.mergeTree.obliterateRange(
				1,
				"hello world".length,
				remoteClient1.perspectiveAt({ refSeq }),
				remoteClient1.stampAt({ seq: refSeq + 2 }),
				undefined as never,
			);
			assert.equal(client.getText(), "h");
		});
	});

	describe("endpoint behavior", () => {
		it("does not expand to include text inserted at start", () => {
			client.mergeTree.obliterateRange(
				5,
				client.getLength(),
				remoteClient1.perspectiveAt({ refSeq }),
				remoteClient1.stampAt({ seq: refSeq + 1 }),
				undefined as never,
			);
			client.mergeTree.insertSegments(
				5,
				[TextSegment.make("XXX")],
				remoteClient2.perspectiveAt({ refSeq }),
				remoteClient2.stampAt({ seq: refSeq + 2 }),
				{ op: { type: MergeTreeDeltaType.INSERT } },
			);
			assert.equal(client.getText(), "helloXXX");
		});
		it("does not expand to include text inserted at end", () => {
			client.mergeTree.obliterateRange(
				0,
				"hello".length,
				remoteClient1.perspectiveAt({ refSeq }),
				remoteClient1.stampAt({ seq: refSeq + 1 }),
				undefined as never,
			);
			client.mergeTree.insertSegments(
				5,
				[TextSegment.make("XXX")],
				remoteClient2.perspectiveAt({ refSeq }),
				remoteClient2.stampAt({ seq: refSeq + 2 }),
				{ op: { type: MergeTreeDeltaType.INSERT } },
			);
			assert.equal(client.getText(), "XXX world");
		});
	});

	describe("local obliterate with concurrent inserts", () => {
		it("removes range when pending local obliterate op", () => {
			client.obliterateRangeLocal(0, client.getLength());
			client.mergeTree.insertSegments(
				1,
				[TextSegment.make("XXX")],
				remoteClient1.perspectiveAt({ refSeq }),
				remoteClient1.stampAt({ seq: refSeq + 1 }),
				{ op: { type: MergeTreeDeltaType.INSERT } },
			);
			assert.equal(client.getText(), "");
		});
	});

	describe("local references", () => {
		it("cleans up local references once the collab window advances enough", () => {
			const client2 = new TestClient({ mergeTreeEnableObliterate: true });
			client2.startOrUpdateCollaboration("client2");

			const obliterateStart = 0;
			const obliterateEnd = client.getLength();
			const startSeg = client.getContainingSegment<ISegmentPrivate>(obliterateStart);
			const endSeg = client.getContainingSegment<ISegmentPrivate>(obliterateEnd);
			let seq = refSeq;
			client.mergeTree.obliterateRange(
				obliterateStart,
				obliterateEnd,
				remoteClient1.perspectiveAt({ refSeq }),
				remoteClient1.stampAt({ seq: ++seq }),
				undefined as never,
			);
			client.mergeTree.insertSegments(
				1,
				[TextSegment.make("more ")],
				remoteClient2.perspectiveAt({ refSeq }),
				remoteClient2.stampAt({ seq: ++seq }),
				{ op: { type: MergeTreeDeltaType.INSERT } },
			);
			assert.equal(client.getText(), "");

			startSeg.segment?.localRefs?.walkReferences((ref) => {
				const oblProps = ref.properties?.obliterate as ObliterateInfo;
				assert(oblProps?.start !== undefined, "start ref should NOT be removed");
			});
			endSeg.segment?.localRefs?.walkReferences((ref) => {
				const oblProps = ref.properties?.obliterate as ObliterateInfo;
				assert(oblProps?.end !== undefined, "end ref should NOT be removed");
			});

			// this will force Zamboni to run
			for (let i = 0; i < 5; i++) {
				const insert = client.makeOpMessage(
					client.insertTextLocal(client.getLength(), i.toString()),
					++seq,
				);
				insert.minimumSequenceNumber = seq - 1;
				client.applyMsg(insert);
				client2.applyMsg(insert);
			}

			// want to check that the start and end segment don't have the obliterate refs on them
			startSeg.segment?.localRefs?.walkReferences((ref) => {
				const oblProps = ref.properties?.obliterate as ObliterateInfo;
				assert(oblProps.start === undefined, "start ref should be removed");
			});
			endSeg.segment?.localRefs?.walkReferences((ref) => {
				const oblProps = ref.properties?.obliterate as ObliterateInfo;
				assert(oblProps.end === undefined, "end ref should be removed");
			});
		});
	});
});
