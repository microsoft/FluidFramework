/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "node:assert";

import { FluidErrorTypes } from "@fluidframework/core-interfaces/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { isFluidError } from "@fluidframework/telemetry-utils/internal";

import { UnassignedSequenceNumber } from "../constants.js";
import { walkAllChildSegments } from "../mergeTreeNodeWalk.js";
import { ISegmentPrivate, SegmentGroup } from "../mergeTreeNodes.js";
import { TrackingGroup } from "../mergeTreeTracking.js";
import { MergeTreeDeltaType, ReferenceType } from "../ops.js";
import {
	assertInserted,
	assertRemoved,
	toInsertionInfo,
	toRemovalInfo,
} from "../segmentInfos.js";
import { Side } from "../sequencePlace.js";
import { TextSegment } from "../textSegment.js";

import { TestClient } from "./testClient.js";
import { TestClientLogger, createClientsAtInitialState } from "./testClientLogger.js";

describe("client.applyMsg", () => {
	const localUserLongId = "localUser";
	const remoteUserLongId = "remoteUser";
	let client: TestClient;

	beforeEach(() => {
		client = new TestClient();
		client.insertTextLocal(0, "hello world");
		client.startOrUpdateCollaboration(localUserLongId);
	});

	it("Interleaved inserts, annotates, and deletes", () => {
		const changes = new Map<
			number,
			{ msg: ISequencedDocumentMessage; segmentGroup?: SegmentGroup | SegmentGroup[] }
		>();
		assert.equal(client.mergeTree.pendingSegments?.length, 0);
		for (let i = 0; i < 100; i++) {
			const len = client.getLength();
			const pos1 = Math.floor(len / 2);
			const imod6 = i % 6;
			switch (imod6) {
				case 0:
				case 5: {
					const pos2 = Math.max(Math.floor((len - pos1) / 4) - imod6 + pos1, pos1 + 1);
					const msg = client.makeOpMessage(client.removeRangeLocal(pos1, pos2), i + 1);
					changes.set(i, { msg, segmentGroup: client.peekPendingSegmentGroups() });
					break;
				}

				case 1:
				case 4: {
					const str = `${i}`.repeat(imod6 + 5);
					const msg = client.makeOpMessage(client.insertTextLocal(pos1, str), i + 1);
					changes.set(i, { msg, segmentGroup: client.peekPendingSegmentGroups() });
					break;
				}

				case 2:
				case 3: {
					const pos2 = Math.max(Math.floor((len - pos1) / 3) - imod6 + pos1, pos1 + 1);
					const op = client.annotateRangeLocal(pos1, pos2, {
						foo: `${i}`,
					});
					const msg = client.makeOpMessage(op, i + 1);
					changes.set(i, { msg, segmentGroup: client.peekPendingSegmentGroups() });
					break;
				}
				default: {
					assert.fail("all cases should be handled");
				}
			}
		}
		for (let i = 0; i < 100; i++) {
			const msg = changes.get(i)!.msg;
			client.applyMsg(msg);
			const segmentGroup = changes.get(i)?.segmentGroup;
			assert(
				!Array.isArray(segmentGroup) && segmentGroup !== undefined,
				"segment group should be defined and not an array",
			);
			for (const seg of segmentGroup.segments) {
				switch (i % 6) {
					case 0:
					case 5: {
						assertRemoved(seg);
						assert.equal(
							seg.removedSeq,
							msg.sequenceNumber,
							"removed segment has unexpected id",
						);
						break;
					}

					case 1:
					case 4: {
						assertInserted(seg);
						assert.equal(seg.seq, msg.sequenceNumber, "inserted segment has unexpected id");
						break;
					}

					default:
				}
			}
		}
		assert.equal(client.mergeTree.pendingSegments?.length, 0);
		for (let i = 0; i < client.getText().length; i++) {
			const segmentInfo = client.getContainingSegment<ISegmentPrivate>(i);

			assert.notEqual(
				toInsertionInfo(segmentInfo.segment)?.seq,
				UnassignedSequenceNumber,
				"all segments should be acked",
			);
			assert(
				segmentInfo.segment?.segmentGroups?.empty !== false,
				"there should be no outstanding segmentGroups",
			);
		}
	});

	it("insertTextLocal", () => {
		const op = client.insertTextLocal(0, "abc");

		const segmentInfo = client.getContainingSegment<ISegmentPrivate>(0);

		assert.equal(toInsertionInfo(segmentInfo.segment)?.seq, UnassignedSequenceNumber);

		client.applyMsg(client.makeOpMessage(op, 17));

		assert.equal(toInsertionInfo(segmentInfo.segment)?.seq, 17);
	});

	it("removeRangeLocal", () => {
		const segmentInfo = client.getContainingSegment<ISegmentPrivate>(0);

		const removeOp = client.removeRangeLocal(0, 1);
		assert.equal(toRemovalInfo(segmentInfo.segment)?.removedSeq, UnassignedSequenceNumber);

		client.applyMsg(client.makeOpMessage(removeOp, 17));

		assert.equal(toRemovalInfo(segmentInfo.segment)?.removedSeq, 17);
	});

	it("annotateSegmentLocal", () => {
		const props = {
			foo: "bar",
		};
		const op = client.annotateRangeLocal(0, 1, props);

		assert.equal(client.mergeTree.pendingSegments?.length, 1);

		client.applyMsg(client.makeOpMessage(op, 17));

		assert.equal(client.mergeTree.pendingSegments?.length, 0);
	});

	it("annotateSegmentLocal then removeRangeLocal", () => {
		const segmentInfo = client.getContainingSegment<ISegmentPrivate>(0);

		const start = 0;
		const end = client.getText().length;

		const props = {
			foo: "bar",
		};

		const annotateOp = client.annotateRangeLocal(start, end, props);

		assert.equal(client.mergeTree.pendingSegments?.length, 1);

		const removeOp = client.removeRangeLocal(start, end);

		assert.equal(toRemovalInfo(segmentInfo.segment)?.removedSeq, UnassignedSequenceNumber);
		assert.equal(client.mergeTree.pendingSegments?.length, 2);

		client.applyMsg(client.makeOpMessage(annotateOp, 17));

		assert.equal(toRemovalInfo(segmentInfo.segment)?.removedSeq, UnassignedSequenceNumber);
		assert.equal(client.mergeTree.pendingSegments?.length, 1);

		client.applyMsg(client.makeOpMessage(removeOp, 18, 0));

		assert.equal(toRemovalInfo(segmentInfo.segment)?.removedSeq, 18);
		assert.equal(client.mergeTree.pendingSegments?.length, 0);
	});

	it("multiple interleaved annotateSegmentLocal", () => {
		let annotateEnd: number = client.getText().length;
		const messages: ISequencedDocumentMessage[] = [];
		let sequenceNumber = 0;
		while (annotateEnd > 0) {
			const props = {
				end: annotateEnd,
				foo: "bar",
			};
			const annotateOp = client.annotateRangeLocal(0, annotateEnd, props);

			messages.push(client.makeOpMessage(annotateOp, ++sequenceNumber));

			annotateEnd = Math.floor(annotateEnd / 2);
		}
		assert.equal(client.mergeTree.pendingSegments?.length, messages.length);

		for (const msg of messages) {
			client.applyMsg(msg);
		}
		assert.equal(client.mergeTree.pendingSegments?.length, 0);
	});

	it("overlapping deletes", () => {
		const segmentInfo = client.getContainingSegment<ISegmentPrivate>(0);

		const start = 0;
		const end = 5;
		const initialText = client.getText();
		const initialLength = initialText.length;

		assert.equal(toRemovalInfo(segmentInfo.segment)?.removedSeq, undefined);
		assert(segmentInfo.segment?.segmentGroups?.empty !== false);

		const removeOp = client.removeRangeLocal(start, end);

		assert.equal(toRemovalInfo(segmentInfo.segment)?.removedSeq, UnassignedSequenceNumber);
		assert.equal(segmentInfo.segment?.segmentGroups?.size, 1);

		const remoteMessage = client.makeOpMessage(removeOp, 17);
		remoteMessage.clientId = "remoteClient";

		client.applyMsg(remoteMessage);

		assert.equal(toRemovalInfo(segmentInfo.segment)?.removedSeq, remoteMessage.sequenceNumber);
		assert.equal(segmentInfo.segment?.segmentGroups.size, 1);

		client.applyMsg(client.makeOpMessage(removeOp, 18, 0));

		assert.equal(toRemovalInfo(segmentInfo.segment)?.removedSeq, remoteMessage.sequenceNumber);
		assert(segmentInfo.segment?.segmentGroups.empty);
		assert.equal(client.getLength(), initialLength - (end - start));
		assert.equal(
			client.getText(),
			initialText.slice(0, Math.max(0, start)) + initialText.slice(Math.max(0, end)),
		);
	});

	it("overlapping insert and delete", () => {
		const remoteClient = new TestClient();
		remoteClient.insertTextLocal(0, client.getText());
		remoteClient.startOrUpdateCollaboration("remoteUser");
		const clients = [client, remoteClient];
		const logger = new TestClientLogger(clients);
		let seq = 0;
		const initialMsg = client.makeOpMessage(client.insertTextLocal(0, "-"), ++seq);

		for (const c of clients) c.applyMsg(initialMsg);
		logger.validate({ baseText: "-hello world" });

		const messages = [
			client.makeOpMessage(client.insertTextLocal(0, "L"), ++seq),
			client.makeOpMessage(client.removeRangeLocal(1, 2), ++seq),
			remoteClient.makeOpMessage(remoteClient.insertTextLocal(0, "R"), ++seq),
			remoteClient.makeOpMessage(remoteClient.removeRangeLocal(1, 2), ++seq),
		];

		while (messages.length > 0) {
			const msg = messages.shift()!;
			for (const c of clients) c.applyMsg(msg);
		}

		logger.validate({ baseText: "RLhello world" });
	});

	it("intersecting insert after local delete", () => {
		const clients = createClientsAtInitialState({ initialState: "" }, "A", "B", "C");
		let seq = 0;
		const logger = new TestClientLogger(clients.all);
		const messages = [
			clients.C.makeOpMessage(clients.C.insertTextLocal(0, "c"), ++seq),
			clients.C.makeOpMessage(clients.C.removeRangeLocal(0, 1), ++seq),
			clients.B.makeOpMessage(clients.B.insertTextLocal(0, "b"), ++seq),
			clients.C.makeOpMessage(clients.C.insertTextLocal(0, "c"), ++seq),
		];

		while (messages.length > 0) {
			const msg = messages.shift()!;
			for (const c of clients.all) c.applyMsg(msg);
		}

		logger.validate({ baseText: "cb" });
	});

	it("conflicting insert after shared delete", () => {
		const clients = createClientsAtInitialState({ initialState: "Z" }, "A", "B", "C");
		let seq = 0;

		const logger = new TestClientLogger(clients.all);
		const messages = [
			clients.B.makeOpMessage(clients.B.insertTextLocal(0, "B"), ++seq),
			clients.C.makeOpMessage(clients.C.removeRangeLocal(0, clients.C.getLength()), ++seq),
			clients.C.makeOpMessage(clients.C.insertTextLocal(0, "C"), ++seq),
		];

		while (messages.length > 0) {
			const msg = messages.shift()!;
			for (const c of clients.all) c.applyMsg(msg);
		}

		logger.validate({ baseText: "CB" });
	});

	it("local remove followed by conflicting insert", () => {
		const clients = createClientsAtInitialState({ initialState: "" }, "A", "B", "C");

		let seq = 0;

		const messages = [
			clients.C.makeOpMessage(clients.C.insertTextLocal(0, "c"), ++seq),
			clients.B.makeOpMessage(clients.B.insertTextLocal(0, "b"), ++seq),
			clients.C.makeOpMessage(clients.C.removeRangeLocal(0, 1), ++seq),
			clients.C.makeOpMessage(clients.C.insertTextLocal(0, "c"), ++seq),
		];

		const logger = new TestClientLogger(clients.all);
		while (messages.length > 0) {
			const msg = messages.shift()!;
			for (const c of clients.all) c.applyMsg(msg);
		}

		logger.validate({ baseText: "cb" });
	});

	it("intersecting insert with un-acked insert and delete", () => {
		const clients = createClientsAtInitialState({ initialState: "" }, "A", "B", "C");

		let seq = 0;
		const messages = [
			clients.C.makeOpMessage(clients.C.insertTextLocal(0, "c"), ++seq),
			clients.B.makeOpMessage(clients.B.insertTextLocal(0, "bb"), ++seq),
			clients.B.makeOpMessage(clients.B.removeRangeLocal(0, 1), ++seq),
		];

		const logger = new TestClientLogger(clients.all);
		while (messages.length > 0) {
			const msg = messages.shift()!;
			for (const c of clients.all) c.applyMsg(msg);
		}

		logger.validate({ baseText: "bc" });
	});

	it("conflicting insert over local delete", () => {
		const clients = createClientsAtInitialState({ initialState: "" }, "A", "B", "C");

		let seq = 0;
		const messages = [
			clients.C.makeOpMessage(clients.C.insertTextLocal(0, "CCC"), ++seq),
			clients.C.makeOpMessage(clients.C.removeRangeLocal(0, 1), ++seq),
		];
		while (messages.length > 0) {
			const msg = messages.shift()!;
			for (const c of clients.all) {
				c.applyMsg(msg);
			}
		}
		const logger = new TestClientLogger(clients.all);
		logger.validate({ baseText: "CC" });

		messages.push(
			clients.C.makeOpMessage(clients.C.removeRangeLocal(0, 1), ++seq),
			clients.C.makeOpMessage(clients.C.insertTextLocal(0, "CC"), ++seq),
			clients.B.makeOpMessage(clients.B.insertTextLocal(1, "BBB"), ++seq),
		);
		while (messages.length > 0) {
			const msg = messages.shift()!;
			for (const c of clients.all) c.applyMsg(msg);
		}
		logger.validate({ baseText: "CCBBBC" });
	});

	it("Local insert after acked local delete", () => {
		const clients = createClientsAtInitialState({ initialState: "ZZ" }, "A", "B", "C");

		const logger = new TestClientLogger(clients.all);

		let seq = 0;

		const op1 = clients.C.makeOpMessage(clients.C.removeRangeLocal(0, 1), ++seq);
		clients.C.applyMsg(op1);

		const op2 = clients.B.makeOpMessage(clients.B.removeRangeLocal(1, 2), ++seq);

		const op3 = clients.C.makeOpMessage(clients.C.insertTextLocal(0, "C"), ++seq);

		const op4 = clients.B.makeOpMessage(clients.B.insertTextLocal(1, "B"), ++seq);

		clients.A.applyMsg(op1);
		clients.B.applyMsg(op1);

		const messages = [op2, op3, op4];
		while (messages.length > 0) {
			const msg = messages.shift()!;
			for (const c of clients.all) c.applyMsg(msg);
		}

		logger.validate({ baseText: "CB" });
	});

	it("Remote Remove before conflicting insert", () => {
		const clients = createClientsAtInitialState({ initialState: "Z" }, "A", "B", "C");

		const logger = new TestClientLogger(clients.all);

		let seq = 0;

		const op1 = clients.B.makeOpMessage(clients.B.removeRangeLocal(0, 1), ++seq);
		const op2 = clients.B.makeOpMessage(clients.B.insertTextLocal(0, "B"), ++seq);

		clients.C.applyMsg(op1);

		const op3 = clients.C.makeOpMessage(clients.C.insertTextLocal(0, "C"), ++seq);
		clients.A.applyMsg(op1);
		clients.B.applyMsg(op1);

		const messages = [op2, op3];
		while (messages.length > 0) {
			const msg = messages.shift()!;
			for (const c of clients.all) c.applyMsg(msg);
		}

		logger.validate({ baseText: "CB" });
	});

	it("Conflicting inserts at deleted segment position", () => {
		const clients = createClientsAtInitialState(
			{ initialState: "a----bcd-ef" },
			"A",
			"B",
			"C",
		);

		const logger = new TestClientLogger(clients.all);

		let seq = 0;
		const ops: ISequencedDocumentMessage[] = [];
		ops.push(
			clients.B.makeOpMessage(clients.B.insertTextLocal(4, "B"), ++seq),
			clients.C.makeOpMessage(clients.C.insertTextLocal(4, "CC"), ++seq),
			clients.C.makeOpMessage(clients.C.removeRangeLocal(2, 8), ++seq),
		);
		clients.B.applyMsg(ops[0]);
		clients.B.applyMsg(ops[1]);
		ops.push(clients.B.makeOpMessage(clients.B.removeRangeLocal(5, 8), ++seq));

		for (const op of ops) {
			for (const c of clients.all) {
				if (c.getCollabWindow().currentSeq < op.sequenceNumber) {
					c.applyMsg(op);
				}
			}
		}
		logger.validate({ baseText: "ab" });
	});

	it("Inconsistent shared string after pausing connection #9703", () => {
		const clients = createClientsAtInitialState({ initialState: "abcd" }, "A", "B", "C");

		const logger = new TestClientLogger(clients.all);

		let seq = 0;
		const ops: ISequencedDocumentMessage[] = [];
		ops.push(clients.B.makeOpMessage(clients.B.removeRangeLocal(1, 3), ++seq));
		clients.B.applyMsg(ops[0]);
		ops.push(clients.B.makeOpMessage(clients.B.insertTextLocal(1, "yz"), ++seq));
		clients.B.applyMsg(ops[1]);

		// it's like this connection is paused, as it doesn't see the other clients' ops
		// which its own ops will be sequenced after
		ops.push(clients.C.makeOpMessage(clients.C.insertTextLocal(2, "X"), ++seq));

		for (const op of ops) {
			for (const c of clients.all) {
				if (c.getCollabWindow().currentSeq < op.sequenceNumber) {
					c.applyMsg(op);
				}
			}
		}
		logger.validate({ baseText: "ayzXd" });
	});

	it("regenerate annotate op over removed range", () => {
		const clientA = new TestClient();
		clientA.startOrUpdateCollaboration("A");
		const clientB = new TestClient();
		clientB.startOrUpdateCollaboration("B");

		let seq = 0;
		const insertOp = clientA.makeOpMessage(clientA.insertTextLocal(0, "AAA"), ++seq);
		[clientA, clientB].map((c) => c.applyMsg(insertOp));

		const annotateOp = clientA.annotateRangeLocal(0, clientA.getLength(), { client: "A" })!;
		const seg = clientA.peekPendingSegmentGroups()!;

		const removeOp = clientB.makeOpMessage(
			clientB.removeRangeLocal(0, clientB.getLength()),
			++seq,
		);
		[clientA, clientB].map((c) => c.applyMsg(removeOp));

		const regeneratedOp = clientA.regeneratePendingOp(annotateOp, seg);
		assert(regeneratedOp.type === MergeTreeDeltaType.GROUP);
		assert.strictEqual(regeneratedOp.ops.length, 0);
	});

	it("getContainingSegment with op", () => {
		const clientA = new TestClient();
		clientA.startOrUpdateCollaboration("A");
		const clientB = new TestClient();
		clientB.startOrUpdateCollaboration("B");

		let seq = 0;
		const insertOp1 = clientA.makeOpMessage(clientA.insertTextLocal(0, "ABC"), ++seq);
		[clientA, clientB].map((c) => c.applyMsg(insertOp1));

		const removeOp = clientA.removeRangeLocal(0, 2);
		const removeSequence = ++seq;
		clientA.applyMsg(clientA.makeOpMessage(removeOp, removeSequence));

		const insertOp2 = clientB.insertTextLocal(2, "X");

		// op with no reference sequence should count removed segment
		const insertMessage2 = clientB.makeOpMessage(insertOp2, ++seq);
		let seg = clientA.getContainingSegment<ISegmentPrivate>(2, {
			referenceSequenceNumber: insertMessage2.referenceSequenceNumber,
			clientId: insertMessage2.clientId,
		});
		assert.notStrictEqual(seg.segment, undefined);
		assert.strictEqual((seg.segment as TextSegment).text, "C");

		// op with reference sequence >= remove op sequence should not count removed segment
		const insertMessage3 = clientB.makeOpMessage(insertOp2, seq, removeSequence);
		seg = clientA.getContainingSegment<ISegmentPrivate>(2, {
			referenceSequenceNumber: insertMessage3.referenceSequenceNumber,
			clientId: insertMessage3.clientId,
		});
		assert.strictEqual(seg.segment, undefined);
	});

	/**
	 * Regression test for an issue whereby reconnected clients could have segment orders that yielded
	 * different tiebreaking results for inserted segments. Specifically, client C's "c" segment
	 * should be considered for tiebreaking against the "b" segment as judged by the op it submitted for "c",
	 * but since client C rebased the op which inserted "c", its segments were in a meaningfully different order
	 * from other clients. This issue was fixed by making client C adjust the ordering of its segments at rebase
	 * (i.e. reconnection) time so that they align with the resubmitted op.
	 * Condensed view of this mismatch:
	 * ```
	 * _: Local State
	 * -: Deleted
	 * *: Unacked Insert and Delete
	 * 0: msn/offset
	 * Op format <seq>:<ref>:<client><type>@<pos1>,<pos2>
	 * sequence number represented as offset from msn. L means local.
	 * op types: 0) insert 1) remove 2) annotate
	 * op types: 0) insert 1) remove 2) annotate
	 * op         | client A      | op         | client C
	 *            |               | L:0:C0@0   | _
	 *            |               |            | C
	 * 1:0:D0@0   | DD            | 1:0:D0@0   | _DD
	 *            |               |            | C
	 * 2:0:C0@0   | CDD           | 2:0:C0@0   | CDD
	 * 3:2:D0@0   | DDDCDD        | 3:2:D0@0   | DDDCDD
	 * 4:2:D0@0   | DDDDCDD       | 4:2:D0@0   | DDDDCDD
	 * 5:4:D0@0   | DDDDDDDCDD    |            | DDDDCDD
	 * 6:4:D1@6,9 | DDDDDD---D    |            | DDDDCDD
	 *            | DDDDDD---D    | L:4:C0@5   | DDDDC_DD
	 *            |               |            |      c
	 *            | DDDDDD---D    | 5:4:D0@0   | DDDDDDDC_DD
	 *            |               |            |         c
	 *            | DDDDDD---D    | 6:4:D1@6,9 | DDDDDD- -_-D
	 *            |               |            |          c
	 * 7:6:B0@6   | DDDDDDb ---D  | 7:6:B0@6   | DDDDDDb- -_-D
	 *            |               |            |           c
	 * 8:6:C0@6   | DDDDDDcb ---D | 8:6:C0@6   | DDDDDDb- -c-D
	 * Client C does not match client A
	 * ```
	 */
	it("Concurrent insert into removed segment across block boundary", () => {
		const clients = createClientsAtInitialState({ initialState: "" }, "A", "B", "C", "D");

		const logger = new TestClientLogger([clients.A, clients.C]);
		let seq = 0;
		const ops: ISequencedDocumentMessage[] = [];
		const perClientOps: ISequencedDocumentMessage[][] = clients.all.map(() => []);

		ops.push(
			clients.D.makeOpMessage(clients.D.insertTextLocal(0, "DD"), ++seq),
			clients.C.makeOpMessage(clients.C.insertTextLocal(0, "C"), ++seq),
		);
		for (const op of ops.splice(0)) for (const c of clients.all) c.applyMsg(op);

		ops.push(
			clients.D.makeOpMessage(clients.D.insertTextLocal(0, "DDD"), ++seq),
			clients.D.makeOpMessage(clients.D.insertTextLocal(0, "D"), ++seq),
		);

		// disconnect B(1)
		for (const op of ops.splice(0))
			for (const [i, c] of clients.all.entries())
				if (i === 1) {
					perClientOps[i].push(op);
				} else {
					c.applyMsg(op);
				}

		ops.push(
			clients.D.makeOpMessage(clients.D.insertTextLocal(0, "DDD"), ++seq),
			clients.D.makeOpMessage(clients.D.removeRangeLocal(6, 9), ++seq),
		);

		// disconnect B(1) and C(2)
		for (const op of ops.splice(0))
			for (const [i, c] of clients.all.entries())
				if (i === 1 || i === 2) {
					perClientOps[i].push(op);
				} else {
					c.applyMsg(op);
				}

		// apply changes to disconnected clients
		const bOp = {
			op: clients.B.insertTextLocal(1, "b")!,
			sg: clients.B.peekPendingSegmentGroups()!,
		};
		const cOp = {
			op: clients.C.insertTextLocal(5, "c")!,
			sg: clients.C.peekPendingSegmentGroups()!,
		};

		// TODO: tracking group
		const { segment, offset } = clients.C.getContainingSegment<ISegmentPrivate>(5);
		assert(segment !== undefined, "expected segment");
		const ref = clients.C.createLocalReferencePosition(
			segment,
			offset,
			ReferenceType.Simple,
			undefined,
		);

		let beforeSlides = 0;
		let afterSlides = 0;
		ref.callbacks = {
			beforeSlide: (lref): void => {
				assert(lref === ref, "wrong ref slid");
				beforeSlides++;
			},
			afterSlide: (lref): void => {
				assert(lref === ref, "wrong ref slid");
				afterSlides++;
			},
		};

		// catch up disconnected clients
		for (const [i, clientOps] of perClientOps.entries())
			for (const op of clientOps.splice(0)) clients.all[i].applyMsg(op);

		// rebase and resubmit disconnected client ops
		ops.push(clients.B.makeOpMessage(clients.B.regeneratePendingOp(bOp.op, bOp.sg), ++seq));

		const trackingGroup = new TrackingGroup();
		const trackedSegs: ISegmentPrivate[] = [];
		walkAllChildSegments(clients.C.mergeTree.root, (seg) => {
			trackedSegs.push(seg);
			trackingGroup.link(seg);
		});

		assert.equal(beforeSlides, 0, "should be no slides");
		assert.equal(afterSlides, 0, "should be no slides");
		ops.push(clients.C.makeOpMessage(clients.C.regeneratePendingOp(cOp.op, cOp.sg), ++seq));
		assert.equal(beforeSlides, 1, "should be 1 slide");
		assert.equal(afterSlides, 1, "should be 1 slide");

		for (const seg of trackedSegs) {
			assert(trackingGroup.has(seg), "Tracking group should still have segment.");
		}
		// process the resubmitted ops
		for (const op of ops.splice(0))
			for (const c of clients.all) {
				c.applyMsg(op);
			}

		logger.validate({ baseText: "DDDDDDcbD" });
	});

	describe("annotateRangeAdjust", () => {
		it("validate local and remote adjust combine", () => {
			const clients = createClientsAtInitialState(
				{
					initialState: "0123456789",
					options: { mergeTreeEnableAnnotateAdjust: true },
				},
				"A",
				"B",
			);
			let seq = 0;
			const logger = new TestClientLogger(clients.all);
			const ops: ISequencedDocumentMessage[] = [];

			ops.push(
				clients.A.makeOpMessage(
					clients.A.annotateAdjustRangeLocal(1, 3, {
						key: {
							delta: 1,
						},
					}),
					seq++,
				),
				clients.B.makeOpMessage(
					clients.B.annotateAdjustRangeLocal(1, 3, {
						key: {
							delta: 1,
						},
					}),
					seq++,
				),
			);

			for (const op of ops.splice(0))
				for (const c of clients.all) {
					c.applyMsg(op);
				}
			assert.deepStrictEqual({ ...clients.A.getPropertiesAtPosition(2) }, { key: 2 });
			assert.deepStrictEqual({ ...clients.B.getPropertiesAtPosition(2) }, { key: 2 });
			logger.validate({ baseText: "0123456789" });
		});

		it("validate local and remote adjust combine with min", () => {
			const clients = createClientsAtInitialState(
				{
					initialState: "0123456789",
					options: { mergeTreeEnableAnnotateAdjust: true },
				},
				"A",
				"B",
			);
			let seq = 0;
			const logger = new TestClientLogger(clients.all);
			const ops: ISequencedDocumentMessage[] = [];

			ops.push(
				clients.A.makeOpMessage(
					clients.A.annotateAdjustRangeLocal(1, 3, {
						key: {
							delta: -1,
						},
					}),
					seq++,
				),
				clients.B.makeOpMessage(
					clients.B.annotateAdjustRangeLocal(1, 3, {
						key: {
							delta: 1,
							min: 0,
						},
					}),
					seq++,
				),
			);

			for (const op of ops.splice(0))
				for (const c of clients.all) {
					c.applyMsg(op);
				}
			assert.deepStrictEqual({ ...clients.A.getPropertiesAtPosition(2) }, { key: 0 });
			assert.deepStrictEqual({ ...clients.B.getPropertiesAtPosition(2) }, { key: 0 });
			logger.validate({ baseText: "0123456789" });
		});

		it("validate local and remote adjust combine with max", () => {
			const clients = createClientsAtInitialState(
				{
					initialState: "0123456789",
					options: { mergeTreeEnableAnnotateAdjust: true },
				},
				"A",
				"B",
			);
			let seq = 0;
			const logger = new TestClientLogger(clients.all);
			const ops: ISequencedDocumentMessage[] = [];

			ops.push(
				clients.A.makeOpMessage(
					clients.A.annotateAdjustRangeLocal(1, 3, {
						key: {
							delta: 1,
						},
					}),
					seq++,
				),
				clients.B.makeOpMessage(
					clients.B.annotateAdjustRangeLocal(1, 3, {
						key: {
							delta: 1,
							max: 1,
						},
					}),
					seq++,
				),
			);

			for (const op of ops.splice(0))
				for (const c of clients.all) {
					c.applyMsg(op);
				}
			assert.deepStrictEqual({ ...clients.A.getPropertiesAtPosition(2) }, { key: 1 });
			assert.deepStrictEqual({ ...clients.B.getPropertiesAtPosition(2) }, { key: 1 });
			logger.validate({ baseText: "0123456789" });
		});

		it("validate local and remote adjust combine with min and max", () => {
			const clients = createClientsAtInitialState(
				{
					initialState: "0123456789",
					options: { mergeTreeEnableAnnotateAdjust: true },
				},
				"A",
				"B",
			);
			let seq = 0;
			const logger = new TestClientLogger(clients.all);
			const ops: ISequencedDocumentMessage[] = [];

			ops.push(
				clients.A.makeOpMessage(
					clients.A.annotateAdjustRangeLocal(1, 3, {
						key: {
							delta: 1,
						},
					}),
					seq++,
				),
				clients.B.makeOpMessage(
					clients.B.annotateAdjustRangeLocal(1, 3, {
						key: {
							delta: 0,
							max: 0,
							min: 0,
						},
					}),
					seq++,
				),
			);

			for (const op of ops.splice(0))
				for (const c of clients.all) {
					c.applyMsg(op);
				}
			assert.deepStrictEqual({ ...clients.A.getPropertiesAtPosition(2) }, { key: 0 });
			assert.deepStrictEqual({ ...clients.B.getPropertiesAtPosition(2) }, { key: 0 });
			logger.validate({ baseText: "0123456789" });
		});

		it("validate min must be less than max", () => {
			const clients = createClientsAtInitialState(
				{
					initialState: "0123456789",
					options: { mergeTreeEnableAnnotateAdjust: true },
				},
				"A",
			);

			try {
				clients.A.annotateAdjustRangeLocal(1, 3, {
					key: {
						delta: 1,
						max: 1,
						min: 2,
					},
				});
				assert.fail("should fail");
			} catch (error: unknown) {
				assert(isFluidError(error));
				assert.equal(error.errorType, FluidErrorTypes.usageError);
			}
		});
	});

	describe("obliterate", () => {
		// 	op types: 0) insert 1) remove 2) annotate
		// Clients: 3 Ops: 3 Round: 86
		// op         | client A | op         | client B | op           | client C
		//            | BBB-C-   |            | BBB-C-   |              | BBB-C-
		//            | BBB-C-   | L:558:B0@3 | BBB__-C- |              | BBB-C-
		//            |          |            |    BB    |              |
		//            | BBB-C-   |            | BBB__-C- | L:558:C4@2,4 | BB_-_-
		//            |          |            |    BB    |              |   - -
		//            | BBB-C-   |            | BBB__-C- | L:558:C4@1,2 | B__-_-
		//            |          |            |    BB    |              |  -- -
		// 1:0:B0@3   | BBBBB-C- | 1:0:B0@3   | BBBBB-C- | 1:0:B0@3     | B__BB-_-
		//            |          |            |          |              |  --   -
		// 2:0:C4@2,4 | BB----   | 2:0:C4@2,4 | BB----   | 2:0:C4@2,4   | B_-BB-
		//            |          |            |          |              |  -
		// 3:0:C4@1,2 | B-----   | 3:0:C4@1,2 | B-----   | 3:0:C4@1,2   | B--BB-
		it("sided obliterate regression test", () => {
			const clients = createClientsAtInitialState(
				{
					initialState: "0123",
					options: { mergeTreeEnableObliterate: true, mergeTreeEnableSidedObliterate: true },
				},
				"A",
				"B",
				"C",
			);
			let seq = 0;
			const logger = new TestClientLogger(clients.all);
			const ops: ISequencedDocumentMessage[] = [];

			ops.push(
				clients.B.makeOpMessage(clients.B.removeRangeLocal(0, clients.B.getLength()), ++seq),
				clients.B.makeOpMessage(clients.B.insertTextLocal(0, "BBB"), ++seq),
				clients.C.makeOpMessage(clients.C.insertTextLocal(2, "C"), ++seq),
			);
			for (const op of ops.splice(0)) for (const c of clients.all) c.applyMsg(op);

			ops.push(
				clients.B.makeOpMessage(clients.B.insertTextLocal(3, "BB"), ++seq),
				clients.C.makeOpMessage(
					clients.C.obliterateRangeLocal(
						{ pos: 2, side: Side.Before },
						{ pos: 3, side: Side.After },
					),
					++seq,
				),
				clients.C.makeOpMessage(
					clients.C.obliterateRangeLocal(
						{ pos: 1, side: Side.Before },
						{ pos: 1, side: Side.After },
					),
					++seq,
				),
			);

			for (const op of ops.splice(0))
				for (const c of clients.all) {
					c.applyMsg(op);
				}

			logger.validate({ baseText: "B" });
		});

		// MergeTree insert failed:
		// 		Clients: 2 Ops: 8 Round: 4
		// op           | client A   | op           | client B
		//              | BBBBB BBB- |              | BBBBB BBB-
		//              | BBBBB BBB- | L:88:B2@1,7  | BBBBB BBB-
		//              | BBBBB BBB- | L:88:B4@6,8  | BBBBB B__-
		//              |            |              |        --
		//              | BBBBB BBB- | L:88:B0@5    | BBBBB _B__-
		//              |            |              |       B --
		//              | BBBBB BBB- | L:88:B0@2    | BB_BBB _B__-
		//              |            |              |   B    B --
		//              | BBBBB BBB- | L:88:B1@4,6  | BB_B__ _B__-
		//              |            |              |   B -- B --
		//              | BBBBB BBB- | L:88:B0@4    | BB_B___ _B__-
		//              |            |              |   B B-- B --
		//              | BBBBB BBB- | L:88:B0@4    | BB_B ____ _B__-
		//              |            |              |   B  BB-- B --
		//              | BBBBB BBB- | L:88:B2@0,7  | BB_B ____ _B__-
		//              |            |              |   B  BB-- B --
		// 89:88:B2@1,7 | BBBBB BBB- | 89:88:B2@1,7 | BB_B ____ _B__-
		//              |            |              |   B  BB-- B --
		// 90:88:B4@6,8 | B-------   | 90:88:B4@6,8 | BB_B ____ _B--
		//              |            |              |   B  BB-- B
		it("obliterate with mergeTree insert fails", () => {
			const clients = createClientsAtInitialState(
				{
					initialState: "BBBBB BBB",
					options: { mergeTreeEnableObliterate: true, mergeTreeEnableSidedObliterate: true },
				},
				"A",
				"B",
			);
			let seq = 0;
			const logger = new TestClientLogger(clients.all);
			const ops: ISequencedDocumentMessage[] = [];
			const b = clients.B;

			ops.push(
				b.makeOpMessage(b.annotateRangeLocal(1, 7, { foo: 1 }), ++seq),
				b.makeOpMessage(
					b.obliterateRangeLocal({ pos: 6, side: Side.Before }, { pos: 8, side: Side.Before }),
					++seq,
				),
				b.makeOpMessage(b.insertTextLocal(5, "B"), ++seq),
				b.makeOpMessage(b.insertTextLocal(2, "B"), ++seq),
				b.makeOpMessage(b.removeRangeLocal(4, 6), ++seq),
				b.makeOpMessage(b.insertTextLocal(4, "B"), ++seq),
				b.makeOpMessage(b.annotateRangeLocal(0, 7, { bar: 2 }), ++seq),
			);

			for (const op of ops.splice(0))
				for (const c of clients.all) {
					c.applyMsg(op);
				}

			logger.validate({ baseText: "BBBBBB B" });
		});
		it.skip("obliterate with mismatched final states", () => {
			const clients = createClientsAtInitialState(
				{
					initialState: "B{6666666}BBB{666666}BB",
					options: {
						mergeTreeEnableObliterate: true,
						mergeTreeEnableSidedObliterate: true,
						mergeTreeEnableAnnotateAdjust: true,
					},
				},
				"A",
				"B",
			);
			let seq = 0;
			const logger = new TestClientLogger(clients.all);
			const ops: ISequencedDocumentMessage[] = [];
			const b = clients.B;

			ops.push(
				// no way to know if annotates are regular or adjust
				b.makeOpMessage(b.annotateRangeLocal(12, 21, { foo: 1 }), ++seq),
				b.makeOpMessage(
					b.obliterateRangeLocal({ pos: 1, side: Side.After }, { pos: 9, side: Side.Before }),
					++seq,
				),
				b.makeOpMessage(b.insertTextLocal(2, "66"), ++seq),
				b.makeOpMessage(b.insertTextLocal(8, "BB"), ++seq),
				b.makeOpMessage(
					b.obliterateRangeLocal({ pos: 1, side: Side.After }, { pos: 4, side: Side.Before }),
					++seq,
				),
				b.makeOpMessage(b.insertTextLocal(2, "6666666666"), ++seq),
			);

			for (const op of ops.splice(0))
				for (const c of clients.all) {
					c.applyMsg(op);
				}

			logger.validate({ baseText: "B{66666666}BBBBB{666666}BB" });
		});
	});

	describe("updates minSeq", () => {
		it("to the message's minSeq with no ops in flight", () => {
			const localClient = new TestClient();
			const remoteClient = new TestClient();
			const ops: ISequencedDocumentMessage[] = [];
			localClient.startOrUpdateCollaboration(localUserLongId);
			remoteClient.startOrUpdateCollaboration(remoteUserLongId);
			ops.push(
				localClient.makeOpMessage(
					localClient.insertTextLocal(0, "hello world"),
					1,
					0,
					localUserLongId,
					0,
				),
			);

			for (const op of ops.splice(0)) {
				localClient.applyMsg(op);
				remoteClient.applyMsg(op);
			}

			assert.equal(localClient.getCollabWindow().minSeq, 0);
			assert.equal(remoteClient.getCollabWindow().minSeq, 0);

			ops.push(
				localClient.makeOpMessage(
					localClient.insertTextLocal(0, "abc"),
					/* seq */ 17,
					/* refSeq */ 16,
					localUserLongId,
					/* minSeq */ 16,
				),
			);

			for (const op of ops.splice(0)) {
				localClient.applyMsg(op);
				remoteClient.applyMsg(op);
			}

			assert.equal(localClient.getCollabWindow().minSeq, 16);
			assert.equal(remoteClient.getCollabWindow().minSeq, 16);
		});

		it("to the minimum of in-flight messages and the acked message's minSeq", () => {
			let localInFlightRefSeq: number | undefined;
			const localClient = new TestClient(undefined, undefined, () => localInFlightRefSeq);
			const remoteClient = new TestClient();
			const ops: ISequencedDocumentMessage[] = [];
			localClient.startOrUpdateCollaboration(localUserLongId);
			remoteClient.startOrUpdateCollaboration(remoteUserLongId);
			localInFlightRefSeq = 0;

			const resubmittedOp = localClient.insertTextLocal(0, "hello world");
			// Note: *don't* add this to list of sequenced ops, since if the refSeq of an in-flight op trails
			// behind the minSeq of an acked op, the in-flight op must eventually be nacked.
			// This call to make a message is unnecessary for the test purposes, but would happen in a production scenario
			// (it's the message that would be sent to the server and nacked).
			localClient.makeOpMessage(resubmittedOp, 1, localInFlightRefSeq, localUserLongId, 0);

			ops.push(
				remoteClient.makeOpMessage(
					remoteClient.insertTextLocal(0, "abc"),
					/* seq */ 17,
					/* refSeq */ 16,
					remoteUserLongId,
					/* minSeq */ 16,
				),
			);

			for (const op of ops.splice(0)) {
				localClient.applyMsg(op);
				remoteClient.applyMsg(op);
			}

			assert.equal(localClient.getCollabWindow().minSeq, 0);
			assert.equal(remoteClient.getCollabWindow().minSeq, 16);

			ops.push(
				localClient.makeOpMessage(
					localClient.regeneratePendingOp(
						resubmittedOp!,
						localClient.peekPendingSegmentGroups()!,
					),
					/* seq */ 18,
					/* refSeq */ 16,
					localUserLongId,
					/* minSeq */ 16,
				),
			);
			localInFlightRefSeq = 16;

			for (const op of ops.splice(0)) {
				localClient.applyMsg(op);
				remoteClient.applyMsg(op);
			}

			assert.equal(localClient.getCollabWindow().minSeq, 16);
			assert.equal(remoteClient.getCollabWindow().minSeq, 16);
		});
	});
});
