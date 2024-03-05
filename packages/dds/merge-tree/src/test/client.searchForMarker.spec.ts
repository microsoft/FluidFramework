/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { makeRandom } from "@fluid-private/stochastic-test-utils";
import { UniversalSequenceNumber } from "../constants.js";
import { reservedMarkerIdKey, MaxNodesInBlock } from "../mergeTreeNodes.js";
import { MergeTreeDeltaType, ReferenceType } from "../ops.js";
import { reservedTileLabelsKey } from "../referencePositions.js";
import { TextSegment } from "../textSegment.js";
import { TestClient } from "./testClient.js";
import { insertSegments } from "./testUtils.js";
import { createClientsAtInitialState } from "./testClientLogger.js";

describe("TestClient", () => {
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

	describe(".searchForMarker", () => {
		it("Should return marker at the search position in either direction", () => {
			client.insertTextLocal(0, "abcdefg");
			client.insertMarkerLocal(4, ReferenceType.Tile, {
				[reservedMarkerIdKey]: "marker",
				[reservedTileLabelsKey]: ["Eop"],
			});
			assert.equal(client.getLength(), 8);

			const marker1 = client.searchForMarker(4, "Eop", true);

			assert(marker1, "Returned marker undefined.");

			let exp = client.mergeTree.referencePositionToLocalPosition(
				marker1,
				UniversalSequenceNumber,
				client.getClientId(),
			);

			assert.equal(exp, 4, "Marker with label not at expected position");

			const marker2 = client.searchForMarker(4, "Eop", false);

			assert(marker2, "Returned marker undefined.");

			exp = client.mergeTree.referencePositionToLocalPosition(
				marker2,
				UniversalSequenceNumber,
				client.getClientId(),
			);

			assert.equal(exp, 4, "Marker with label not at expected position");
		});

		it("Should return the marker at the search position in either direction from multiple blocks", () => {
			client.insertTextLocal(0, "abcd");
			client.insertTextLocal(4, "efg");
			client.insertMarkerLocal(4, ReferenceType.Tile, {
				[reservedMarkerIdKey]: "marker",
				[reservedTileLabelsKey]: ["Eop"],
			});
			assert.equal(client.getLength(), 8);

			const marker1 = client.searchForMarker(4, "Eop", true);

			assert(marker1, "Returned marker undefined.");

			let exp = client.mergeTree.referencePositionToLocalPosition(
				marker1,
				UniversalSequenceNumber,
				client.getClientId(),
			);

			assert.equal(exp, 4, "Marker with label not at expected position");

			const marker2 = client.searchForMarker(4, "Eop", false);

			assert(marker2, "Returned marker undefined.");

			exp = client.mergeTree.referencePositionToLocalPosition(
				marker2,
				UniversalSequenceNumber,
				client.getClientId(),
			);

			assert.equal(exp, 4, "Marker with label not at expected position");
		});

		it("Should be able to find forward marker position based on label", () => {
			const markerLabel = "EOP";

			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [markerLabel],
				[reservedMarkerIdKey]: "some-id",
			});

			client.insertTextLocal(0, "abc");

			assert.equal(client.getLength(), 4, "length not expected");

			const marker = client.searchForMarker(0, markerLabel, true);

			assert(marker, "Returned marker undefined.");

			const exp = client.mergeTree.referencePositionToLocalPosition(
				marker,
				UniversalSequenceNumber,
				client.getClientId(),
			);

			assert.equal(exp, 3, "Marker with label not at expected position");
		});

		it("Should be able to find forward marker position based on label from client with single marker", () => {
			const markerLabel = "EOP";
			client.insertTextLocal(0, "abc d");

			client.insertMarkerLocal(1, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [markerLabel],
				[reservedMarkerIdKey]: "some-id",
			});

			assert.equal(client.getLength(), 6, "length not expected");

			const marker = client.searchForMarker(0, markerLabel, true);

			assert(marker, "Returned marker undefined.");

			const exp = client.mergeTree.referencePositionToLocalPosition(
				marker,
				UniversalSequenceNumber,
				client.getClientId(),
			);
			assert.equal(exp, 1, "Marker with label not at expected position");
		});

		it("Should be able to find backward marker position based on label from client with multiple marker", () => {
			const markerLabel = "EOP";
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [markerLabel],
				[reservedMarkerIdKey]: "some-id",
			});

			client.insertTextLocal(0, "abc d");

			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [markerLabel],
				[reservedMarkerIdKey]: "some-id",
			});

			client.insertTextLocal(7, "ef");
			client.insertMarkerLocal(8, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [markerLabel],
				[reservedMarkerIdKey]: "some-id",
			});

			assert.equal(client.getLength(), 10, "length not expected");

			const marker = client.searchForMarker(5, markerLabel, false);

			assert(marker, "Returned marker undefined.");

			const exp = client.mergeTree.referencePositionToLocalPosition(
				marker,
				UniversalSequenceNumber,
				client.getClientId(),
			);

			assert.equal(exp, 0, "Marker with label not at expected position");
		});

		it("Should be able to find forward marker position from client with multiple marker", () => {
			const markerLabel = "EOP";
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [markerLabel],
				[reservedMarkerIdKey]: "some-id",
			});

			client.insertTextLocal(0, "abc d");

			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [markerLabel],
				[reservedMarkerIdKey]: "some-id",
			});

			client.insertTextLocal(7, "ef");
			client.insertMarkerLocal(8, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [markerLabel],
				[reservedMarkerIdKey]: "some-id",
			});

			assert.equal(client.getLength(), 10, "length not expected");

			const marker = client.searchForMarker(5, markerLabel, true);

			assert(marker, "Returned marker undefined.");

			const exp = client.mergeTree.referencePositionToLocalPosition(
				marker,
				UniversalSequenceNumber,
				client.getClientId(),
			);

			assert.equal(exp, 6, "Marker with label not at expected position");
		});

		it("Should be able to find forward marker position with multiple segments and markers", () => {
			const markerLabel = "EOP";
			Array.from({ length: MaxNodesInBlock ** 3 * 2 }).forEach((_, i) =>
				client.insertTextLocal(0, i.toString()),
			);
			// pad the string with markers on both ends so we never get undefined solely for convenience of this test
			for (let i = 0; i <= client.getLength(); i += 3) {
				client.insertMarkerLocal(i, ReferenceType.Tile, {
					[reservedTileLabelsKey]: [markerLabel],
					[reservedMarkerIdKey]: "some-id",
				});
			}
			for (let index = 0; index < client.getLength(); index++) {
				const marker = client.searchForMarker(index, markerLabel, true);

				assert(marker, `Returned marker undefined @ ${index}.`);

				const exp = client.mergeTree.referencePositionToLocalPosition(
					marker,
					UniversalSequenceNumber,
					client.getClientId(),
				);

				const offset = index % 3 === 0 ? index % 3 : 3 - (index % 3);
				assert.equal(exp, index + offset, "Marker with label not at expected position");
			}
		});

		it("Should be able to find backward marker position with multiple segments and markers", () => {
			const markerLabel = "EOP";
			Array.from({ length: MaxNodesInBlock ** 3 * 2 }).forEach((_, i) =>
				client.insertTextLocal(0, i.toString()),
			);
			// pad the string with markers on both ends so we never get undefined solely for convenience of this test
			for (let i = 0; i <= client.getLength(); i += 3) {
				client.insertMarkerLocal(i, ReferenceType.Tile, {
					[reservedTileLabelsKey]: [markerLabel],
					[reservedMarkerIdKey]: "some-id",
				});
			}
			for (let index = client.getLength() - 1; index >= 0; index--) {
				const marker = client.searchForMarker(index, markerLabel, false);

				assert(marker, `Returned marker undefined @ ${index}.`);

				const exp = client.mergeTree.referencePositionToLocalPosition(
					marker,
					UniversalSequenceNumber,
					client.getClientId(),
				);

				assert.equal(
					exp,
					index - (index % 3),
					"Marker with label not at expected position",
				);
			}
		});

		it("Should be able to find distant forward marker", () => {
			const markerLabel = "EOP";
			Array.from({ length: MaxNodesInBlock ** 3 * 2 }).forEach((_, i) =>
				client.insertTextLocal(0, i.toString()),
			);
			for (let i = 10; i > 1; i -= 2) {
				client.insertMarkerLocal(client.getLength() - i, ReferenceType.Tile, {
					[reservedTileLabelsKey]: [markerLabel],
					[reservedMarkerIdKey]: "some-id",
				});
			}

			for (let index = 0; index < client.getLength(); index++) {
				const exp = client.slowSearchForMarker(index, markerLabel, true);
				const actual = client.searchForMarker(index, markerLabel, true);

				assert.equal(exp, actual, "Marker with label not at expected position");
			}
		});

		it("Should be able to find distant backward marker", () => {
			const markerLabel = "EOP";
			Array.from({ length: MaxNodesInBlock ** 3 * 2 }).forEach((_, i) =>
				client.insertTextLocal(0, i.toString()),
			);
			for (let i = 10; i > 1; i -= 2) {
				client.insertMarkerLocal(client.getLength() - i, ReferenceType.Tile, {
					[reservedTileLabelsKey]: [markerLabel],
					[reservedMarkerIdKey]: "some-id",
				});
			}

			for (let index = client.getLength() - 1; index >= 0; index--) {
				const exp = client.slowSearchForMarker(index, markerLabel, false);
				const actual = client.searchForMarker(index, markerLabel, false);

				assert.equal(exp, actual, "Marker with label not at expected position");
			}
		});

		it("Should match results from forwardExcursion for many segments", () => {
			const markerLabel = "EOP";
			Array.from({ length: MaxNodesInBlock * 3 }).forEach((_, i) =>
				client.insertTextLocal(0, i.toString()),
			);
			const random = makeRandom(0xdeadbeef, 0xfeedbed, client.getLength());
			for (let i = 0; i <= client.getLength() / 6; i++) {
				const pos = random.integer(0, client.getLength() - 1);
				client.insertMarkerLocal(pos, ReferenceType.Tile, {
					[reservedTileLabelsKey]: [markerLabel],
					[reservedMarkerIdKey]: "some-id",
				});
			}
			for (let index = 0; index < client.getLength(); index++) {
				const exp = client.slowSearchForMarker(index, markerLabel, true);
				const actual = client.searchForMarker(index, markerLabel, true);

				assert.equal(exp, actual, "Marker with label not at expected position");
			}
		});

		it("Should match results from backwardExcursion for many segments", () => {
			const markerLabel = "EOP";
			Array.from({ length: MaxNodesInBlock * 3 }).forEach((_, i) =>
				client.insertTextLocal(0, i.toString()),
			);
			const random = makeRandom(0xdeadbeef, 0xfeedbed, client.getLength());
			for (let i = 0; i <= client.getLength() / 6; i++) {
				const pos = random.integer(0, client.getLength() - 1);
				client.insertMarkerLocal(pos, ReferenceType.Tile, {
					[reservedTileLabelsKey]: [markerLabel],
					[reservedMarkerIdKey]: "some-id",
				});
			}
			for (let index = 0; index < client.getLength(); index++) {
				const exp = client.slowSearchForMarker(index, markerLabel, false);
				const actual = client.searchForMarker(index, markerLabel, false);

				assert.equal(exp, actual, "Marker with label not at expected position");
			}
		});

		it("Should be able to find marker from client with text length 1", () => {
			const markerLabel = "EOP";
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [markerLabel],
				[reservedMarkerIdKey]: "some-id",
			});

			assert.equal(client.getLength(), 1, "length not expected");

			const marker = client.searchForMarker(client.getLength() - 1, markerLabel, false);

			assert(marker, "Returned marker undefined.");

			let exp = client.mergeTree.referencePositionToLocalPosition(
				marker,
				UniversalSequenceNumber,
				client.getClientId(),
			);

			assert.equal(exp, 0, "Marker with label not at expected position");

			const marker1 = client.searchForMarker(0, markerLabel, true);

			assert(marker1, "Returned marker undefined.");

			exp = client.mergeTree.referencePositionToLocalPosition(
				marker,
				UniversalSequenceNumber,
				client.getClientId(),
			);

			assert.equal(exp, 0, "Marker with label not at expected position");
		});

		it("Should not be able to find marker position with index out of bound", () => {
			const markerLabel = "EOP";
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [markerLabel],
				[reservedMarkerIdKey]: "some-id",
			});

			client.insertTextLocal(0, "abc");

			assert.equal(client.getLength(), 4, "length not expected");

			const marker = client.searchForMarker(5, markerLabel, true);

			assert.equal(marker, undefined, "Returned marker should be undefined.");

			const marker1 = client.searchForMarker(5, markerLabel, false);

			assert.equal(marker1, undefined, "Returned marker should be undefined.");

			const marker2 = client.searchForMarker(-1, markerLabel, false);

			assert.equal(marker2, undefined, "Returned marker should be undefined.");
		});

		it("Should be able to find a deleted and rolled back marker", () => {
			client.insertTextLocal(0, "abc");
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedMarkerIdKey]: "marker",
				[reservedTileLabelsKey]: ["Eop"],
			});

			client.removeRangeLocal(0, 1);

			client.rollback?.(
				{ type: MergeTreeDeltaType.REMOVE },
				client.peekPendingSegmentGroups(),
			);

			const marker = client.searchForMarker(0, "Eop", true);

			assert(marker, "Returned marker undefined.");

			const exp = client.mergeTree.referencePositionToLocalPosition(
				marker,
				UniversalSequenceNumber,
				client.getClientId(),
			);

			assert.equal(exp, 0, "Marker with label not at expected position");
		});

		it("Should not be able to find an inserted and rolled back marker", () => {
			client.insertTextLocal(0, "abc");
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedMarkerIdKey]: "marker",
				[reservedTileLabelsKey]: ["Eop"],
			});

			client.rollback?.(
				{ type: MergeTreeDeltaType.INSERT },
				client.peekPendingSegmentGroups(),
			);

			const marker = client.searchForMarker(0, "Eop", true);

			assert.equal(marker, undefined, "Returned marker should be undefined.");
		});

		it("Should be able to find a marker at 0 searching at 0 in both directions", () => {
			client.insertTextLocal(0, "abc");
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedMarkerIdKey]: "marker",
				[reservedTileLabelsKey]: ["Eop"],
			});

			assert.equal(client.getLength(), 4);

			const marker = client.searchForMarker(0, "Eop", true);

			assert(marker, "Returned marker undefined.");

			let exp = client.mergeTree.referencePositionToLocalPosition(
				marker,
				UniversalSequenceNumber,
				client.getClientId(),
			);

			assert.equal(exp, 0, "Marker with label not at expected position");

			const marker2 = client.searchForMarker(0, "Eop", false);

			assert(marker2, "Returned marker undefined.");

			exp = client.mergeTree.referencePositionToLocalPosition(
				marker2,
				UniversalSequenceNumber,
				client.getClientId(),
			);

			assert.equal(exp, 0, "Marker with label not at expected position");
		});

		it("Should be able to find a marker at length-1 searching at length-1 in both directions", () => {
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedMarkerIdKey]: "marker",
				[reservedTileLabelsKey]: ["Eop"],
			});
			client.insertTextLocal(0, "abc");

			const length = client.getLength();
			assert.equal(length, 4);

			const marker = client.searchForMarker(length - 1, "Eop", true);

			assert(marker, "Returned marker undefined.");

			let exp = client.mergeTree.referencePositionToLocalPosition(
				marker,
				UniversalSequenceNumber,
				client.getClientId(),
			);

			assert.equal(exp, length - 1, "Marker with label not at expected position");

			const marker2 = client.searchForMarker(length - 1, "Eop", false);

			assert(marker2, "Returned marker undefined.");

			exp = client.mergeTree.referencePositionToLocalPosition(
				marker2,
				UniversalSequenceNumber,
				client.getClientId(),
			);

			assert.equal(exp, length - 1, "Marker with label not at expected position");
		});

		it("Should return undefined when searching past the end of a string length 1", () => {
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedMarkerIdKey]: "marker",
				[reservedTileLabelsKey]: ["Eop"],
			});

			assert.equal(client.getLength(), 1);
			const marker = client.searchForMarker(client.getLength(), "Eop", true);

			assert.equal(marker, undefined, "Returned marker should be undefined.");
		});

		it("Should return undefined when searching before the start of a string length 1", () => {
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedMarkerIdKey]: "marker",
				[reservedTileLabelsKey]: ["Eop"],
			});

			assert.equal(client.getLength(), 1);

			const marker = client.searchForMarker(-1, "Eop", false);

			assert.equal(marker, undefined, "Returned marker should be undefined.");
		});

		it("Should return undefined when searching past the end of a string length > 1", () => {
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedMarkerIdKey]: "marker",
				[reservedTileLabelsKey]: ["Eop"],
			});
			client.insertTextLocal(0, "abc");

			assert.equal(client.getLength(), 4);

			const marker = client.searchForMarker(client.getLength(), "Eop", true);

			assert.equal(marker, undefined, "Returned marker should be undefined.");
		});

		it("Should return undefined when searching before the start of a string length > 1", () => {
			client.insertTextLocal(0, "abc");
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedMarkerIdKey]: "marker",
				[reservedTileLabelsKey]: ["Eop"],
			});

			assert.equal(client.getLength(), 4);

			const marker = client.searchForMarker(-1, "Eop", false);

			assert.equal(marker, undefined, "Returned marker should be undefined.");
		});

		it("Should return undefined when trying to find marker from text without the specified marker", () => {
			const markerLabel = "EOP";
			client.insertTextLocal(0, "abc");

			assert.equal(client.getLength(), 3, "length not expected");

			const marker = client.searchForMarker(1, markerLabel);

			assert.equal(marker, undefined, "Returned marker should be undefined.");

			const marker1 = client.searchForMarker(1, markerLabel, false);

			assert.equal(marker1, undefined, "Returned marker should be undefined.");
		});

		it("Should return undefined when trying to find marker from null text", () => {
			const markerLabel = "EOP";

			const marker = client.searchForMarker(1, markerLabel);

			assert.equal(marker, undefined, "Returned marker should be undefined.");

			const marker1 = client.searchForMarker(1, markerLabel, false);

			assert.equal(marker1, undefined, "Returned marker should be undefined.");
		});

		it("Should return undefined when trying to find a removed marker", () => {
			client.insertTextLocal(0, "abc");
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedMarkerIdKey]: "marker",
				[reservedTileLabelsKey]: ["Eop"],
			});

			assert.equal(client.getLength(), 4, "length not expected");

			client.removeRangeLocal(0, 1);

			assert.equal(client.getLength(), 3, "length not expected");

			const marker = client.searchForMarker(0, "Eop", true);

			assert.equal(marker, undefined, "Returned marker should be undefined");
		});

		describe("with remote client", () => {
			const remoteUserLongId = "remoteUser";
			let client2: TestClient;
			beforeEach(() => {
				client2 = new TestClient();
				insertSegments({
					mergeTree: client2.mergeTree,
					pos: 0,
					segments: [TextSegment.make("")],
					refSeq: UniversalSequenceNumber,
					clientId: client2.getClientId(),
					seq: UniversalSequenceNumber,
					opArgs: undefined,
				});
				client2.startOrUpdateCollaboration(remoteUserLongId);
			});

			it("Should be able to find remotely inserted marker", () => {
				let seq = 0;
				const textMsg = client.makeOpMessage(client.insertTextLocal(0, "abc"), ++seq);
				const markerMsg = client2.makeOpMessage(
					client2.insertMarkerLocal(0, ReferenceType.Tile, {
						[reservedMarkerIdKey]: "marker",
						[reservedTileLabelsKey]: ["Eop"],
					}),
					++seq,
				);
				client.applyMsg(textMsg);
				client2.applyMsg(textMsg);
				client.applyMsg(markerMsg);
				client2.applyMsg(markerMsg);

				assert.equal(client.getLength(), 4, "length not expected - client");
				assert.equal(client2.getLength(), 4, "length not expected - client 2");

				const marker = client.searchForMarker(0, "Eop", true);

				assert(marker, "Returned marker undefined");

				const exp = client.mergeTree.referencePositionToLocalPosition(
					marker,
					UniversalSequenceNumber,
					client.getClientId(),
				);

				assert.equal(exp, 0, "Marker with label not at expected position");
			});

			it("Should not be able to find remotely removed marker", () => {
				let seq = 0;
				const textMsg = client.makeOpMessage(client.insertTextLocal(0, "abc"), ++seq);
				const mInsertMsg = client.makeOpMessage(
					client.insertMarkerLocal(0, ReferenceType.Tile, {
						[reservedMarkerIdKey]: "marker",
						[reservedTileLabelsKey]: ["Eop"],
					}),
					seq,
				);
				client.applyMsg(textMsg);
				client2.applyMsg(textMsg);
				client.applyMsg(mInsertMsg);
				client2.applyMsg(mInsertMsg);

				assert.equal(client.getLength(), 4, "length not expected - client");
				assert.equal(client2.getLength(), 4, "length not expected - client 2");

				const mRemoveMsg = client2.makeOpMessage(client2.removeRangeLocal(0, 1), seq);
				client.applyMsg(mRemoveMsg);
				client2.applyMsg(mRemoveMsg);

				assert.equal(client.getLength(), 3, "length not expected - client");
				assert.equal(client2.getLength(), 3, "length not expected - client 2");

				const marker = client.searchForMarker(0, "Eop", true);

				assert.equal(marker, undefined, "Returned marker should be undefined.");
			});
		});
	});
	describe(".getMarkerById", () => {
		it("removed marker", () => {
			const clients = createClientsAtInitialState({ initialState: "hello world" }, "A", "B");

			const randomMarkerKey = "randomKey1";

			assert(!clients.A.getMarkerFromId(randomMarkerKey), "local client before insert");

			const ops = [
				clients.A.makeOpMessage(
					clients.A.insertMarkerLocal(5, ReferenceType.Simple, {
						[reservedMarkerIdKey]: randomMarkerKey,
					}),
					1,
				),
			];

			assert(
				clients.A.getMarkerFromId(randomMarkerKey),
				"local client after insert before ack",
			);

			ops.splice(0).forEach((op) => {
				clients.all.forEach((c) => c.applyMsg(op));
			});

			assert(
				clients.A.getMarkerFromId(randomMarkerKey),
				"local client after insert after ack",
			);
			assert(
				clients.B.getMarkerFromId(randomMarkerKey),
				"remote client after insert after ack",
			);

			ops.push(clients.A.makeOpMessage(clients.A.removeRangeLocal(5, 6), 1));

			assert(
				!clients.A.getMarkerFromId(randomMarkerKey),
				"local client after remove before ack",
			);
			assert(
				clients.B.getMarkerFromId(randomMarkerKey),
				"remote client after remove before ack",
			);

			ops.splice(0).forEach((op) => {
				clients.all.forEach((c) => c.applyMsg(op));
			});

			assert(
				!clients.A.getMarkerFromId(randomMarkerKey),
				"local client after remove after ack",
			);
			assert(
				!clients.B.getMarkerFromId(randomMarkerKey),
				"remote client after remove after ack",
			);
		});
		it("obliterate marker", () => {
			const clients = createClientsAtInitialState(
				{ initialState: "hello world", options: { mergeTreeEnableObliterate: true } },
				"A",
				"B",
			);

			const randomMarkerKey = "randomKey1";

			assert(!clients.A.getMarkerFromId(randomMarkerKey), "local client before insert");

			const ops = [
				clients.A.makeOpMessage(
					clients.A.insertMarkerLocal(5, ReferenceType.Simple, {
						[reservedMarkerIdKey]: randomMarkerKey,
					}),
					1,
				),
			];

			assert(
				clients.A.getMarkerFromId(randomMarkerKey),
				"local client after insert before ack",
			);

			ops.splice(0).forEach((op) => {
				clients.all.forEach((c) => c.applyMsg(op));
			});

			assert(
				clients.A.getMarkerFromId(randomMarkerKey),
				"local client after insert after ack",
			);
			assert(
				clients.B.getMarkerFromId(randomMarkerKey),
				"remote client after insert after ack",
			);

			ops.push(clients.A.makeOpMessage(clients.A.obliterateRangeLocal(5, 6), 1));

			assert(
				!clients.A.getMarkerFromId(randomMarkerKey),
				"local client after obliterate before ack",
			);
			assert(
				clients.B.getMarkerFromId(randomMarkerKey),
				"remote client after obliterate before ack",
			);

			ops.splice(0).forEach((op) => {
				clients.all.forEach((c) => c.applyMsg(op));
			});

			assert(
				!clients.A.getMarkerFromId(randomMarkerKey),
				"local client after obliterate after ack",
			);
			assert(
				!clients.B.getMarkerFromId(randomMarkerKey),
				"remote client after obliterate after ack",
			);
		});
	});
});
