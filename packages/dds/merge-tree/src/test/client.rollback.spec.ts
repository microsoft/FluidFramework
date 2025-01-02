/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "node:assert";

import { UniversalSequenceNumber } from "../constants.js";
import {
	ISegmentPrivate,
	Marker,
	SegmentGroup,
	reservedMarkerIdKey,
} from "../mergeTreeNodes.js";
import { MergeTreeDeltaType, ReferenceType } from "../ops.js";
import { TextSegment } from "../textSegment.js";

import { TestClient } from "./testClient.js";
import { TestClientLogger } from "./testClientLogger.js";
import { insertSegments, validatePartialLengths } from "./testUtils.js";

describe("client.rollback", () => {
	const localUserLongId = "localUser";
	let client: TestClient;

	beforeEach(() => {
		client = new TestClient();
		insertSegments({
			mergeTree: client.mergeTree,
			pos: 0,
			segments: [TextSegment.make("")],
			refSeq: UniversalSequenceNumber,
			clientId: client.getClientId(),
			seq: UniversalSequenceNumber,
			opArgs: undefined,
		});
		client.startOrUpdateCollaboration(localUserLongId);
	});

	it("Should rollback insert on empty string", () => {
		client.insertTextLocal(0, "abcd");
		client.rollback?.({ type: MergeTreeDeltaType.INSERT }, client.peekPendingSegmentGroups());

		assert.equal(client.getText(), "");
	});
	it("Should rollback insert marker", () => {
		client.insertTextLocal(0, "abc");
		client.insertMarkerLocal(1, ReferenceType.Simple, {
			[reservedMarkerIdKey]: "markerId",
		});
		client.rollback?.({ type: MergeTreeDeltaType.INSERT }, client.peekPendingSegmentGroups());

		assert.equal(client.getText(), "abc");
		const marker = client.getMarkerFromId("markerId");
		assert.equal(marker, undefined);
	});
	it("Should rollback insert and validate the partial lengths", () => {
		client.insertTextLocal(0, "ghi");
		client.insertTextLocal(0, "def");
		client.insertTextLocal(0, "abc");

		client.rollback?.({ type: MergeTreeDeltaType.INSERT }, client.peekPendingSegmentGroups());

		assert.equal(client.getText(), "defghi");
		validatePartialLengths(client.getClientId(), client.mergeTree);

		client.rollback?.({ type: MergeTreeDeltaType.INSERT }, client.peekPendingSegmentGroups());

		assert.equal(client.getText(), "ghi");
		validatePartialLengths(client.getClientId(), client.mergeTree);
	});
	it("Should rollback multiple inserts with split segments", () => {
		client.insertTextLocal(0, "aefg");
		client.insertTextLocal(1, "bd");
		client.insertTextLocal(2, "c");
		client.rollback?.({ type: MergeTreeDeltaType.INSERT }, client.peekPendingSegmentGroups());
		client.rollback?.({ type: MergeTreeDeltaType.INSERT }, client.peekPendingSegmentGroups());

		assert.equal(client.getText(), "aefg");
		validatePartialLengths(client.getClientId(), client.mergeTree);
	});
	it("Should zamboni rolled back insert", () => {
		client.insertTextLocal(0, "aefg");
		client.insertTextLocal(1, "bcd");
		const segmentGroup = client.peekPendingSegmentGroups() as SegmentGroup;
		const segment: ISegmentPrivate = segmentGroup.segments[0];
		client.rollback?.({ type: MergeTreeDeltaType.INSERT }, segmentGroup);

		// do some work and move the client's min seq forward, so zamboni runs
		for (const c of "hello world") {
			client.applyMsg(
				client.makeOpMessage(
					client.insertTextLocal(client.getLength(), c),
					client.getCurrentSeq() + 1,
					client.getCurrentSeq(),
					undefined,
					client.getCurrentSeq(),
				),
			);
		}

		assert.equal(segment.parent, undefined);
	});
	it("Should rollback annotate marker", () => {
		client.insertMarkerLocal(0, ReferenceType.Simple, {
			[reservedMarkerIdKey]: "markerId",
		});
		const marker = client.getMarkerFromId("markerId") as Marker;
		client.annotateMarker(marker, { foo: "bar" });
		client.rollback?.(
			{ type: MergeTreeDeltaType.ANNOTATE },
			client.peekPendingSegmentGroups(),
		);

		const properties = marker.getProperties();
		assert.equal(properties?.foo, undefined);
	});
	it("Should rollback annotate marker overwriting property", () => {
		client.insertMarkerLocal(0, ReferenceType.Simple, {
			[reservedMarkerIdKey]: "markerId",
			foo: "bar",
		});
		const marker = client.getMarkerFromId("markerId") as Marker;
		client.annotateMarker(marker, { foo: "baz" });
		client.rollback?.(
			{ type: MergeTreeDeltaType.ANNOTATE },
			client.peekPendingSegmentGroups(),
		);

		const properties = marker.getProperties();
		assert.equal(properties?.foo, "bar");
	});
	it("Should rollback annotate marker removing property", () => {
		client.insertMarkerLocal(0, ReferenceType.Simple, {
			[reservedMarkerIdKey]: "markerId",
			foo: "bar",
		});
		const marker = client.getMarkerFromId("markerId") as Marker;
		// eslint-disable-next-line unicorn/no-null
		client.annotateMarker(marker, { foo: null });
		client.rollback?.(
			{ type: MergeTreeDeltaType.ANNOTATE },
			client.peekPendingSegmentGroups(),
		);

		const properties = marker.getProperties();
		assert.equal(properties?.foo, "bar");
	});
	it("Should rollback annotate marker rewrite", () => {
		client.insertMarkerLocal(0, ReferenceType.Simple, {
			[reservedMarkerIdKey]: "markerId",
			foo: "bar",
		});
		const marker = client.getMarkerFromId("markerId") as Marker;
		client.annotateMarker(marker, { [reservedMarkerIdKey]: "markerId", abc: "def" });
		client.rollback?.(
			{ type: MergeTreeDeltaType.ANNOTATE },
			client.peekPendingSegmentGroups(),
		);

		const properties = marker.getProperties();
		assert.equal(properties?.foo, "bar");
		assert.equal(properties?.abc, undefined);
	});
	it("Should rollback annotate rewrite with explicit null", () => {
		client.insertMarkerLocal(0, ReferenceType.Simple, {
			[reservedMarkerIdKey]: "markerId",
			foo: "bar",
		});
		const marker = client.getMarkerFromId("markerId") as Marker;
		client.annotateMarker(marker, {
			[reservedMarkerIdKey]: "markerId",
			abc: "def",
			// eslint-disable-next-line unicorn/no-null
			foo: null,
		});
		client.rollback?.(
			{ type: MergeTreeDeltaType.ANNOTATE },
			client.peekPendingSegmentGroups(),
		);

		const properties = marker.getProperties();
		assert.equal(properties?.foo, "bar");
		assert.equal(properties?.abc, undefined);
	});
	it("Should rollback annotate causes split string", () => {
		client.insertTextLocal(0, "abcdefg");
		client.annotateRangeLocal(1, 3, { foo: "bar" });
		client.rollback?.(
			{ type: MergeTreeDeltaType.ANNOTATE },
			client.peekPendingSegmentGroups(),
		);

		for (let i = 0; i < 4; i++) {
			const props = client.getPropertiesAtPosition(i);
			assert(props === undefined || props.foo === undefined);
		}
	});
	it("Should rollback annotate over split string", () => {
		client.insertTextLocal(0, "abfg");
		client.insertTextLocal(1, "cde");
		client.annotateRangeLocal(1, 6, { foo: "bar" });
		client.rollback?.(
			{ type: MergeTreeDeltaType.ANNOTATE },
			client.peekPendingSegmentGroups(),
		);

		for (let i = 0; i < 7; i++) {
			const props = client.getPropertiesAtPosition(i);
			assert(props === undefined || props.foo === undefined);
		}
	});
	it("Should rollback annotate that later gets split", () => {
		client.insertTextLocal(0, "abfg");
		client.annotateRangeLocal(0, 4, { foo: "bar" });
		client.insertTextLocal(1, "cde");
		client.rollback?.({ type: MergeTreeDeltaType.INSERT }, client.peekPendingSegmentGroups());
		client.rollback?.(
			{ type: MergeTreeDeltaType.ANNOTATE },
			client.peekPendingSegmentGroups(),
		);

		assert.equal(client.getText(), "abfg");
		for (let i = 0; i < 4; i++) {
			const props = client.getPropertiesAtPosition(i);
			assert(props === undefined || props.foo === undefined);
		}
	});
	it("Should rollback annotates with multiple previous property sets", () => {
		client.insertTextLocal(0, "acde");
		client.annotateRangeLocal(0, 3, { foo: "one" });
		client.annotateRangeLocal(2, 4, { foo: "two" });
		client.annotateRangeLocal(0, 3, { foo: "three" });
		client.insertTextLocal(1, "b");

		client.rollback?.({ type: MergeTreeDeltaType.INSERT }, client.peekPendingSegmentGroups());
		let props = client.getPropertiesAtPosition(3);
		assert(props !== undefined && props.foo === "two");
		for (let i = 0; i < 3; i++) {
			props = client.getPropertiesAtPosition(i);
			assert(props !== undefined && props.foo === "three");
		}

		client.rollback?.(
			{ type: MergeTreeDeltaType.ANNOTATE },
			client.peekPendingSegmentGroups(),
		);
		for (let i = 0; i < 2; i++) {
			props = client.getPropertiesAtPosition(i);
			assert(props !== undefined && props.foo === "one");
		}
		for (let i = 2; i < 4; i++) {
			props = client.getPropertiesAtPosition(i);
			assert(props !== undefined && props.foo === "two");
		}

		client.rollback?.(
			{ type: MergeTreeDeltaType.ANNOTATE },
			client.peekPendingSegmentGroups(),
		);
		props = client.getPropertiesAtPosition(3);
		assert(props === undefined || props.foo === undefined);
		for (let i = 0; i < 3; i++) {
			props = client.getPropertiesAtPosition(i);
			assert(props !== undefined && props.foo === "one");
		}

		client.rollback?.(
			{ type: MergeTreeDeltaType.ANNOTATE },
			client.peekPendingSegmentGroups(),
		);
		assert.equal(client.getText(), "acde");
		for (let i = 0; i < 4; i++) {
			props = client.getPropertiesAtPosition(i);
			assert(props === undefined || props.foo === undefined);
		}
	});
	it("Should rollback annotate with same prop", () => {
		client.insertTextLocal(0, "abcde");
		client.annotateRangeLocal(2, 3, { foo: "bar" });
		client.annotateRangeLocal(1, 4, { foo: "bar" });
		client.rollback?.(
			{ type: MergeTreeDeltaType.ANNOTATE },
			client.peekPendingSegmentGroups(),
		);

		for (let i = 0; i < 5; i++) {
			const props = client.getPropertiesAtPosition(i);
			if (i === 2) {
				assert.equal(props?.foo, "bar");
			} else {
				assert(props === undefined || props.foo === undefined);
			}
		}
	});
	it("Should zamboni rolled back annotated segment", () => {
		client.applyMsg(
			client.makeOpMessage(
				client.insertTextLocal(0, "abcde", { color: "red" }),
				client.getCurrentSeq() + 1,
				client.getCurrentSeq(),
				undefined,
				client.getCurrentSeq(),
			),
		);
		client.annotateRangeLocal(2, 3, { foo: "bar" });
		const segmentGroup = client.peekPendingSegmentGroups() as SegmentGroup;
		const segment: ISegmentPrivate = segmentGroup.segments[0];
		client.rollback?.({ type: MergeTreeDeltaType.ANNOTATE }, segmentGroup);

		// do some work and move the client's min seq forward, so zamboni runs
		for (const c of "hello world") {
			client.applyMsg(
				client.makeOpMessage(
					client.insertTextLocal(client.getLength(), c),
					client.getCurrentSeq() + 1,
					client.getCurrentSeq(),
					undefined,
					client.getCurrentSeq(),
				),
			);
		}

		assert.equal(segment.parent, undefined);
	});
	it("Should rollback delete on single segment", () => {
		client.insertTextLocal(0, "abcd");
		client.removeRangeLocal(0, 4);
		client.rollback?.({ type: MergeTreeDeltaType.REMOVE }, client.peekPendingSegmentGroups());

		assert.equal(client.getText(), "abcd");
	});
	it("Should rollback delete which causes split segments", () => {
		client.insertTextLocal(0, "abcde");
		client.removeRangeLocal(1, 4);
		let deltaEvent = false;
		client.on("delta", () => {
			assert.equal(client.getText(), "abcde");
			deltaEvent = true;
		});
		client.rollback?.({ type: MergeTreeDeltaType.REMOVE }, client.peekPendingSegmentGroups());

		assert.equal(client.getText(), "abcde");
		assert.equal(deltaEvent, true);
	});
	it("Should rollback delete across split segments", () => {
		client.insertTextLocal(0, "abcde");
		client.annotateRangeLocal(2, 3, { foo: "bar" });
		client.removeRangeLocal(1, 4);

		let deltaCount = 0;
		let bFound = false;
		let cFound = false;
		let dFound = false;
		client.on("delta", (_opArgs, delta) => {
			deltaCount++;
			assert.equal(client.getText().length, 2 + deltaCount);
			assert.equal(delta.deltaSegments.length, 1);
			assert.equal(delta.deltaSegments[0].segment.type, TextSegment.type);
			const text = (delta.deltaSegments[0].segment as TextSegment).toString();
			switch (text) {
				case "b": {
					bFound = true;
					break;
				}
				case "c": {
					cFound = true;
					break;
				}
				case "d": {
					dFound = true;
					break;
				}
				default: {
					assert(false, `Unexpected text segment: ${text}`);
				}
			}
		});
		client.rollback?.({ type: MergeTreeDeltaType.REMOVE }, client.peekPendingSegmentGroups());

		assert.equal(client.getText(), "abcde");
		assert.equal(deltaCount, 3);
		assert(bFound);
		assert(cFound);
		assert(dFound);
	});
	it("Should rollback delete and update blocks", () => {
		const text = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
		for (const c of text) {
			client.insertTextLocal(client.getLength(), c);
		}
		client.removeRangeLocal(1, 4);
		client.rollback?.({ type: MergeTreeDeltaType.REMOVE }, client.peekPendingSegmentGroups());
		// The insertion position calculation will be wrong if the blocks aren't updated correctly
		client.insertTextLocal(text.length - 1, "+");

		const expectedText = `${text.slice(0, Math.max(0, text.length - 1))}+${
			text[text.length - 1]
		}`;
		assert.equal(client.getText(), expectedText, client.getText());
	});
	it("Should rollback delete and restore local references", () => {
		client.insertTextLocal(0, "efg");
		client.insertTextLocal(0, "d");
		client.insertTextLocal(0, "abc");
		const segInfo1 = client.getContainingSegment<ISegmentPrivate>(2);
		const segInfo3 = client.getContainingSegment<ISegmentPrivate>(5);
		const ref1 = client.createLocalReferencePosition(
			segInfo1.segment!,
			0,
			ReferenceType.Simple,
			undefined,
		);
		const refSlide = client.createLocalReferencePosition(
			segInfo1.segment!,
			2,
			ReferenceType.SlideOnRemove,
			undefined,
		);
		const ref2 = client.createLocalReferencePosition(
			segInfo3.segment!,
			1,
			ReferenceType.Simple,
			undefined,
		);
		const refStay = client.createLocalReferencePosition(
			segInfo3.segment!,
			1,
			ReferenceType.StayOnRemove,
			undefined,
		);

		client.removeRangeLocal(0, 7);
		client.rollback?.({ type: MergeTreeDeltaType.REMOVE }, client.peekPendingSegmentGroups());

		assert.equal(client.getText(), "abcdefg");
		const segInfo1After = client.getContainingSegment<ISegmentPrivate>(2);
		assert.notEqual(segInfo1After, undefined);
		assert.notEqual(segInfo1After.segment?.localRefs, undefined);
		assert(segInfo1After.segment?.localRefs!.has(ref1));
		assert(segInfo1After.segment?.localRefs!.has(refSlide));
		const segInfo3After = client.getContainingSegment<ISegmentPrivate>(5);
		assert.notEqual(segInfo3After, undefined);
		assert.notEqual(segInfo3After.segment?.localRefs, undefined);
		assert(segInfo3After.segment?.localRefs!.has(ref2));
		assert(segInfo3After.segment?.localRefs!.has(refStay));
	});
	it("Should zamboni rolled back remove", () => {
		client.applyMsg(
			client.makeOpMessage(
				client.insertTextLocal(0, "abcde", { color: "red" }),
				client.getCurrentSeq() + 1,
				client.getCurrentSeq(),
				undefined,
				client.getCurrentSeq(),
			),
		);
		client.removeRangeLocal(1, 4);
		const segmentGroup = client.peekPendingSegmentGroups() as SegmentGroup;
		const segment: ISegmentPrivate = segmentGroup.segments[0];
		client.rollback?.({ type: MergeTreeDeltaType.REMOVE }, segmentGroup);

		// do some work and move the client's min seq forward, so zamboni runs
		for (const c of "hello world") {
			client.applyMsg(
				client.makeOpMessage(
					client.insertTextLocal(client.getLength(), c),
					client.getCurrentSeq() + 1,
					client.getCurrentSeq(),
					undefined,
					client.getCurrentSeq(),
				),
			);
		}

		assert.equal(segment.parent, undefined);
	});
	it("Should rollback multiple overlapping edits", () => {
		client.insertTextLocal(0, "abcdefg");
		client.insertTextLocal(3, "123");
		client.annotateRangeLocal(2, 5, { foo: "bar" });
		client.removeRangeLocal(3, 7);

		client.rollback?.({ type: MergeTreeDeltaType.REMOVE }, client.peekPendingSegmentGroups());
		assert.equal(client.getText(), "abc123defg");
		for (let i = 0; i < client.getText().length; i++) {
			const props = client.getPropertiesAtPosition(i);
			if (i >= 2 && i < 5) {
				assert.equal(props?.foo, "bar");
			} else {
				assert(props === undefined || props.foo === undefined);
			}
		}

		client.rollback?.(
			{ type: MergeTreeDeltaType.ANNOTATE },
			client.peekPendingSegmentGroups(),
		);
		for (let i = 0; i < client.getText().length; i++) {
			const props = client.getPropertiesAtPosition(i);
			assert(props === undefined || props.foo === undefined);
		}

		client.rollback?.({ type: MergeTreeDeltaType.INSERT }, client.peekPendingSegmentGroups());
		assert.equal(client.getText(), "abcdefg");
		client.rollback?.({ type: MergeTreeDeltaType.INSERT }, client.peekPendingSegmentGroups());
		assert.equal(client.getText(), "");
	});
	it("Should rollback multiple removes across split segments", () => {
		client.insertTextLocal(0, "abcde");
		client.insertTextLocal(3, "123");
		client.insertTextLocal(4, "xyz");
		client.removeRangeLocal(2, 5);
		client.removeRangeLocal(3, 7);
		client.removeRangeLocal(2, 4);

		client.rollback?.({ type: MergeTreeDeltaType.REMOVE }, client.peekPendingSegmentGroups());
		assert.equal(client.getText(), "abye");
		client.rollback?.({ type: MergeTreeDeltaType.REMOVE }, client.peekPendingSegmentGroups());
		assert.equal(client.getText(), "abyz23de");
		client.rollback?.({ type: MergeTreeDeltaType.REMOVE }, client.peekPendingSegmentGroups());
		assert.equal(client.getText(), "abc1xyz23de");
		client.rollback?.({ type: MergeTreeDeltaType.INSERT }, client.peekPendingSegmentGroups());
		assert.equal(client.getText(), "abc123de");
		client.rollback?.({ type: MergeTreeDeltaType.INSERT }, client.peekPendingSegmentGroups());
		assert.equal(client.getText(), "abcde");
		client.rollback?.({ type: MergeTreeDeltaType.INSERT }, client.peekPendingSegmentGroups());
		assert.equal(client.getText(), "");
	});
	it("Should annotate a previously removed range", () => {
		client.insertTextLocal(0, "abcdefg");
		client.insertTextLocal(3, "123");
		client.removeRangeLocal(2, 8);

		client.rollback?.({ type: MergeTreeDeltaType.REMOVE }, client.peekPendingSegmentGroups());
		assert.equal(client.getText(), "abc123defg");

		client.annotateRangeLocal(2, 8, { foo: "bar" });
		for (let i = 0; i < client.getText().length; i++) {
			const props = client.getPropertiesAtPosition(i);
			if (i >= 2 && i < 8) {
				assert.equal(props?.foo, "bar");
			} else {
				assert(props === undefined || props.foo === undefined);
			}
		}

		client.rollback?.(
			{ type: MergeTreeDeltaType.ANNOTATE },
			client.peekPendingSegmentGroups(),
		);
		for (let i = 0; i < client.getText().length; i++) {
			const props = client.getPropertiesAtPosition(i);
			assert(props === undefined || props.foo === undefined);
		}
		client.rollback?.({ type: MergeTreeDeltaType.INSERT }, client.peekPendingSegmentGroups());
		assert.equal(client.getText(), "abcdefg");
		client.rollback?.({ type: MergeTreeDeltaType.INSERT }, client.peekPendingSegmentGroups());
		assert.equal(client.getText(), "");
	});
	it("Should rollback overlapping annotates and remove", () => {
		client.insertTextLocal(0, "abc123defg");
		client.annotateRangeLocal(0, 6, { foo: "one" });
		client.annotateRangeLocal(5, 10, { foo: "two" });
		client.removeRangeLocal(4, 8);
		client.rollback?.({ type: MergeTreeDeltaType.REMOVE }, client.peekPendingSegmentGroups());
		assert.equal(client.getPropertiesAtPosition(4)?.foo, "one");
		assert.equal(client.getPropertiesAtPosition(5)?.foo, "two");
		client.rollback?.(
			{ type: MergeTreeDeltaType.ANNOTATE },
			client.peekPendingSegmentGroups(),
		);
		for (let i = 0; i < client.getText().length; i++) {
			const props = client.getPropertiesAtPosition(i);
			if (i >= 0 && i < 6) {
				assert.equal(props?.foo, "one");
			} else {
				assert(props === undefined || props.foo === undefined);
			}
		}
		client.rollback?.(
			{ type: MergeTreeDeltaType.ANNOTATE },
			client.peekPendingSegmentGroups(),
		);
		for (let i = 0; i < client.getText().length; i++) {
			const props = client.getPropertiesAtPosition(i);
			assert(props === undefined || props.foo === undefined);
		}
		client.rollback?.({ type: MergeTreeDeltaType.INSERT }, client.peekPendingSegmentGroups());
		assert.equal(client.getText(), "");
	});
	it("Should function properly after rollback with local ops", () => {
		client.insertTextLocal(0, "abcdefg");
		client.removeRangeLocal(1, 5);

		client.rollback?.({ type: MergeTreeDeltaType.REMOVE }, client.peekPendingSegmentGroups());

		client.removeRangeLocal(2, 4);
		assert.equal(client.getText(), "abefg");

		client.annotateRangeLocal(2, 5, { foo: "bar" });
		for (let i = 0; i < client.getText().length; i++) {
			const props = client.getPropertiesAtPosition(i);
			if (i >= 2 && i < 5) {
				assert.equal(props?.foo, "bar");
			} else {
				assert(props === undefined || props.foo === undefined);
			}
		}

		client.insertTextLocal(1, "123");
		assert.equal(client.getText(), "a123befg");
	});
	it("Should function properly after rollback with external ops", () => {
		const remoteClient = new TestClient();
		remoteClient.startOrUpdateCollaboration("remoteUser");
		const clients = [client, remoteClient];
		let seq = 0;
		const logger = new TestClientLogger(clients);
		logger.validate();

		let msg = remoteClient.makeOpMessage(remoteClient.insertTextLocal(0, "12345"), ++seq);
		for (const c of clients) c.applyMsg(msg);
		logger.validate({ baseText: "12345" });

		client.removeRangeLocal(1, 4);
		client.rollback?.({ type: MergeTreeDeltaType.REMOVE }, client.peekPendingSegmentGroups());

		msg = remoteClient.makeOpMessage(remoteClient.removeRangeLocal(2, 3), ++seq);
		for (const c of clients) {
			c.applyMsg(msg);
		}

		logger.validate({ baseText: "1245" });

		msg = remoteClient.makeOpMessage(
			remoteClient.annotateRangeLocal(0, 3, { foo: "bar" }),
			++seq,
		);
		for (const c of clients) {
			c.applyMsg(msg);
		}

		logger.validate({ baseText: "1245" });
		for (const c of clients) {
			for (let i = 0; i < c.getText().length; i++) {
				const props = c.getPropertiesAtPosition(i);
				if (i >= 0 && i < 3) {
					assert.equal(props?.foo, "bar");
				} else {
					assert(props === undefined || props.foo === undefined);
				}
			}
		}

		msg = remoteClient.makeOpMessage(remoteClient.insertTextLocal(3, "abc"), ++seq);
		for (const c of clients) {
			c.applyMsg(msg);
		}

		logger.validate({ baseText: "124abc5" });
	});
});
