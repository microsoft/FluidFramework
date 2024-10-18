/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { isNullOrUndefined } from "util";

import {
	IMergeTreeDeltaCallbackArgs,
	PropertySet,
	TextSegment,
	createAnnotateRangeOp,
	createInsertSegmentOp,
	createRemoveRangeOp,
} from "@fluidframework/merge-tree/internal";
import { TestClient } from "@fluidframework/merge-tree/internal/test";

import { SequenceDeltaEventClass } from "../sequenceDeltaEvent.js";

interface IExpectedSegmentInfo {
	offset: number;
	numChar: number;
	props: PropertySet;
	propDeltas?: PropertySet;
	text?: string;
}

describe("non-collab", () => {
	const userId = "localUser";
	let client: TestClient;

	describe("insert", () => {
		before(() => {
			client = new TestClient();
			client.startOrUpdateCollaboration(userId);
		});

		const initialText = "done";
		const beginningText = "What's ";
		const middleText = " is";
		const endText = " done";

		it("initially", () => {
			insertText(0, initialText);
		});

		it("in the beginning", () => {
			insertText(0, beginningText);
		});

		it("in the end", () => {
			insertText(client.getLength(), endText);
		});

		it("in the middle", () => {
			insertText(initialText.length + beginningText.length, middleText);
		});

		function insertText(offset: number, text: string): void {
			let deltaArgs: IMergeTreeDeltaCallbackArgs | undefined;
			client.on("delta", (opArgs, delta) => {
				deltaArgs = delta;
			});
			const op = client.insertTextLocal(offset, text);

			assert(deltaArgs);
			assert.equal(deltaArgs.deltaSegments.length, 1);

			assert(op);
			const event = new SequenceDeltaEventClass({ op }, deltaArgs, client);

			assert(event.isLocal);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.position, offset);
			assert.equal(event.first.segment.cachedLength, text.length);
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				offset + text.length,
			);
			const segment = event.first.segment as TextSegment;
			assert.equal(segment.text, text);
		}
	});

	describe("remove", () => {
		before(() => {
			client = new TestClient();
			client.insertTextLocal(0, "All is well!");
			client.startOrUpdateCollaboration(userId);
		});

		it("from the middle", () => {
			removeText(3, 7);
		});

		it("from the beginning", () => {
			removeText(0, 3);
		});

		it("from the end", () => {
			removeText(4, 5);
		});

		it("all", () => {
			removeText(0, client.getLength());
		});

		function removeText(start: number, end: number): void {
			let deltaArgs: IMergeTreeDeltaCallbackArgs | undefined;
			client.on("delta", (opArgs, delta) => {
				deltaArgs = delta;
			});
			const op = client.removeRangeLocal(start, end);

			assert(deltaArgs);
			assert.equal(deltaArgs.deltaSegments.length, 1);

			assert(op);
			const event = new SequenceDeltaEventClass({ op }, deltaArgs, client);

			assert(event.isLocal);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.position, start);
			assert.equal(event.first.segment.cachedLength, end - start);
			assert.equal(event.last.position + event.last.segment.cachedLength, end);
		}
	});

	describe("annotate", () => {
		before(() => {
			client = new TestClient();
			client.insertTextLocal(0, "All is well!");
			client.startOrUpdateCollaboration(userId);
		});

		it("add property over separate range", () => {
			annotateText(0, 3, { foo1: "bar1" }, [
				{ offset: 0, numChar: 3, props: { foo1: "bar1" }, propDeltas: { foo1: null } },
			]);

			annotateText(3, 7, { foo2: "bar2" }, [
				{ offset: 3, numChar: 4, props: { foo2: "bar2" }, propDeltas: { foo2: null } },
			]);

			annotateText(7, client.getLength(), { foo3: "bar3" }, [
				{ offset: 7, numChar: 5, props: { foo3: "bar3" }, propDeltas: { foo3: null } },
			]);
		});

		it("add property over overlapping runs", () => {
			annotateText(2, 10, { foo: "bar" }, [
				{
					offset: 2,
					numChar: 1,
					props: { foo: "bar", foo1: "bar1" },
					propDeltas: { foo: null },
				},
				{
					offset: 3,
					numChar: 4,
					props: { foo: "bar", foo2: "bar2" },
					propDeltas: { foo: null },
				},
				{
					offset: 7,
					numChar: 3,
					props: { foo: "bar", foo3: "bar3" },
					propDeltas: { foo: null },
				},
			]);
		});

		it("nullify all properties", () => {
			annotateText(2, 10, { foo: null }, [
				{
					offset: 2,
					numChar: 1,
					props: { foo: undefined, foo1: "bar1" },
					propDeltas: { foo: "bar" },
				},
				{
					offset: 3,
					numChar: 4,
					props: { foo: undefined, foo2: "bar2" },
					propDeltas: { foo: "bar" },
				},
				{
					offset: 7,
					numChar: 3,
					props: { foo: undefined, foo3: "bar3" },
					propDeltas: { foo: "bar" },
				},
			]);

			annotateText(2, 3, { foo1: null }, [
				{
					offset: 2,
					numChar: 1,
					props: { foo: undefined, foo1: undefined },
					propDeltas: { foo1: "bar1" },
				},
			]);

			annotateText(3, 7, { foo2: null }, [
				{
					offset: 3,
					numChar: 4,
					props: { foo: undefined, foo2: undefined },
					propDeltas: { foo2: "bar2" },
				},
			]);

			annotateText(7, 10, { foo3: null }, [
				{
					offset: 7,
					numChar: 3,
					props: { foo: undefined, foo3: undefined },
					propDeltas: { foo3: "bar3" },
				},
			]);
		});

		function annotateText(
			start: number,
			end: number,
			newProps: PropertySet,
			expected: IExpectedSegmentInfo[],
		): void {
			let deltaArgs: IMergeTreeDeltaCallbackArgs | undefined;
			client.on("delta", (opArgs, delta) => {
				deltaArgs = delta;
			});
			const op = client.annotateRangeLocal(start, end, newProps);

			assert(deltaArgs);
			assert.equal(deltaArgs.deltaSegments.length, expected.length);

			assert(op);
			const event = new SequenceDeltaEventClass({ op }, deltaArgs, client);

			assert(event.isLocal);
			assert.equal(event.first.position, start);
			assert.equal(event.last.position + event.last.segment.cachedLength, end);
			assert.equal(event.ranges.length, expected.length);
			for (let i = 0; i < expected.length; i = i + 1) {
				assert.equal(event.ranges[i].position, expected[i].offset);
				assert.equal(event.ranges[i].segment.cachedLength, expected[i].numChar);
				assert.equal(
					Object.entries(event.ranges[i].segment.properties ?? {}).filter(
						([k, v]) => v !== undefined,
					).length,
					Object.entries(expected[i].props).filter(([k, v]) => v !== undefined).length,
				);
				for (const key of Object.keys(event.ranges[i].segment.properties ?? {})) {
					assert.equal(event.ranges[i].segment.properties?.[key], expected[i].props[key]);
				}
				if (expected[i].propDeltas !== undefined) {
					assert.equal(
						Object.keys(event.ranges[i].propertyDeltas).length,
						Object.keys(expected[i].propDeltas ?? {}).length,
					);
					for (const key of Object.keys(event.ranges[i].propertyDeltas)) {
						assert.equal(event.ranges[i].propertyDeltas[key], expected[i].propDeltas?.[key]);
					}
				} else {
					assert(event.ranges[i].propertyDeltas === undefined);
				}
			}
		}
	});
});

