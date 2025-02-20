/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISegmentPrivate, ObliterateInfo } from "../mergeTreeNodes.js";
import { MergeTreeDeltaType } from "../ops.js";

import { TestClient } from "./testClient.js";
import { insertText, obliterateRange } from "./testUtils.js";

describe("obliterate", () => {
	let client: TestClient;
	let refSeq: number;
	const localClientId = 17;
	const remoteClientId = localClientId + 1;

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
			obliterateRange({
				mergeTree: client.mergeTree,
				start: 0,
				end: client.getLength(),
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 1,
				opArgs: undefined as never,
			});
			insertText({
				mergeTree: client.mergeTree,
				pos: 1,
				refSeq,
				clientId: remoteClientId + 1,
				seq: refSeq + 2,
				text: "more ",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});
			assert.equal(client.getText(), "");
		});
		it("removes text for insert then obliterate when deleting entire string", () => {
			insertText({
				mergeTree: client.mergeTree,
				pos: 1,
				refSeq,
				clientId: remoteClientId + 1,
				seq: refSeq + 1,
				text: "more ",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});
			obliterateRange({
				mergeTree: client.mergeTree,
				start: 0,
				end: "hello world".length,
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 2,
				opArgs: undefined as never,
			});
			assert.equal(client.getText(), "");
		});
		it("removes text for insert then obliterate", () => {
			insertText({
				mergeTree: client.mergeTree,
				pos: 5,
				refSeq,
				clientId: remoteClientId + 1,
				seq: refSeq + 1,
				text: "more ",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});
			obliterateRange({
				mergeTree: client.mergeTree,
				start: 1,
				end: "hello world".length,
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 2,
				opArgs: undefined as never,
			});
			assert.equal(client.getText(), "h");
		});
	});

	describe("endpoint behavior", () => {
		it("does not expand to include text inserted at start", () => {
			obliterateRange({
				mergeTree: client.mergeTree,
				start: 5,
				end: client.getLength(),
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 1,
				opArgs: undefined as never,
			});
			insertText({
				mergeTree: client.mergeTree,
				pos: 5,
				refSeq,
				clientId: remoteClientId + 1,
				seq: refSeq + 2,
				text: "XXX",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});
			assert.equal(client.getText(), "helloXXX");
		});
		it("does not expand to include text inserted at end", () => {
			obliterateRange({
				mergeTree: client.mergeTree,
				start: 0,
				end: "hello".length,
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 1,
				opArgs: undefined as never,
			});
			insertText({
				mergeTree: client.mergeTree,
				pos: 5,
				refSeq,
				clientId: remoteClientId + 1,
				seq: refSeq + 2,
				text: "XXX",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});
			assert.equal(client.getText(), "XXX world");
		});
	});

	describe("local obliterate with concurrent inserts", () => {
		it("removes range when pending local obliterate op", () => {
			client.obliterateRangeLocal(0, client.getLength());
			insertText({
				mergeTree: client.mergeTree,
				pos: 1,
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 2,
				text: "XXX",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});
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
			obliterateRange({
				mergeTree: client.mergeTree,
				start: obliterateStart,
				end: obliterateEnd,
				refSeq,
				clientId: remoteClientId,
				seq: ++seq,
				opArgs: undefined as never,
			});
			insertText({
				mergeTree: client.mergeTree,
				pos: 1,
				refSeq,
				clientId: remoteClientId + 1,
				seq: ++seq,
				text: "more ",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});
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
