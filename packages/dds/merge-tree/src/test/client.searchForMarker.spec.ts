/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { UniversalSequenceNumber } from "../constants";
import { reservedMarkerIdKey, MaxNodesInBlock } from "../mergeTreeNodes";
import { ReferenceType } from "../ops";
import { reservedTileLabelsKey } from "../referencePositions";
import { TextSegment } from "../textSegment";
import { TestClient } from "./testClient";
import { insertSegments } from "./testUtils";

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
		it("Should not return tile when searching past the end of a string length 1", () => {
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedMarkerIdKey]: "marker",
				[reservedTileLabelsKey]: ["Eop"],
			});

			assert.equal(client.getLength(), 1);
			const foundTile = client.searchForMarker(client.getLength(), "Eop", true);

			assert.equal(foundTile, undefined, "Returned tile should be undefined.");
		});

		it("Should not return tile when searching before the start of a string length 1", () => {
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedMarkerIdKey]: "marker",
				[reservedTileLabelsKey]: ["Eop"],
			});

			assert.equal(client.getLength(), 1);

			const foundTile = client.searchForMarker(-1, "Eop", false);

			assert.equal(foundTile, undefined, "Returned tile should be undefined.");
		});

		it("Should not return tile when searching past the end of a string length > 1", () => {
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedMarkerIdKey]: "marker",
				[reservedTileLabelsKey]: ["Eop"],
			});
			client.insertTextLocal(0, "abc");

			assert.equal(client.getLength(), 4);

			const foundTile = client.searchForMarker(client.getLength(), "Eop", true);

			assert.equal(foundTile, undefined, "Returned tile should be undefined.");
		});

		it("Should not return tile when searching before the start of a string length > 1", () => {
			client.insertTextLocal(0, "abc");
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedMarkerIdKey]: "marker",
				[reservedTileLabelsKey]: ["Eop"],
			});

			assert.equal(client.getLength(), 4);

			const foundTile = client.searchForMarker(-1, "Eop", false);

			assert.equal(foundTile, undefined, "Returned tile should be undefined.");
		});

		it("Should return tile at the search position in either direction", () => {
			client.insertTextLocal(0, "abcdefg");
			client.insertMarkerLocal(4, ReferenceType.Tile, {
				[reservedMarkerIdKey]: "marker",
				[reservedTileLabelsKey]: ["Eop"],
			});
			assert.equal(client.getLength(), 8);

			const tile1 = client.searchForMarker(4, "Eop", true);

			assert(tile1, "Returned tile undefined.");

			let exp = client.mergeTree.referencePositionToLocalPosition(
				tile1,
				UniversalSequenceNumber,
				client.getClientId(),
			);

			assert.equal(exp, 4, "Tile with label not at expected position");

			const tile2 = client.searchForMarker(4, "Eop", false);

			assert(tile2, "Returned tile undefined.");

			exp = client.mergeTree.referencePositionToLocalPosition(
				tile2,
				UniversalSequenceNumber,
				client.getClientId(),
			);

			assert.equal(exp, 4, "Tile with label not at expected position");
		});

		it("Should return the tile at the search position in either direction from multiple blocks", () => {
			client.insertTextLocal(0, "abcd");
			client.insertTextLocal(4, "efg");
			client.insertMarkerLocal(4, ReferenceType.Tile, {
				[reservedMarkerIdKey]: "marker",
				[reservedTileLabelsKey]: ["Eop"],
			});
			assert.equal(client.getLength(), 8);

			const tile1 = client.searchForMarker(4, "Eop", true);

			assert(tile1, "Returned tile undefined.");

			let exp = client.mergeTree.referencePositionToLocalPosition(
				tile1,
				UniversalSequenceNumber,
				client.getClientId(),
			);

			assert.equal(exp, 4, "Tile with label not at expected position");

			const tile2 = client.searchForMarker(4, "Eop", false);

			assert(tile2, "Returned tile undefined.");

			exp = client.mergeTree.referencePositionToLocalPosition(
				tile2,
				UniversalSequenceNumber,
				client.getClientId(),
			);

			assert.equal(exp, 4, "Tile with label not at expected position");
		});

		it("Should be able to find non preceding tile based on label", () => {
			const tileLabel = "EOP";

			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [tileLabel],
				[reservedMarkerIdKey]: "some-id",
			});

			client.insertTextLocal(0, "abc");

			console.log(client.getText());

			assert.equal(client.getLength(), 4, "length not expected");

			const tile = client.searchForMarker(0, tileLabel, true);

			assert(tile, "Returned tile undefined.");

			const exp = client.mergeTree.referencePositionToLocalPosition(
				tile,
				UniversalSequenceNumber,
				client.getClientId(),
			);

			assert.equal(exp, 3, "Tile with label not at expected position");
		});

		it("Should be able to find non preceding tile position based on label from client with single tile", () => {
			const tileLabel = "EOP";
			client.insertTextLocal(0, "abc d");

			client.insertMarkerLocal(1, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [tileLabel],
				[reservedMarkerIdKey]: "some-id",
			});
			console.log(client.getText());

			assert.equal(client.getLength(), 6, "length not expected");

			const tile = client.searchForMarker(0, tileLabel, true);

			assert(tile, "Returned tile undefined.");

			const exp = client.mergeTree.referencePositionToLocalPosition(
				tile,
				UniversalSequenceNumber,
				client.getClientId(),
			);
			assert.equal(exp, 1, "Tile with label not at expected position");
			// assert.equal(tile.tile, ref, "not equal");
		});

		it("Should be able to find preceding tile position based on label from client with multiple tile", () => {
			const tileLabel = "EOP";
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [tileLabel],
				[reservedMarkerIdKey]: "some-id",
			});

			client.insertTextLocal(0, "abc d");

			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [tileLabel],
				[reservedMarkerIdKey]: "some-id",
			});

			client.insertTextLocal(7, "ef");
			client.insertMarkerLocal(8, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [tileLabel],
				[reservedMarkerIdKey]: "some-id",
			});
			console.log(client.getText());

			assert.equal(client.getLength(), 10, "length not expected");

			const tile = client.searchForMarker(5, tileLabel, false);

			assert(tile, "Returned tile undefined.");

			const exp = client.mergeTree.referencePositionToLocalPosition(
				tile,
				UniversalSequenceNumber,
				client.getClientId(),
			);

			assert.equal(exp, 0, "Tile with label not at expected position");
		});

		it("Should be able to find non preceding tile position from client with multiple tile", () => {
			const tileLabel = "EOP";
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [tileLabel],
				[reservedMarkerIdKey]: "some-id",
			});

			client.insertTextLocal(0, "abc d");

			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [tileLabel],
				[reservedMarkerIdKey]: "some-id",
			});

			client.insertTextLocal(7, "ef");
			client.insertMarkerLocal(8, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [tileLabel],
				[reservedMarkerIdKey]: "some-id",
			});
			console.log(client.getText());

			assert.equal(client.getLength(), 10, "length not expected");

			const tile = client.searchForMarker(5, tileLabel, true);

			assert(tile, "Returned tile undefined.");

			const exp = client.mergeTree.referencePositionToLocalPosition(
				tile,
				UniversalSequenceNumber,
				client.getClientId(),
			);

			assert.equal(exp, 6, "Tile with label not at expected position");
		});

		it("Should be able to find non preceding tile with multiple segments and tiles", () => {
			const tileLabel = "EOP";
			Array.from({ length: MaxNodesInBlock ** 3 * 2 }).forEach((_, i) =>
				client.insertTextLocal(0, i.toString()),
			);
			// pad the string with markers on both ends so we never get undefined solely for convenience of this test
			for (let i = 0; i <= client.getLength(); i += 3) {
				client.insertMarkerLocal(i, ReferenceType.Tile, {
					[reservedTileLabelsKey]: [tileLabel],
					[reservedMarkerIdKey]: "some-id",
				});
			}
			for (let index = 0; index < client.getLength(); index++) {
				const tile = client.searchForMarker(index, tileLabel, true);

				assert(tile, `Returned tile undefined @ ${index}.`);

				const exp = client.mergeTree.referencePositionToLocalPosition(
					tile,
					UniversalSequenceNumber,
					client.getClientId(),
				);

				const offset = index % 3 === 0 ? index % 3 : 3 - (index % 3);
				assert.equal(exp, index + offset, "Tile with label not at expected position");
			}
		});

		it("Should be able to find preceding tile with multiple segments and tiles", () => {
			const tileLabel = "EOP";
			Array.from({ length: MaxNodesInBlock ** 3 * 2 }).forEach((_, i) =>
				client.insertTextLocal(0, i.toString()),
			);
			// pad the string with markers on both ends so we never get undefined solely for convenience of this test
			for (let i = 0; i <= client.getLength(); i += 3) {
				client.insertMarkerLocal(i, ReferenceType.Tile, {
					[reservedTileLabelsKey]: [tileLabel],
					[reservedMarkerIdKey]: "some-id",
				});
			}
			for (let index = client.getLength() - 1; index >= 0; index--) {
				const tile = client.searchForMarker(index, tileLabel, false);

				assert(tile, `Returned tile undefined @ ${index}.`);

				const exp = client.mergeTree.referencePositionToLocalPosition(
					tile,
					UniversalSequenceNumber,
					client.getClientId(),
				);

				assert.equal(exp, index - (index % 3), "Tile with label not at expected position");
			}
		});

		it("Should match results from forwardExcursion for many segments", () => {
			const tileLabel = "EOP";
			Array.from({ length: MaxNodesInBlock * 3 }).forEach((_, i) =>
				client.insertTextLocal(0, i.toString()),
			);
			const random = makeRandom(0xdeadbeef, 0xfeedbed, client.getLength());
			for (let i = 0; i <= client.getLength() / 6; i++) {
				const pos = random.integer(0, client.getLength() - 1);
				client.insertMarkerLocal(pos, ReferenceType.Tile, {
					[reservedTileLabelsKey]: [tileLabel],
					[reservedMarkerIdKey]: "some-id",
				});
			}
			for (let index = 0; index < client.getLength(); index++) {
				const exp = client.slowSearchForMarker(index, tileLabel, true);
				const actual = client.searchForMarker(index, tileLabel, true);

				assert.equal(exp, actual, "Tile with label not at expected position");
			}
		});

		it("Should match results from backwardExcursion for many segments", () => {
			const tileLabel = "EOP";
			Array.from({ length: MaxNodesInBlock * 3 }).forEach((_, i) =>
				client.insertTextLocal(0, i.toString()),
			);
			const random = makeRandom(0xdeadbeef, 0xfeedbed, client.getLength());
			for (let i = 0; i <= client.getLength() / 6; i++) {
				const pos = random.integer(0, client.getLength() - 1);
				client.insertMarkerLocal(pos, ReferenceType.Tile, {
					[reservedTileLabelsKey]: [tileLabel],
					[reservedMarkerIdKey]: "some-id",
				});
			}
			for (let index = 0; index < client.getLength(); index++) {
				const exp = client.slowSearchForMarker(index, tileLabel, false);
				const actual = client.searchForMarker(index, tileLabel, false);

				assert.equal(exp, actual, "Tile with label not at expected position");
			}
		});

		it("Should be able to find tile from client with text length 1", () => {
			const tileLabel = "EOP";
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [tileLabel],
				[reservedMarkerIdKey]: "some-id",
			});

			console.log(client.getText());

			assert.equal(client.getLength(), 1, "length not expected");

			const tile = client.searchForMarker(client.getLength() - 1, tileLabel, false);

			assert(tile, "Returned tile undefined.");

			let exp = client.mergeTree.referencePositionToLocalPosition(
				tile,
				UniversalSequenceNumber,
				client.getClientId(),
			);

			assert.equal(exp, 0, "Tile with label not at expected position");

			const tile1 = client.searchForMarker(0, tileLabel, true);

			assert(tile1, "Returned tile undefined.");

			exp = client.mergeTree.referencePositionToLocalPosition(
				tile,
				UniversalSequenceNumber,
				client.getClientId(),
			);

			assert.equal(exp, 0, "Tile with label not at expected position");
		});

		it("Should be able to find only preceding but not non preceding tile with index out of bound", () => {
			const tileLabel = "EOP";
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [tileLabel],
				[reservedMarkerIdKey]: "some-id",
			});

			client.insertTextLocal(0, "abc");
			console.log(client.getText());

			assert.equal(client.getLength(), 4, "length not expected");

			const tile = client.searchForMarker(5, tileLabel, true);

			assert.equal(tile, undefined, "Returned tile should be undefined.");

			const tile1 = client.searchForMarker(5, tileLabel, false);

			assert.equal(tile1, undefined, "Returned tile should be undefined.");

			const tile2 = client.searchForMarker(-1, tileLabel, false);

			assert.equal(tile2, undefined, "Returned tile should be undefined.");
		});

		it("Should return undefined when trying to find tile from text without the specified tile", () => {
			const tileLabel = "EOP";
			client.insertTextLocal(0, "abc");
			console.log(client.getText());

			assert.equal(client.getLength(), 3, "length not expected");

			const tile = client.searchForMarker(1, tileLabel);

			assert.equal(tile, undefined, "Returned tile should be undefined.");

			const tile1 = client.searchForMarker(1, tileLabel, false);

			assert.equal(tile1, undefined, "Returned tile should be undefined.");
		});

		it("Should return undefined when trying to find tile from null text", () => {
			const tileLabel = "EOP";

			const tile = client.searchForMarker(1, tileLabel);

			assert.equal(tile, undefined, "Returned tile should be undefined.");

			const tile1 = client.searchForMarker(1, tileLabel, false);

			assert.equal(tile1, undefined, "Returned tile should be undefined.");
		});
	});
});