describe("collab", () => {
	const localUserId = "localUser";
	const remoteUserId = "remoteUser";
	let client: TestClient;

	describe("insert", () => {
		beforeEach(() => {
			client = new TestClient();
			client.insertTextLocal(0, "The fox jumps over the dog");
			client.startOrUpdateCollaboration(localUserId);
		});

		it("separate regions, local before remote", () => {
			const localInsertPos = 4; // before "brown"
			const localInsertText = "quick brown ";
			const remoteInsertPos = client.getLength() - 3; // before "dog"
			const remoteInsertText = "lazy ";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localInsertMessage = client.makeOpMessage(
				client.insertTextLocal(localInsertPos, localInsertText),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			client.applyMsg(localInsertMessage);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, localInsertPos);
			assert.equal(event.last.position, localInsertPos);
			assert.equal(event.first.segment.cachedLength, localInsertText.length);
			assert.equal(event.last.segment.cachedLength, localInsertText.length);
			assert.equal(event.ranges.length, 1);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, localInsertText);

			const remoteInsertMessage = client.makeOpMessage(
				createInsertSegmentOp(remoteInsertPos, new TextSegment(remoteInsertText)),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
				remoteUserId,
			);

			client.applyMsg(remoteInsertMessage);

			assert(!event.isLocal);
			assert.equal(event.first.position, remoteInsertPos + localInsertText.length);
			assert.equal(event.last.position, remoteInsertPos + localInsertText.length);
			assert.equal(event.first.segment.cachedLength, remoteInsertText.length);
			assert.equal(event.last.segment.cachedLength, remoteInsertText.length);
			assert.equal(event.ranges.length, 1);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, remoteInsertText);
		});

		it("separate regions, remote before local", () => {
			const localInsertPos = client.getLength() - 3; // before "dog"
			const localInsertText = "lazy ";
			const remoteInsertPos = 4; // before "fox"
			const remoteInsertText = "quick brown ";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localInsertMessage = client.makeOpMessage(
				client.insertTextLocal(localInsertPos, localInsertText),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
			);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, localInsertPos);
			assert.equal(event.last.position, localInsertPos);
			assert.equal(event.first.segment.cachedLength, localInsertText.length);
			assert.equal(event.last.segment.cachedLength, localInsertText.length);
			assert.equal(event.ranges.length, 1);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, localInsertText);

			const remoteInsertMessage = client.makeOpMessage(
				createInsertSegmentOp(remoteInsertPos, new TextSegment(remoteInsertText)),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
				remoteUserId,
			);

			client.applyMsg(remoteInsertMessage);

			client.applyMsg(localInsertMessage);

			assert(!event.isLocal);
			assert.equal(event.first.position, remoteInsertPos);
			assert.equal(event.last.position, remoteInsertPos);
			assert.equal(event.first.segment.cachedLength, remoteInsertText.length);
			assert.equal(event.last.segment.cachedLength, remoteInsertText.length);
			assert.equal(event.ranges.length, 1);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, remoteInsertText);
		});

		it("at same position, local before remote", () => {
			const localInsertPos = 4; // before "fox"
			const localInsertText = "brown ";
			const remoteInsertPos = 4; // before "fox"
			const remoteInsertText = "quick ";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localInsertMessage = client.makeOpMessage(
				client.insertTextLocal(localInsertPos, localInsertText),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			client.applyMsg(localInsertMessage);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, localInsertPos);
			assert.equal(event.last.position, localInsertPos);
			assert.equal(event.first.segment.cachedLength, localInsertText.length);
			assert.equal(event.last.segment.cachedLength, localInsertText.length);
			assert.equal(event.ranges.length, 1);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, localInsertText);

			const remoteInsertMessage = client.makeOpMessage(
				createInsertSegmentOp(remoteInsertPos, new TextSegment(remoteInsertText)),
				currentSeqNumber + 2,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteInsertMessage);

			assert(!event.isLocal);
			assert.equal(event.first.position, remoteInsertPos);
			assert.equal(event.last.position, remoteInsertPos);
			assert.equal(event.first.segment.cachedLength, remoteInsertText.length);
			assert.equal(event.last.segment.cachedLength, remoteInsertText.length);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.position, remoteInsertPos);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, remoteInsertText);
		});

		it("at same position, remote before local", () => {
			const localInsertPos = 4; // before "fox"
			const localInsertText = "quick ";
			const remoteInsertPos = 4; // before "fox"
			const remoteInsertText = "brown ";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localInsertMessage = client.makeOpMessage(
				client.insertTextLocal(localInsertPos, localInsertText),
				currentSeqNumber + 2,
				currentSeqNumber, // refseq
			);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.position, localInsertPos);
			assert.equal(event.last.position, localInsertPos);
			assert.equal(event.first.segment.cachedLength, localInsertText.length);
			assert.equal(event.last.segment.cachedLength, localInsertText.length);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, localInsertText);

			const remoteInsertMessage = client.makeOpMessage(
				createInsertSegmentOp(remoteInsertPos, new TextSegment(remoteInsertText)),
				currentSeqNumber + 1,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteInsertMessage);

			client.applyMsg(localInsertMessage);

			assert(!event.isLocal);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.position, remoteInsertPos + localInsertText.length);
			assert.equal(event.last.position, remoteInsertPos + localInsertText.length);
			assert.equal(event.first.segment.cachedLength, remoteInsertText.length);
			assert.equal(event.last.segment.cachedLength, remoteInsertText.length);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, remoteInsertText);
		});

		it("overlapping regions, local before remote", () => {
			const localInsertPos = 4; // before "fox"
			const localInsertText = "quick brown ";
			const remoteInsertPos = 3; // before "fox"
			const remoteInsertText = " legendary";

			// output: The legendary quick brown fox jumps over the dog

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localInsertMessage = client.makeOpMessage(
				client.insertTextLocal(localInsertPos, localInsertText),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			client.applyMsg(localInsertMessage);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, localInsertPos);
			assert.equal(event.last.position, localInsertPos);
			assert.equal(event.first.segment.cachedLength, localInsertText.length);
			assert.equal(event.last.segment.cachedLength, localInsertText.length);
			assert.equal(event.ranges.length, 1);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, localInsertText);

			const remoteInsertMessage = client.makeOpMessage(
				createInsertSegmentOp(remoteInsertPos, new TextSegment(remoteInsertText)),
				currentSeqNumber + 2,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteInsertMessage);

			assert(!event.isLocal);
			assert.equal(event.first.position, remoteInsertPos);
			assert.equal(event.last.position, remoteInsertPos);
			assert.equal(event.first.segment.cachedLength, remoteInsertText.length);
			assert.equal(event.last.segment.cachedLength, remoteInsertText.length);
			assert.equal(event.ranges.length, 1);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, remoteInsertText);
		});

		it("overlapping regions, remote before local", () => {
			const localInsertPos = 3; // before "fox"
			const localInsertText = " legendary";
			const remoteInsertPos = 4; // before "fox"
			const remoteInsertText = "quick brown ";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localInsertMessage = client.makeOpMessage(
				client.insertTextLocal(localInsertPos, localInsertText),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
			);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, localInsertPos);
			assert.equal(event.last.position, localInsertPos);
			assert.equal(event.first.segment.cachedLength, localInsertText.length);
			assert.equal(event.last.segment.cachedLength, localInsertText.length);
			assert.equal(event.ranges.length, 1);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, localInsertText);

			const remoteInsertMessage = client.makeOpMessage(
				createInsertSegmentOp(remoteInsertPos, new TextSegment(remoteInsertText)),
				currentSeqNumber + 1,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteInsertMessage);

			client.applyMsg(localInsertMessage);

			assert(!event.isLocal);
			assert.equal(event.first.position, remoteInsertPos + localInsertText.length);
			assert.equal(event.last.position, remoteInsertPos + localInsertText.length);
			assert.equal(event.first.segment.cachedLength, remoteInsertText.length);
			assert.equal(event.last.segment.cachedLength, remoteInsertText.length);
			assert.equal(event.ranges.length, 1);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, remoteInsertText);
		});

		it("overlapping regions, multiple inserts: local, remote, remoteAfterLocal", () => {
			const localInsertPos = 4; // before "fox"
			const localInsertText = "brown ";
			const remoteInsertPos1 = 4; // before "fox", and before local update
			const remoteInsertText1 = "quick ";
			// before "fox", but after local update
			const remoteInsertPos2 =
				client.getLength() - 3 + localInsertText.length + remoteInsertText1.length;
			const remoteInsertText2 = "lazy ";

			// output: The quick brown fox jumps over the lazy dog

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localInsertMessage = client.makeOpMessage(
				client.insertTextLocal(localInsertPos, localInsertText),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			client.applyMsg(localInsertMessage);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, localInsertPos);
			assert.equal(event.last.position, localInsertPos);
			assert.equal(event.first.segment.cachedLength, localInsertText.length);
			assert.equal(event.last.segment.cachedLength, localInsertText.length);
			assert.equal(event.ranges.length, 1);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, localInsertText);

			const remoteInsertMessage1 = client.makeOpMessage(
				createInsertSegmentOp(remoteInsertPos1, new TextSegment(remoteInsertText1)),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
				remoteUserId,
			);

			client.applyMsg(remoteInsertMessage1);

			assert(!event.isLocal);
			assert.equal(event.first.position, remoteInsertPos1);
			assert.equal(event.last.position, remoteInsertPos1);
			assert.equal(event.first.segment.cachedLength, remoteInsertText1.length);
			assert.equal(event.last.segment.cachedLength, remoteInsertText1.length);
			assert.equal(event.ranges.length, 1);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, remoteInsertText1);

			const remoteInsertMessage2 = client.makeOpMessage(
				createInsertSegmentOp(remoteInsertPos2, new TextSegment(remoteInsertText2)),
				currentSeqNumber + 3,
				currentSeqNumber + 1, // refseqnum
				remoteUserId,
			);

			client.applyMsg(remoteInsertMessage2);

			assert(!event.isLocal);
			assert.equal(event.first.position, remoteInsertPos2);
			assert.equal(event.last.position, remoteInsertPos2);
			assert.equal(event.first.segment.cachedLength, remoteInsertText2.length);
			assert.equal(event.last.segment.cachedLength, remoteInsertText2.length);
			assert.equal(event.ranges.length, 1);
			const segment3 = event.first.segment as TextSegment;
			assert.equal(segment3.text, remoteInsertText2);
		});

		it("overlapping regions, multiple inserts: remote, local, localAfterRemote", () => {
			const localInsertPos1 = 4; // before "fox"
			const localInsertText1 = "quick ";
			const remoteInsertPos = 4; // before "fox", and before local update
			const remoteInsertText = "brown ";
			// before "dog", after local update
			const localInsertPos2 =
				client.getLength() - 3 + remoteInsertText.length + localInsertText1.length;
			const localInsertText2 = "lazy ";

			// output: The quick brown fox jumps over the lazy dog

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localInsertMessage1 = client.makeOpMessage(
				client.insertTextLocal(localInsertPos1, localInsertText1),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
			);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, localInsertPos1);
			assert.equal(event.last.position, localInsertPos1);
			assert.equal(event.first.segment.cachedLength, localInsertText1.length);
			assert.equal(event.last.segment.cachedLength, localInsertText1.length);
			assert.equal(event.ranges.length, 1);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, localInsertText1);

			const remoteInsertMessage = client.makeOpMessage(
				createInsertSegmentOp(remoteInsertPos, new TextSegment(remoteInsertText)),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
				remoteUserId,
			);

			client.applyMsg(remoteInsertMessage);

			client.applyMsg(localInsertMessage1);

			assert(!event.isLocal);
			assert.equal(event.first.position, remoteInsertPos + localInsertText1.length);
			assert.equal(event.last.position, remoteInsertPos + localInsertText1.length);
			assert.equal(event.first.segment.cachedLength, remoteInsertText.length);
			assert.equal(event.last.segment.cachedLength, remoteInsertText.length);
			assert.equal(event.ranges.length, 1);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, remoteInsertText);

			const localInsertMessage2 = client.makeOpMessage(
				client.insertTextLocal(localInsertPos2, localInsertText2),
				currentSeqNumber + 3,
				currentSeqNumber + 1, // refseqnum
			);

			client.applyMsg(localInsertMessage2);

			assert(event.isLocal);
			assert.equal(event.first.position, localInsertPos2);
			assert.equal(event.last.position, localInsertPos2);
			assert.equal(event.first.segment.cachedLength, localInsertText2.length);
			assert.equal(event.last.segment.cachedLength, localInsertText2.length);
			assert.equal(event.ranges.length, 1);
			const segment3 = event.first.segment as TextSegment;
			assert.equal(segment3.text, localInsertText2);
		});
	});

	describe("delete", () => {
		beforeEach(() => {
			client = new TestClient();
			client.insertTextLocal(0, "The quick brown fox jumps over the lazy dog");
			client.startOrUpdateCollaboration(localUserId);
		});

		it("separate regions, local before remote", () => {
			const localRemovePosStart = 4; // "quick "
			const localRemovePosEnd = localRemovePosStart + 6;
			const remoteRemovePosStart = client.getLength() - 8; // "lazy "
			const remoteRemovePosEnd = remoteRemovePosStart + 5;

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localRemoveMessage = client.makeOpMessage(
				client.removeRangeLocal(localRemovePosStart, localRemovePosEnd),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			client.applyMsg(localRemoveMessage);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, localRemovePosStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, localRemovePosEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, localRemovePosEnd - localRemovePosStart);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, "quick ");

			const remoteRemoveMessage = client.makeOpMessage(
				createRemoveRangeOp(remoteRemovePosStart, remoteRemovePosEnd),
				currentSeqNumber + 2,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteRemoveMessage);

			assert(!event.isLocal);
			assert.equal(
				event.first.position,
				remoteRemovePosStart - localRemovePosEnd + localRemovePosStart,
			);
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				remoteRemovePosEnd - localRemovePosEnd + localRemovePosStart,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(
				event.first.segment.cachedLength,
				remoteRemovePosEnd - remoteRemovePosStart,
			);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, "lazy ");
		});

		it("separate regions, remote before local", () => {
			const localRemovePosStart = 4; // "quick "
			const localRemovePosEnd = localRemovePosStart + 6;
			const remoteRemovePosStart = client.getLength() - 8; // "lazy "
			const remoteRemovePosEnd = remoteRemovePosStart + 5;

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localRemoveMessage = client.makeOpMessage(
				client.removeRangeLocal(localRemovePosStart, localRemovePosEnd),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
			);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, localRemovePosStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, localRemovePosEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, localRemovePosEnd - localRemovePosStart);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, "quick ");

			const remoteRemoveMessage = client.makeOpMessage(
				createRemoveRangeOp(remoteRemovePosStart, remoteRemovePosEnd),
				currentSeqNumber + 1,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteRemoveMessage);

			client.applyMsg(localRemoveMessage);

			assert(!event.isLocal);
			assert.equal(
				event.first.position,
				remoteRemovePosStart - localRemovePosEnd + localRemovePosStart,
			);
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				remoteRemovePosEnd - localRemovePosEnd + localRemovePosStart,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(
				event.first.segment.cachedLength,
				remoteRemovePosEnd - remoteRemovePosStart,
			);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, "lazy ");
		});

		it("overlapping regions, same range, local before remote", () => {
			const localRemovePosStart = 4; // "quick brown "
			const localRemovePosEnd = localRemovePosStart + 12;
			const remoteRemovePosStart = 4; // "quick brown "
			const remoteRemovePosEnd = remoteRemovePosStart + 12;

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			const events: SequenceDeltaEventClass[] = [];
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				events.push(new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client));
			});

			const localRemoveMessage = client.makeOpMessage(
				client.removeRangeLocal(localRemovePosStart, localRemovePosEnd),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			client.applyMsg(localRemoveMessage);

			assert.equal(events.length, 1);
			const [event] = events;
			assert(event.isLocal);
			assert.equal(event.first.position, localRemovePosStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, localRemovePosEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, localRemovePosEnd - localRemovePosStart);
			const segment = event.first.segment as TextSegment;
			assert.equal(segment.text, "quick brown ");

			const remoteRemoveMessage = client.makeOpMessage(
				createRemoveRangeOp(remoteRemovePosStart, remoteRemovePosEnd),
				currentSeqNumber + 2,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteRemoveMessage);

			// No new event should be emitted since the delta is empty.
			assert.equal(events.length, 1);
		});

		it("overlapping regions, same range, remote before local", () => {
			const localRemovePosStart = 4; // "quick brown "
			const localRemovePosEnd = localRemovePosStart + 12;
			const remoteRemovePosStart = 4; // "quick brown "
			const remoteRemovePosEnd = remoteRemovePosStart + 12;

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			const events: SequenceDeltaEventClass[] = [];
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				events.push(new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client));
			});

			const localRemoveMessage = client.makeOpMessage(
				client.removeRangeLocal(localRemovePosStart, localRemovePosEnd),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
			);

			assert.equal(events.length, 1);
			const [event] = events;
			assert(event.isLocal);
			assert.equal(event.first.position, localRemovePosStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, localRemovePosEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, localRemovePosEnd - localRemovePosStart);
			const segment = event.first.segment as TextSegment;
			assert.equal(segment.text, "quick brown ");

			const remoteRemoveMessage = client.makeOpMessage(
				createRemoveRangeOp(remoteRemovePosStart, remoteRemovePosEnd),
				currentSeqNumber + 1,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteRemoveMessage);

			client.applyMsg(localRemoveMessage);

			// No new event should be emitted since the delta is empty.
			assert.equal(events.length, 1);
		});

		it("overlapping regions, local shadows remote, local before remote", () => {
			const localRemovePosStart = 4; // "quick brown "
			const localRemovePosEnd = localRemovePosStart + 12;
			const remoteRemovePosStart = 10; // "brown"
			const remoteRemovePosEnd = remoteRemovePosStart + 5;

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			const events: SequenceDeltaEventClass[] = [];
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				events.push(new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client));
			});

			const localRemoveMessage = client.makeOpMessage(
				client.removeRangeLocal(localRemovePosStart, localRemovePosEnd),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			client.applyMsg(localRemoveMessage);

			assert.equal(events.length, 1);
			const [event] = events;
			assert(event.isLocal);
			assert.equal(event.first.position, localRemovePosStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, localRemovePosEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, localRemovePosEnd - localRemovePosStart);
			const segment = event.first.segment as TextSegment;
			assert.equal(segment.text, "quick brown ");

			const remoteRemoveMessage = client.makeOpMessage(
				createRemoveRangeOp(remoteRemovePosStart, remoteRemovePosEnd),
				currentSeqNumber + 2,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteRemoveMessage);

			// No new event should be emitted since the delta is empty.
			assert.equal(events.length, 1);
		});

		it("overlapping regions, local shadows remote, remote before local", () => {
			const localRemovePosStart = 4; // "quick brown "
			const localRemovePosEnd = localRemovePosStart + 12;
			const remoteRemovePosStart = 10; // "brown"
			const remoteRemovePosEnd = remoteRemovePosStart + 5;

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			const events: SequenceDeltaEventClass[] = [];
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				events.push(new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client));
			});
			const localRemoveMessage = client.makeOpMessage(
				client.removeRangeLocal(localRemovePosStart, localRemovePosEnd),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
			);

			assert.equal(events.length, 1);
			const [event] = events;
			assert(event.isLocal);
			assert.equal(event.first.position, localRemovePosStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, localRemovePosEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, localRemovePosEnd - localRemovePosStart);
			const segment = event.first.segment as TextSegment;
			assert.equal(segment.text, "quick brown ");

			const remoteRemoveMessage = client.makeOpMessage(
				createRemoveRangeOp(remoteRemovePosStart, remoteRemovePosEnd),
				currentSeqNumber + 1,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteRemoveMessage);

			client.applyMsg(localRemoveMessage);

			// No new event should be emitted since the delta is empty.
			assert.equal(events.length, 1);
		});

		it("overlapping regions, local range precedes remote range, local before remote", () => {
			// space after "quick" is the overlap
			const localRemovePosStart = 4; // "quick "
			const localRemovePosEnd = localRemovePosStart + 6;
			const remoteRemovePosStart = 9; // " brown "
			const remoteRemovePosEnd = remoteRemovePosStart + 7;

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localRemoveMessage = client.makeOpMessage(
				client.removeRangeLocal(localRemovePosStart, localRemovePosEnd),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			client.applyMsg(localRemoveMessage);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, localRemovePosStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, localRemovePosEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, localRemovePosEnd - localRemovePosStart);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, "quick ");

			const remoteRemoveMessage = client.makeOpMessage(
				createRemoveRangeOp(remoteRemovePosStart, remoteRemovePosEnd),
				currentSeqNumber + 2,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteRemoveMessage);

			// start = remoteRemovePosStart - localRemovePosEnd + localRemovePosStart + 1
			// 1 is for overlapping character
			const start = 4;
			// end = 4 + 7 - 1
			const end = 10;

			assert(!event.isLocal);
			assert.equal(event.first.position, start);
			assert.equal(event.last.position + event.last.segment.cachedLength, end);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, end - start);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, "brown ");
		});

		it("overlapping regions, local range precedes remote range, remote before local", () => {
			// space after "quick" is the overlap
			const localRemovePosStart = 4; // "quick "
			const localRemovePosEnd = localRemovePosStart + 6;
			const remoteRemovePosStart = 9; // " brown "
			const remoteRemovePosEnd = remoteRemovePosStart + 7;

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localRemoveMessage = client.makeOpMessage(
				client.removeRangeLocal(localRemovePosStart, localRemovePosEnd),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
			);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, localRemovePosStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, localRemovePosEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, localRemovePosEnd - localRemovePosStart);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, "quick ");

			const remoteRemoveMessage = client.makeOpMessage(
				createRemoveRangeOp(remoteRemovePosStart, remoteRemovePosEnd),
				currentSeqNumber + 1,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteRemoveMessage);

			client.applyMsg(localRemoveMessage);

			// start = remoteRemovePosStart - localRemovePosEnd + localRemovePosStart + 1
			// 1 is for overlapping character
			const start = 4;
			// end = 4 + 7 - 1
			const end = 10;

			assert(!event.isLocal);
			assert.equal(event.first.position, start);
			assert.equal(event.last.position + event.last.segment.cachedLength, end);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, end - start);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, "brown ");
		});

		it("overlapping regions, remote range precedes local range, local before remote", () => {
			// space after "quick" is the overlap
			const localRemovePosStart = 9; // " brown "
			const localRemovePosEnd = localRemovePosStart + 7;
			const remoteRemovePosStart = 4; // "quick "
			const remoteRemovePosEnd = remoteRemovePosStart + 6;

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localRemoveMessage = client.makeOpMessage(
				client.removeRangeLocal(localRemovePosStart, localRemovePosEnd),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			client.applyMsg(localRemoveMessage);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, localRemovePosStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, localRemovePosEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, localRemovePosEnd - localRemovePosStart);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, " brown ");

			const remoteRemoveMessage = client.makeOpMessage(
				createRemoveRangeOp(remoteRemovePosStart, remoteRemovePosEnd),
				currentSeqNumber + 2,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteRemoveMessage);

			// start = remoteRemovePosStart - localRemovePosEnd + localRemovePosStart + 1
			// 1 is for overlapping character
			const start = 4;
			// end = 4 + 6 - 1
			const end = 9;

			assert(!event.isLocal);
			assert.equal(event.first.position, start);
			assert.equal(event.last.position + event.last.segment.cachedLength, end);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, end - start);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, "quick");
		});

		it("overlapping regions, remote range precedes local range, remote before local", () => {
			// space after "quick" is the overlap
			const localRemovePosStart = 9; // " brown "
			const localRemovePosEnd = localRemovePosStart + 7;
			const remoteRemovePosStart = 4; // "quick "
			const remoteRemovePosEnd = remoteRemovePosStart + 6;

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localRemoveMessage = client.makeOpMessage(
				client.removeRangeLocal(localRemovePosStart, localRemovePosEnd),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
			);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, localRemovePosStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, localRemovePosEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, localRemovePosEnd - localRemovePosStart);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, " brown ");

			const remoteRemoveMessage = client.makeOpMessage(
				createRemoveRangeOp(remoteRemovePosStart, remoteRemovePosEnd),
				currentSeqNumber + 1,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteRemoveMessage);

			client.applyMsg(localRemoveMessage);

			// start = remoteRemovePosStart - localRemovePosEnd + localRemovePosStart + 1
			// 1 is for overlapping character
			const start = 4;
			// end = 4 + 6 - 1
			const end = 9;

			assert(!event.isLocal);
			assert.equal(event.first.position, start);
			assert.equal(event.last.position + event.last.segment.cachedLength, end);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, end - start);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, "quick");
		});

		it("overlapping regions, remote shadows local, local before remote", () => {
			const localRemovePosStart = 10; // "brown"
			const localRemovePosEnd = localRemovePosStart + 5;
			const remoteRemovePosStart = 4; // "quick brown "
			const remoteRemovePosEnd = remoteRemovePosStart + 12;

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localRemoveMessage = client.makeOpMessage(
				client.removeRangeLocal(localRemovePosStart, localRemovePosEnd),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			client.applyMsg(localRemoveMessage);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, localRemovePosStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, localRemovePosEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, localRemovePosEnd - localRemovePosStart);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, "brown");

			const remoteRemoveMessage = client.makeOpMessage(
				createRemoveRangeOp(remoteRemovePosStart, remoteRemovePosEnd),
				currentSeqNumber + 2,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteRemoveMessage);

			assert(!event.isLocal);
			assert.equal(event.ranges.length, 2);
			assert.equal(event.first.position, remoteRemovePosStart);
			// -1 is for split
			assert.equal(event.first.segment.cachedLength, "quick ".length);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, "quick ");
			assert.equal(event.ranges[1].position, remoteRemovePosStart);
			// -1 is for split
			assert.equal(event.ranges[1].segment.cachedLength, " ".length);
			const segment3 = event.ranges[1].segment as TextSegment;
			assert.equal(segment3.text, " ");
		});

		it("overlapping regions, remote shadows local, remote before local", () => {
			const localRemovePosStart = 10; // "brown"
			const localRemovePosEnd = localRemovePosStart + 5;
			const remoteRemovePosStart = 4; // "quick brown "
			const remoteRemovePosEnd = remoteRemovePosStart + 12;

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localRemoveMessage = client.makeOpMessage(
				client.removeRangeLocal(localRemovePosStart, localRemovePosEnd),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
			);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, localRemovePosStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, localRemovePosEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, localRemovePosEnd - localRemovePosStart);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, "brown");

			const remoteRemoveMessage = client.makeOpMessage(
				createRemoveRangeOp(remoteRemovePosStart, remoteRemovePosEnd),
				currentSeqNumber + 1,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteRemoveMessage);

			client.applyMsg(localRemoveMessage);

			assert(!event.isLocal);
			assert.equal(event.ranges.length, 2);
			assert.equal(event.first.position, remoteRemovePosStart);
			// -1 is for split
			assert.equal(event.first.segment.cachedLength, "quick ".length);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, "quick ");
			assert.equal(event.ranges[1].position, remoteRemovePosStart);
			// -1 is for split
			assert.equal(event.ranges[1].segment.cachedLength, " ".length);
			const segment3 = event.ranges[1].segment as TextSegment;
			assert.equal(segment3.text, " ");
		});
	});

	describe("annotate", () => {
		beforeEach(() => {
			client = new TestClient();
			client.insertTextLocal(0, "Habits change into character");
			client.startOrUpdateCollaboration(localUserId);
		});

		it("same range, same property, local before remote", () => {
			const localPosStart = 7; // "change"
			const localPosEnd = localPosStart + 6;
			const remotePosStart = 7; // "change"
			const remotePosEnd = remotePosStart + 6;

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localMessage = client.makeOpMessage(
				client.annotateRangeLocal(localPosStart, localPosEnd, { foo: "bar" }),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			client.applyMsg(localMessage);

			assert(event);
			verifyEventForAnnotate(event, true, localPosStart, localPosEnd, [
				{
					numChar: localPosEnd - localPosStart,
					offset: localPosStart,
					propDeltas: { foo: null },
					props: { foo: "bar" },
					text: "change",
				},
			]);

			const remoteMessage = client.makeOpMessage(
				createAnnotateRangeOp(remotePosStart, remotePosEnd, { foo: "bar" }),
				currentSeqNumber + 2,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteMessage);

			verifyEventForAnnotate(event, false, remotePosStart, remotePosEnd, [
				{
					numChar: remotePosEnd - remotePosStart,
					offset: remotePosStart,
					propDeltas: { foo: "bar" },
					props: { foo: "bar" },
					text: "change",
				},
			]);
		});

		it("same range, same property, remote before local", () => {
			const localPosStart = 7; // "change"
			const localPosEnd = localPosStart + 6;
			const remotePosStart = 7; // "change"
			const remotePosEnd = remotePosStart + 6;

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localMessage = client.makeOpMessage(
				client.annotateRangeLocal(localPosStart, localPosEnd, { foo: "bar" }),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
			);

			assert(event);
			verifyEventForAnnotate(event, true, localPosStart, localPosEnd, [
				{
					numChar: localPosEnd - localPosStart,
					offset: localPosStart,
					propDeltas: { foo: null },
					props: { foo: "bar" },
					text: "change",
				},
			]);

			const remoteMessage = client.makeOpMessage(
				createAnnotateRangeOp(remotePosStart, remotePosEnd, { foo: "bar" }),
				currentSeqNumber + 1,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteMessage);

			verifyEventForAnnotate(event, false, remotePosStart, remotePosEnd, [
				{
					numChar: remotePosEnd - remotePosStart,
					offset: remotePosStart,
					props: { foo: "bar" },
					text: "change",
				},
			]);

			client.applyMsg(localMessage);
		});

		it("same range, same property, different value, local before remote", () => {
			const localPosStart = 7; // "change"
			const localPosEnd = localPosStart + 6;
			const remotePosStart = 7; // "change"
			const remotePosEnd = remotePosStart + 6;

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localMessage = client.makeOpMessage(
				client.annotateRangeLocal(localPosStart, localPosEnd, { foo: "bar" }),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			client.applyMsg(localMessage);

			assert(event);
			verifyEventForAnnotate(event, true, localPosStart, localPosEnd, [
				{
					numChar: localPosEnd - localPosStart,
					offset: localPosStart,
					propDeltas: { foo: null },
					props: { foo: "bar" },
					text: "change",
				},
			]);

			const remoteMessage = client.makeOpMessage(
				createAnnotateRangeOp(remotePosStart, remotePosEnd, { foo: "bardash" }),
				currentSeqNumber + 2,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteMessage);

			verifyEventForAnnotate(event, false, remotePosStart, remotePosEnd, [
				{
					numChar: remotePosEnd - remotePosStart,
					offset: remotePosStart,
					propDeltas: { foo: "bar" },
					props: { foo: "bardash" },
					text: "change",
				},
			]);
		});

		it("same range, same property, different value, remote before local", () => {
			const localPosStart = 7; // "change"
			const localPosEnd = localPosStart + 6;
			const remotePosStart = 7; // "change"
			const remotePosEnd = remotePosStart + 6;

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localMessage = client.makeOpMessage(
				client.annotateRangeLocal(localPosStart, localPosEnd, { foo: "bar" }),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
			);

			assert(event);
			verifyEventForAnnotate(event, true, localPosStart, localPosEnd, [
				{
					numChar: localPosEnd - localPosStart,
					offset: localPosStart,
					propDeltas: { foo: null },
					props: { foo: "bar" },
					text: "change",
				},
			]);

			const remoteMessage = client.makeOpMessage(
				createAnnotateRangeOp(remotePosStart, remotePosEnd, { foo: "bardash" }),
				currentSeqNumber + 1,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteMessage);

			client.applyMsg(localMessage);

			verifyEventForAnnotate(event, false, remotePosStart, remotePosEnd, [
				{
					numChar: remotePosEnd - remotePosStart,
					offset: remotePosStart,
					props: { foo: "bar" },
					text: "change",
				},
			]);
		});

		it("same range, different properties, local before remote", () => {
			const localPosStart = 7; // "change"
			const localPosEnd = localPosStart + 6;
			const remotePosStart = 7; // "change"
			const remotePosEnd = remotePosStart + 6;

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localMessage = client.makeOpMessage(
				client.annotateRangeLocal(localPosStart, localPosEnd, { foo1: "bar1" }),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			client.applyMsg(localMessage);

			assert(event);
			verifyEventForAnnotate(event, true, localPosStart, localPosEnd, [
				{
					numChar: localPosEnd - localPosStart,
					offset: localPosStart,
					propDeltas: { foo1: null },
					props: { foo1: "bar1" },
					text: "change",
				},
			]);

			const remoteMessage = client.makeOpMessage(
				createAnnotateRangeOp(remotePosStart, remotePosEnd, { foo2: "bar2" }),
				currentSeqNumber + 2,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteMessage);

			verifyEventForAnnotate(event, false, remotePosStart, remotePosEnd, [
				{
					numChar: remotePosEnd - remotePosStart,
					offset: remotePosStart,
					propDeltas: { foo2: null },
					props: { foo1: "bar1", foo2: "bar2" },
					text: "change",
				},
			]);
		});

		it("same range, different properties, remote before local", () => {
			const localPosStart = 7; // "change"
			const localPosEnd = localPosStart + 6;
			const remotePosStart = 7; // "change"
			const remotePosEnd = remotePosStart + 6;

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localMessage = client.makeOpMessage(
				client.annotateRangeLocal(localPosStart, localPosEnd, { foo1: "bar1" }),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
			);

			assert(event);
			verifyEventForAnnotate(event, true, localPosStart, localPosEnd, [
				{
					numChar: localPosEnd - localPosStart,
					offset: localPosStart,
					propDeltas: { foo1: null },
					props: { foo1: "bar1" },
					text: "change",
				},
			]);

			const remoteMessage = client.makeOpMessage(
				createAnnotateRangeOp(remotePosStart, remotePosEnd, { foo2: "bar2" }),
				currentSeqNumber + 1,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteMessage);

			verifyEventForAnnotate(event, false, remotePosStart, remotePosEnd, [
				{
					numChar: remotePosEnd - remotePosStart,
					offset: remotePosStart,
					propDeltas: { foo2: null },
					props: { foo1: "bar1", foo2: "bar2" },
					text: "change",
				},
			]);

			client.applyMsg(localMessage);
		});

		it("overlapping ranges, same properties, different values", () => {
			// initialize as following:
			// - second word has property foo1=bar1
			// - third word has property foo2=bar2
			// - fourth word has property foo3=bar3
			initialize();

			// apply remote operation that has seen "initialize" seqnum as following:
			// - apply foo=bar on whole line
			step1(
				client.mergeTree.collabWindow.currentSeq + 1,
				client.mergeTree.collabWindow.currentSeq,
			);

			// apply local operation that has seen "step1" seqnum as following:
			// - change foo=bar1 for [firstWordStart, secondWordEnd)
			step2(
				client.mergeTree.collabWindow.currentSeq + 1,
				client.mergeTree.collabWindow.currentSeq,
			);

			// apply remote operation that has not seen "step2" seqnum as following:
			// - change foo=bar2 for [thirdWordStart, fourthWordEnd)
			step3(
				client.mergeTree.collabWindow.currentSeq + 1,
				client.mergeTree.collabWindow.currentSeq - 1,
			);

			// apply local operation that has seen "step3" seqnum as following:
			// - change foo=bar3 for [secondWordStart, fourthWordEnd)
			step4(
				client.mergeTree.collabWindow.currentSeq + 1,
				client.mergeTree.collabWindow.currentSeq,
			);
		});

		const firstWordStart = 0; // "Habits"
		const secondWordStart = 7; // "change"
		const secondWordEnd = 13;
		const thirdWordStart = 14; // "into"
		const thirdWordEnd = 18;
		const fourthWordStart = 19; // "character"
		const fourthWordEnd = 28;

		function initialize() {
			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localMessage1 = client.makeOpMessage(
				client.annotateRangeLocal(secondWordStart, secondWordEnd, { foo1: "bar1" }),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			client.applyMsg(localMessage1);

			assert(event);
			verifyEventForAnnotate(event, true, secondWordStart, secondWordEnd, [
				{
					numChar: secondWordEnd - secondWordStart,
					offset: secondWordStart,
					propDeltas: { foo1: null },
					props: { foo1: "bar1" },
					text: "change",
				},
			]);

			const localMessage2 = client.makeOpMessage(
				client.annotateRangeLocal(fourthWordStart, fourthWordEnd, { foo3: "bar3" }),
				currentSeqNumber + 2,
				currentSeqNumber + 1, // refseqnum
			);

			client.applyMsg(localMessage2);

			verifyEventForAnnotate(event, true, fourthWordStart, fourthWordEnd, [
				{
					numChar: fourthWordEnd - fourthWordStart,
					offset: fourthWordStart,
					propDeltas: { foo3: null },
					props: { foo3: "bar3" },
					text: "character",
				},
			]);

			const remoteMessage1 = client.makeOpMessage(
				createAnnotateRangeOp(thirdWordStart, thirdWordEnd, { foo2: "bar2" }),
				currentSeqNumber + 3,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteMessage1);

			verifyEventForAnnotate(event, false, thirdWordStart, thirdWordEnd, [
				{
					numChar: thirdWordEnd - thirdWordStart,
					offset: thirdWordStart,
					propDeltas: { foo2: null },
					props: { foo2: "bar2" },
					text: "into",
				},
			]);
		}

		function step1(seqnum: number, refseqnum: number) {
			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const remoteMessage = client.makeOpMessage(
				createAnnotateRangeOp(firstWordStart, fourthWordEnd, { foo: "bar" }),
				seqnum,
				refseqnum,
				remoteUserId,
			);

			client.applyMsg(remoteMessage);

			assert(event);
			verifyEventForAnnotate(event, false, firstWordStart, fourthWordEnd, [
				{
					numChar: secondWordStart - firstWordStart,
					offset: firstWordStart,
					propDeltas: { foo: null },
					props: { foo: "bar" },
					text: "Habits ",
				},
				{
					numChar: secondWordEnd - secondWordStart,
					offset: secondWordStart,
					propDeltas: { foo: null },
					props: { foo: "bar", foo1: "bar1" },
					text: "change",
				},
				{
					numChar: thirdWordStart - secondWordEnd,
					offset: secondWordEnd,
					propDeltas: { foo: null },
					props: { foo: "bar" },
					text: " ",
				},
				{
					numChar: thirdWordEnd - thirdWordStart,
					offset: thirdWordStart,
					propDeltas: { foo: null },
					props: { foo: "bar", foo2: "bar2" },
					text: "into",
				},
				{
					numChar: fourthWordStart - thirdWordEnd,
					offset: thirdWordEnd,
					propDeltas: { foo: null },
					props: { foo: "bar" },
					text: " ",
				},
				{
					numChar: fourthWordEnd - fourthWordStart,
					offset: fourthWordStart,
					propDeltas: { foo: null },
					props: { foo: "bar", foo3: "bar3" },
					text: "character",
				},
			]);
		}

		function step2(seqnum: number, refseqnum: number) {
			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localMessage = client.makeOpMessage(
				client.annotateRangeLocal(firstWordStart, secondWordEnd, { foo: "bar1" }),
				seqnum,
				refseqnum,
			);

			client.applyMsg(localMessage);

			assert(event);
			verifyEventForAnnotate(event, true, firstWordStart, secondWordEnd, [
				{
					numChar: secondWordStart - firstWordStart,
					offset: firstWordStart,
					propDeltas: { foo: "bar" },
					props: { foo: "bar1" },
					text: "Habits ",
				},
				{
					numChar: secondWordEnd - secondWordStart,
					offset: secondWordStart,
					propDeltas: { foo: "bar" },
					props: { foo: "bar1", foo1: "bar1" },
					text: "change",
				},
			]);
		}

		function step3(seqnum: number, refseqnum: number) {
			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const remoteMessage = client.makeOpMessage(
				createAnnotateRangeOp(thirdWordStart, fourthWordEnd, { foo: "bar2" }),
				seqnum,
				refseqnum,
				remoteUserId,
			);

			client.applyMsg(remoteMessage);

			assert(event);
			verifyEventForAnnotate(event, false, thirdWordStart, fourthWordEnd, [
				{
					numChar: thirdWordEnd - thirdWordStart,
					offset: thirdWordStart,
					propDeltas: { foo: "bar" },
					props: { foo: "bar2", foo2: "bar2" },
					text: "into",
				},
				{
					numChar: fourthWordStart - thirdWordEnd,
					offset: thirdWordEnd,
					propDeltas: { foo: "bar" },
					props: { foo: "bar2" },
					text: " ",
				},
				{
					numChar: fourthWordEnd - fourthWordStart,
					offset: fourthWordStart,
					propDeltas: { foo: "bar" },
					props: { foo: "bar2", foo3: "bar3" },
					text: "character",
				},
			]);
		}

		function step4(seqnum: number, refseqnum: number) {
			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localMessage = client.makeOpMessage(
				client.annotateRangeLocal(secondWordStart, fourthWordEnd, { foo: "bar3" }),
				seqnum,
				refseqnum,
			);

			client.applyMsg(localMessage);

			assert(event);
			verifyEventForAnnotate(event, true, secondWordStart, fourthWordEnd, [
				{
					numChar: secondWordEnd - secondWordStart,
					offset: secondWordStart,
					propDeltas: { foo: "bar1" },
					props: { foo: "bar3", foo1: "bar1" },
					text: "change",
				},
				{
					numChar: thirdWordStart - secondWordEnd,
					offset: secondWordEnd,
					propDeltas: { foo: "bar" },
					props: { foo: "bar3" },
					text: " ",
				},
				{
					numChar: thirdWordEnd - thirdWordStart,
					offset: thirdWordStart,
					propDeltas: { foo: "bar2" },
					props: { foo: "bar3", foo2: "bar2" },
					text: "into",
				},
				{
					numChar: fourthWordStart - thirdWordEnd,
					offset: thirdWordEnd,
					propDeltas: { foo: "bar2" },
					props: { foo: "bar3" },
					text: " ",
				},
				{
					numChar: fourthWordEnd - fourthWordStart,
					offset: fourthWordStart,
					propDeltas: { foo: "bar2" },
					props: { foo: "bar3", foo3: "bar3" },
					text: "character",
				},
			]);
		}

		function verifyEventForAnnotate(
			event: SequenceDeltaEventClass,
			isLocal: boolean,
			start: number,
			end: number,
			expected: IExpectedSegmentInfo[],
		): void {
			assert(event.isLocal === isLocal);
			assert.equal(event.first.position, start);
			assert.equal(event.last.position + event.last.segment.cachedLength, end);
			assert.equal(event.ranges.length, expected.length);
			for (let i = 0; i < expected.length; i = i + 1) {
				assert.equal(event.ranges[i].position, expected[i].offset);
				assert.equal(event.ranges[i].segment.cachedLength, expected[i].numChar);
				assert.equal(
					Object.keys(event.ranges[i].segment.properties ?? {}).length,
					Object.keys(expected[i].props).length,
				);
				for (const key of Object.keys(event.ranges[i].segment.properties ?? {})) {
					assert.equal(event.ranges[i].segment.properties?.[key], expected[i].props[key]);
				}
				if (expected[i].propDeltas !== undefined) {
					assert.equal(
						Object.keys(event.ranges[i].propertyDeltas).length,
						Object.keys(expected[i].propDeltas ?? {}).length,
					);
					for (const key of Object.keys(event.ranges[i].propertyDeltas)) {
						assert.equal(event.ranges[i].propertyDeltas[key], expected[i].propDeltas?.[key]);
					}
				} else {
					assert(
						isNullOrUndefined(event.ranges[i].propertyDeltas) ||
							Object.keys(event.ranges[i].propertyDeltas).length === 0,
					);
				}
				if (expected[i].text !== undefined) {
					const segment = event.ranges[i].segment as TextSegment;
					assert.equal(segment.text, expected[i].text);
				}
			}
		}
	});

	describe("combination", () => {
		beforeEach(() => {
			client = new TestClient();
			client.insertTextLocal(0, "The brown fox jumps over the lazy dog");
			client.startOrUpdateCollaboration(localUserId);
		});

		it("insertPos before deleteRange, insertLocal deleteRemote, local before remote", () => {
			const insertPos = 4; // before "brown"
			const insertText = "quick ";
			const deleteRangeStart = 29; // "lazy "
			const deleteRangeEnd = 34;
			const output = "The quick brown fox jumps over the dog";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localInsertMessage = client.makeOpMessage(
				client.insertTextLocal(insertPos, insertText),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			client.applyMsg(localInsertMessage);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, insertPos);
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				insertPos + insertText.length,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, insertText.length);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, insertText);

			const remoteRemoveMessage = client.makeOpMessage(
				createRemoveRangeOp(deleteRangeStart, deleteRangeEnd),
				currentSeqNumber + 2,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteRemoveMessage);

			assert(!event.isLocal);
			assert.equal(event.first.position, deleteRangeStart + insertText.length);
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				deleteRangeEnd + insertText.length,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, deleteRangeEnd - deleteRangeStart);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, "lazy ");

			assert.equal(client.getText(), output);
		});

		it("insertPos before deleteRange, insertLocal deleteRemote, remote before local", () => {
			const insertPos = 4; // before "brown"
			const insertText = "quick ";
			const deleteRangeStart = 29; // "lazy "
			const deleteRangeEnd = 34;
			const output = "The quick brown fox jumps over the dog";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localInsertMessage = client.makeOpMessage(
				client.insertTextLocal(insertPos, insertText),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
			);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, insertPos);
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				insertPos + insertText.length,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, insertText.length);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, insertText);

			const remoteRemoveMessage = client.makeOpMessage(
				createRemoveRangeOp(deleteRangeStart, deleteRangeEnd),
				currentSeqNumber + 1,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteRemoveMessage);

			assert(!event.isLocal);
			assert.equal(event.first.position, deleteRangeStart + insertText.length);
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				deleteRangeEnd + insertText.length,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, deleteRangeEnd - deleteRangeStart);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, "lazy ");

			client.applyMsg(localInsertMessage);

			assert.equal(client.getText(), output);
		});

		it("insertPos before deleteRange, deleteLocal insertRemote, local before remote", () => {
			const insertPos = 4; // before "brown"
			const insertText = "quick ";
			const deleteRangeStart = 29; // "lazy "
			const deleteRangeEnd = 34;
			const output = "The quick brown fox jumps over the dog";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localRemoveMessage = client.makeOpMessage(
				client.removeRangeLocal(deleteRangeStart, deleteRangeEnd),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			client.applyMsg(localRemoveMessage);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, deleteRangeStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, deleteRangeEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, deleteRangeEnd - deleteRangeStart);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, "lazy ");

			const remoteInsertMessage = client.makeOpMessage(
				createInsertSegmentOp(insertPos, new TextSegment(insertText)),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
				remoteUserId,
			);

			client.applyMsg(remoteInsertMessage);

			assert(!event.isLocal);
			assert.equal(event.first.position, insertPos);
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				insertPos + insertText.length,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, insertText.length);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, insertText);

			assert.equal(client.getText(), output);
		});

		it("insertPos before deleteRange, deleteLocal insertRemote, remote before local", () => {
			const insertPos = 4; // before "brown"
			const insertText = "quick ";
			const deleteRangeStart = 29; // "lazy "
			const deleteRangeEnd = 34;
			const output = "The quick brown fox jumps over the dog";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localRemoveMessage = client.makeOpMessage(
				client.removeRangeLocal(deleteRangeStart, deleteRangeEnd),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
			);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, deleteRangeStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, deleteRangeEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, deleteRangeEnd - deleteRangeStart);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, "lazy ");

			const remoteInsertMessage = client.makeOpMessage(
				createInsertSegmentOp(insertPos, new TextSegment(insertText)),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
				remoteUserId,
			);

			client.applyMsg(remoteInsertMessage);

			assert(!event.isLocal);
			assert.equal(event.first.position, insertPos);
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				insertPos + insertText.length,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, insertText.length);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, insertText);

			client.applyMsg(localRemoveMessage);

			assert.equal(client.getText(), output);
		});

		it("insertPos after deleteRange, insertLocal deleteRemote, local before remote", () => {
			const insertPos = 29; // before "lazy"
			const insertText = "black ";
			const deleteRangeStart = 4; // "brown "
			const deleteRangeEnd = 10;
			const output = "The fox jumps over the black lazy dog";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localInsertMessage = client.makeOpMessage(
				client.insertTextLocal(insertPos, insertText),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			client.applyMsg(localInsertMessage);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, insertPos);
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				insertPos + insertText.length,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, insertText.length);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, insertText);

			const remoteRemoveMessage = client.makeOpMessage(
				createRemoveRangeOp(deleteRangeStart, deleteRangeEnd),
				currentSeqNumber + 2,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteRemoveMessage);

			assert(!event.isLocal);
			assert.equal(event.first.position, deleteRangeStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, deleteRangeEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, deleteRangeEnd - deleteRangeStart);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, "brown ");

			assert.equal(client.getText(), output);
		});

		it("insertPos after deleteRange, insertLocal deleteRemote, remote before local", () => {
			const insertPos = 29; // before "lazy"
			const insertText = "black ";
			const deleteRangeStart = 4; // "brown "
			const deleteRangeEnd = 10;
			const output = "The fox jumps over the black lazy dog";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localInsertMessage = client.makeOpMessage(
				client.insertTextLocal(insertPos, insertText),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
			);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, insertPos);
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				insertPos + insertText.length,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, insertText.length);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, insertText);

			const remoteRemoveMessage = client.makeOpMessage(
				createRemoveRangeOp(deleteRangeStart, deleteRangeEnd),
				currentSeqNumber + 1,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteRemoveMessage);

			assert(!event.isLocal);
			assert.equal(event.first.position, deleteRangeStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, deleteRangeEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, deleteRangeEnd - deleteRangeStart);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, "brown ");

			client.applyMsg(localInsertMessage);

			assert.equal(client.getText(), output);
		});

		it("insertPos after deleteRange, deleteLocal insertRemote, local before remote", () => {
			const insertPos = 29; // before "lazy"
			const insertText = "black ";
			const deleteRangeStart = 4; // "brown "
			const deleteRangeEnd = 10;
			const output = "The fox jumps over the black lazy dog";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localRemoveMessage = client.makeOpMessage(
				client.removeRangeLocal(deleteRangeStart, deleteRangeEnd),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			client.applyMsg(localRemoveMessage);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, deleteRangeStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, deleteRangeEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, deleteRangeEnd - deleteRangeStart);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, "brown ");

			const remoteInsertMessage = client.makeOpMessage(
				createInsertSegmentOp(insertPos, new TextSegment(insertText)),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
				remoteUserId,
			);

			client.applyMsg(remoteInsertMessage);

			assert(!event.isLocal);
			assert.equal(event.first.position, insertPos - (deleteRangeEnd - deleteRangeStart));
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				insertPos - (deleteRangeEnd - deleteRangeStart) + insertText.length,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, insertText.length);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, insertText);

			assert.equal(client.getText(), output);
		});

		it("insertPos after deleteRange, deleteLocal insertRemote, remote before local", () => {
			const insertPos = 29; // before "lazy"
			const insertText = "black ";
			const deleteRangeStart = 4; // "brown "
			const deleteRangeEnd = 10;
			const output = "The fox jumps over the black lazy dog";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localRemoveMessage = client.makeOpMessage(
				client.removeRangeLocal(deleteRangeStart, deleteRangeEnd),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
			);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, deleteRangeStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, deleteRangeEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, deleteRangeEnd - deleteRangeStart);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, "brown ");

			const remoteInsertMessage = client.makeOpMessage(
				createInsertSegmentOp(insertPos, new TextSegment(insertText)),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
				remoteUserId,
			);

			client.applyMsg(remoteInsertMessage);

			assert(!event.isLocal);
			assert.equal(event.first.position, insertPos - (deleteRangeEnd - deleteRangeStart));
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				insertPos - (deleteRangeEnd - deleteRangeStart) + insertText.length,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, insertText.length);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, insertText);

			client.applyMsg(localRemoveMessage);

			assert.equal(client.getText(), output);
		});

		it("insertPos is deleteRangeStart, insertLocal deleteRemote, local before remote", () => {
			const insertPos = 29; // before "lazy"
			const insertText = "black ";
			const deleteRangeStart = 29; // "lazy "
			const deleteRangeEnd = 34;
			const output = "The brown fox jumps over the black dog";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localInsertMessage = client.makeOpMessage(
				client.insertTextLocal(insertPos, insertText),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			client.applyMsg(localInsertMessage);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, insertPos);
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				insertPos + insertText.length,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, insertText.length);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, insertText);

			const remoteRemoveMessage = client.makeOpMessage(
				createRemoveRangeOp(deleteRangeStart, deleteRangeEnd),
				currentSeqNumber + 2,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteRemoveMessage);

			assert(!event.isLocal);
			assert.equal(event.first.position, deleteRangeStart + insertText.length);
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				deleteRangeEnd + insertText.length,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, deleteRangeEnd - deleteRangeStart);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, "lazy ");
			assert.equal(client.getText(), output);
		});

		it("insertPos is deleteRangeStart, insertLocal deleteRemote, remote before local", () => {
			const insertPos = 29; // before "lazy"
			const insertText = "black ";
			const deleteRangeStart = 29; // "lazy "
			const deleteRangeEnd = 34;
			const output = "The brown fox jumps over the black dog";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localInsertMessage = client.makeOpMessage(
				client.insertTextLocal(insertPos, insertText),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
			);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, insertPos);
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				insertPos + insertText.length,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, insertText.length);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, insertText);

			const remoteRemoveMessage = client.makeOpMessage(
				createRemoveRangeOp(deleteRangeStart, deleteRangeEnd),
				currentSeqNumber + 1,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteRemoveMessage);

			assert(!event.isLocal);
			assert.equal(event.first.position, deleteRangeStart + insertText.length);
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				deleteRangeEnd + insertText.length,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, deleteRangeEnd - deleteRangeStart);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, "lazy ");

			client.applyMsg(localInsertMessage);

			assert.equal(client.getText(), output);
		});

		it("insertPos is deleteRangeStart, deleteLocal insertRemote, local before remote", () => {
			const insertPos = 29; // before "lazy"
			const insertText = "black ";
			const deleteRangeStart = 29; // "lazy "
			const deleteRangeEnd = 34;
			const output = "The brown fox jumps over the black dog";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localRemoveMessage = client.makeOpMessage(
				client.removeRangeLocal(deleteRangeStart, deleteRangeEnd),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			client.applyMsg(localRemoveMessage);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, deleteRangeStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, deleteRangeEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, deleteRangeEnd - deleteRangeStart);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, "lazy ");

			const remoteInsertMessage = client.makeOpMessage(
				createInsertSegmentOp(insertPos, new TextSegment(insertText)),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
				remoteUserId,
			);

			client.applyMsg(remoteInsertMessage);

			assert(!event.isLocal);
			assert.equal(event.first.position, insertPos);
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				insertPos + insertText.length,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, insertText.length);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, insertText);

			assert.equal(client.getText(), output);
		});

		it("insertPos is deleteRangeStart, deleteLocal insertRemote, remote before local", () => {
			const insertPos = 29; // before "lazy"
			const insertText = "black ";
			const deleteRangeStart = 29; // "lazy "
			const deleteRangeEnd = 34;
			const output = "The brown fox jumps over the black dog";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localRemoveMessage = client.makeOpMessage(
				client.removeRangeLocal(deleteRangeStart, deleteRangeEnd),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
			);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, deleteRangeStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, deleteRangeEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, deleteRangeEnd - deleteRangeStart);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, "lazy ");

			const remoteInsertMessage = client.makeOpMessage(
				createInsertSegmentOp(insertPos, new TextSegment(insertText)),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
				remoteUserId,
			);

			client.applyMsg(remoteInsertMessage);

			assert(!event.isLocal);
			assert.equal(event.first.position, insertPos);
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				insertPos + insertText.length,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, insertText.length);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, insertText);

			client.applyMsg(localRemoveMessage);

			assert.equal(client.getText(), output);
		});

		it("insertPos is deleteRangeEnd, insertLocal deleteRemote, local before remote", () => {
			const insertPos = 34; // after "lazy"
			const insertText = "black ";
			const deleteRangeStart = 29; // "lazy "
			const deleteRangeEnd = 34;
			const output = "The brown fox jumps over the black dog";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localInsertMessage = client.makeOpMessage(
				client.insertTextLocal(insertPos, insertText),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			client.applyMsg(localInsertMessage);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, insertPos);
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				insertPos + insertText.length,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, insertText.length);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, insertText);

			const remoteRemoveMessage = client.makeOpMessage(
				createRemoveRangeOp(deleteRangeStart, deleteRangeEnd),
				currentSeqNumber + 2,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteRemoveMessage);

			assert(!event.isLocal);
			assert.equal(event.first.position, deleteRangeStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, deleteRangeEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, deleteRangeEnd - deleteRangeStart);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, "lazy ");

			assert.equal(client.getText(), output);
		});

		it("insertPos is deleteRangeEnd, insertLocal deleteRemote, remote before local", () => {
			const insertPos = 34; // after "lazy"
			const insertText = "black ";
			const deleteRangeStart = 29; // "lazy "
			const deleteRangeEnd = 34;
			const output = "The brown fox jumps over the black dog";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localInsertMessage = client.makeOpMessage(
				client.insertTextLocal(insertPos, insertText),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
			);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, insertPos);
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				insertPos + insertText.length,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, insertText.length);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, insertText);

			const remoteRemoveMessage = client.makeOpMessage(
				createRemoveRangeOp(deleteRangeStart, deleteRangeEnd),
				currentSeqNumber + 1,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteRemoveMessage);

			assert(!event.isLocal);
			assert.equal(event.first.position, deleteRangeStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, deleteRangeEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, deleteRangeEnd - deleteRangeStart);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, "lazy ");

			client.applyMsg(localInsertMessage);

			assert.equal(client.getText(), output);
		});

		it("insertPos is deleteRangeEnd, deleteLocal insertRemote, local before remote", () => {
			const insertPos = 34; // after "lazy"
			const insertText = "black ";
			const deleteRangeStart = 29; // "lazy "
			const deleteRangeEnd = 34;
			const output = "The brown fox jumps over the black dog";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localRemoveMessage = client.makeOpMessage(
				client.removeRangeLocal(deleteRangeStart, deleteRangeEnd),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, deleteRangeStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, deleteRangeEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, deleteRangeEnd - deleteRangeStart);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, "lazy ");

			client.applyMsg(localRemoveMessage);

			const remoteInsertMessage = client.makeOpMessage(
				createInsertSegmentOp(insertPos, new TextSegment(insertText)),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
				remoteUserId,
			);

			client.applyMsg(remoteInsertMessage);

			assert(!event.isLocal);
			assert.equal(event.first.position, insertPos - (deleteRangeEnd - deleteRangeStart));
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				insertPos + insertText.length - (deleteRangeEnd - deleteRangeStart),
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, insertText.length);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, insertText);

			assert.equal(client.getText(), output);
		});

		it("insertPos is deleteRangeEnd, deleteLocal insertRemote, remote before local", () => {
			const insertPos = 34; // after "lazy"
			const insertText = "black ";
			const deleteRangeStart = 29; // "lazy "
			const deleteRangeEnd = 34;
			const output = "The brown fox jumps over the black dog";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localRemoveMessage = client.makeOpMessage(
				client.removeRangeLocal(deleteRangeStart, deleteRangeEnd),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
			);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, deleteRangeStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, deleteRangeEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, deleteRangeEnd - deleteRangeStart);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, "lazy ");

			const remoteInsertMessage = client.makeOpMessage(
				createInsertSegmentOp(insertPos, new TextSegment(insertText)),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
				remoteUserId,
			);

			client.applyMsg(remoteInsertMessage);

			assert(!event.isLocal);
			assert.equal(event.first.position, insertPos - (deleteRangeEnd - deleteRangeStart));
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				insertPos + insertText.length - (deleteRangeEnd - deleteRangeStart),
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, insertText.length);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, insertText);

			client.applyMsg(localRemoveMessage);

			assert.equal(client.getText(), output);
		});

		it("insertPos is deleteRangeStart, insertLocal deleteRemote, local before remote", () => {
			const insertPos = 10; // before "fox"
			const insertText = "black wolf ";
			const deleteRangeStart = 4; // "brown fox "
			const deleteRangeEnd = 14;
			const output = "The black wolf jumps over the lazy dog";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localInsertMessage = client.makeOpMessage(
				client.insertTextLocal(insertPos, insertText),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			client.applyMsg(localInsertMessage);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, insertPos);
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				insertPos + insertText.length,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, insertText.length);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, insertText);

			const remoteRemoveMessage = client.makeOpMessage(
				createRemoveRangeOp(deleteRangeStart, deleteRangeEnd),
				currentSeqNumber + 2,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteRemoveMessage);

			const expectedRangeStart1 = deleteRangeStart;
			const expectedRangeEnd1 = expectedRangeStart1 + "brown ".length;
			// merge tree internal: "brown " is deleted and then end is calculated
			const expectedRangeStart2 = deleteRangeStart + insertText.length;
			const expectedRangeEnd2 = expectedRangeStart2 + "fox ".length;

			assert(!event.isLocal);
			assert.equal(event.first.position, expectedRangeStart1);
			assert.equal(event.last.position + event.last.segment.cachedLength, expectedRangeEnd2);
			assert.equal(event.ranges.length, 2);
			assert.equal(event.first.segment.cachedLength, expectedRangeEnd1 - expectedRangeStart1);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, "brown ");
			assert.equal(event.ranges[1].position, expectedRangeStart2);
			assert.equal(
				event.ranges[1].segment.cachedLength,
				expectedRangeEnd2 - expectedRangeStart2,
			);
			const segment3 = event.ranges[1].segment as TextSegment;
			assert.equal(segment3.text, "fox ");
			assert.equal(client.getText(), output);
		});

		it("insertPos is deleteRangeStart, insertLocal deleteRemote, remote before local", () => {
			const insertPos = 10; // before "fox"
			const insertText = "black wolf ";
			const deleteRangeStart = 4; // "brown fox "
			const deleteRangeEnd = 14;
			const output = "The black wolf jumps over the lazy dog";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localInsertMessage = client.makeOpMessage(
				client.insertTextLocal(insertPos, insertText),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
			);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, insertPos);
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				insertPos + insertText.length,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, insertText.length);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, insertText);

			const remoteRemoveMessage = client.makeOpMessage(
				createRemoveRangeOp(deleteRangeStart, deleteRangeEnd),
				currentSeqNumber + 1,
				currentSeqNumber, // refseq
				remoteUserId,
			);

			client.applyMsg(remoteRemoveMessage);

			const expectedRangeStart1 = deleteRangeStart;
			const expectedRangeEnd1 = expectedRangeStart1 + "brown ".length;
			// merge tree internal: "brown " is deleted and then end is calculated
			const expectedRangeStart2 = deleteRangeStart + insertText.length;
			const expectedRangeEnd2 = expectedRangeStart2 + "fox ".length;

			assert(!event.isLocal);
			assert.equal(event.first.position, expectedRangeStart1);
			assert.equal(event.last.position + event.last.segment.cachedLength, expectedRangeEnd2);
			assert.equal(event.ranges.length, 2);
			assert.equal(event.first.segment.cachedLength, expectedRangeEnd1 - expectedRangeStart1);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, "brown ");
			assert.equal(event.ranges[1].position, expectedRangeStart2);
			assert.equal(
				event.ranges[1].segment.cachedLength,
				expectedRangeEnd2 - expectedRangeStart2,
			);
			const segment3 = event.ranges[1].segment as TextSegment;
			assert.equal(segment3.text, "fox ");

			client.applyMsg(localInsertMessage);

			assert.equal(client.getText(), output);
		});

		it("insertPos is deleteRangeStart, deleteLocal insertRemote, local before remote", () => {
			const insertPos = 10; // before "fox"
			const insertText = "black wolf ";
			const deleteRangeStart = 4; // "brown fox "
			const deleteRangeEnd = 14;
			const output = "The black wolf jumps over the lazy dog";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localRemoveMessage = client.makeOpMessage(
				client.removeRangeLocal(deleteRangeStart, deleteRangeEnd),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
			);

			client.applyMsg(localRemoveMessage);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, deleteRangeStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, deleteRangeEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, deleteRangeEnd - deleteRangeStart);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, "brown fox ");

			const remoteInsertMessage = client.makeOpMessage(
				createInsertSegmentOp(insertPos, new TextSegment(insertText)),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
				remoteUserId,
			);

			client.applyMsg(remoteInsertMessage);

			assert(!event.isLocal);
			assert.equal(event.first.position, deleteRangeStart);
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				deleteRangeStart + insertText.length,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, insertText.length);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, insertText);

			assert.equal(client.getText(), output);
		});

		it("insertPos is deleteRangeStart, deleteLocal insertRemote, remote before local", () => {
			const insertPos = 10; // before "fox"
			const insertText = "black wolf ";
			const deleteRangeStart = 4; // "brown fox "
			const deleteRangeEnd = 14;
			const output = "The black wolf jumps over the lazy dog";

			const currentSeqNumber = client.mergeTree.collabWindow.currentSeq;

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});

			const localRemoveMessage = client.makeOpMessage(
				client.removeRangeLocal(deleteRangeStart, deleteRangeEnd),
				currentSeqNumber + 2,
				currentSeqNumber, // refseqnum
			);

			assert(event);
			assert(event.isLocal);
			assert.equal(event.first.position, deleteRangeStart);
			assert.equal(event.last.position + event.last.segment.cachedLength, deleteRangeEnd);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, deleteRangeEnd - deleteRangeStart);
			const segment1 = event.first.segment as TextSegment;
			assert.equal(segment1.text, "brown fox ");

			const remoteInsertMessage = client.makeOpMessage(
				createInsertSegmentOp(insertPos, new TextSegment(insertText)),
				currentSeqNumber + 1,
				currentSeqNumber, // refseqnum
				remoteUserId,
			);

			client.applyMsg(remoteInsertMessage);

			assert(!event.isLocal);
			assert.equal(event.first.position, deleteRangeStart);
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				deleteRangeStart + insertText.length,
			);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.segment.cachedLength, insertText.length);
			const segment2 = event.first.segment as TextSegment;
			assert.equal(segment2.text, insertText);

			client.applyMsg(localRemoveMessage);

			assert.equal(client.getText(), output);
		});
	});
});

describe("SequenceDeltaEventClass", () => {
	const localUserLongId = "localUser";
	let client: TestClient;

	beforeEach(() => {
		client = new TestClient();
		client.startOrUpdateCollaboration(localUserLongId);
	});

	describe(".ranges", () => {
		it("single segment", () => {
			const insertText = "text";
			let deltaArgs: IMergeTreeDeltaCallbackArgs | undefined;
			client.on("delta", (opArgs, delta) => {
				deltaArgs = delta;
			});
			const op = client.insertTextLocal(0, insertText);

			assert(deltaArgs);
			assert.equal(deltaArgs.deltaSegments.length, 1);

			assert(op);
			const event = new SequenceDeltaEventClass({ op }, deltaArgs, client);

			assert(event.isLocal);
			assert.equal(event.ranges.length, 1);
			assert.equal(event.first.position, 0);
			assert.equal(event.first.segment.cachedLength, insertText.length);
			assert.equal(event.last.position + event.last.segment.cachedLength, insertText.length);
		});

		it("multiple continuous segments", () => {
			const insertText = "text";
			const segmentCount = 5;
			for (let i = 0; i < segmentCount + 2; i = i + 1) {
				client.insertTextLocal(0, insertText);
			}

			let deltaArgs: IMergeTreeDeltaCallbackArgs | undefined;
			client.on("delta", (opArgs, delta) => {
				deltaArgs = delta;
			});
			const op = client.annotateRangeLocal(
				insertText.length,
				client.getLength() - insertText.length,
				{
					foo: "bar",
				},
			);

			assert(deltaArgs);
			assert.equal(deltaArgs.deltaSegments.length, segmentCount);

			assert(op);
			const event = new SequenceDeltaEventClass({ op }, deltaArgs, client);

			assert(event.isLocal);
			assert.equal(event.ranges.length, segmentCount);
			assert.equal(event.first.position, insertText.length);
			for (let i = 0; i < segmentCount; i = i + 1) {
				assert.equal(event.ranges[i].position, (i + 1) * insertText.length);
				assert.equal(event.ranges[i].segment.cachedLength, insertText.length);
				assert.equal(event.ranges[i].propertyDeltas.foo, null);
			}
			assert.equal(
				event.last.position + event.last.segment.cachedLength,
				client.getLength() - insertText.length,
			);
		});

		it("multiple noncontinuous segments", () => {
			const textCount = 4;
			const segmentCount = 5;
			for (let i = 0; i < segmentCount; i = i + 1) {
				const op = client.insertTextLocal(0, `${i}`.repeat(textCount));
				client.applyMsg(
					client.makeOpMessage(op, client.mergeTree.collabWindow.currentSeq + 1),
				);
			}

			const remoteRemoveMessage = client.makeOpMessage(
				createRemoveRangeOp(0, client.getLength()),
				client.mergeTree.collabWindow.currentSeq + 1,
			);
			remoteRemoveMessage.clientSequenceNumber = 0;
			remoteRemoveMessage.clientId = "remote user";

			for (let i = 0; i < segmentCount; i = i + 1) {
				client.insertTextLocal(i * 2 * textCount, "b".repeat(textCount));
			}

			let event: SequenceDeltaEventClass | undefined;
			client.on("delta", (clientArgs, mergeTreeArgs) => {
				event = new SequenceDeltaEventClass(clientArgs, mergeTreeArgs, client);
			});
			client.applyMsg(remoteRemoveMessage);

			assert(event);
			assert(!event.isLocal);
			assert.equal(event.ranges.length, segmentCount);
			for (let i = 0; i < segmentCount; i = i + 1) {
				assert.equal(event.ranges[i].position, (i + 1) * textCount);
				assert.equal(event.ranges[i].segment.cachedLength, textCount);
			}
		});
	});
});
