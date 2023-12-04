/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { UniversalSequenceNumber } from "../constants";
import { Marker, reservedMarkerIdKey } from "../mergeTreeNodes";
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

	describe(".findTile", () => {
		it("Should be able to find non preceding tile based on label", () => {
			const tileLabel = "EOP";

			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [tileLabel],
				[reservedMarkerIdKey]: "some-id",
			});

			client.insertTextLocal(0, "abc");

			console.log(client.getText());

			assert.equal(client.getLength(), 4, "length not expected");

			const tile = client.findTile(0, tileLabel, false);

			assert(tile, "Returned tile undefined.");

			assert.equal(tile.pos, 3, "Tile with label not at expected position");
		});

		it("Should be able to find non preceding tile position based on label from client with single tile", () => {
			const tileLabel = "EOP";
			client.insertTextLocal(0, "abc d");

			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [tileLabel],
				[reservedMarkerIdKey]: "some-id",
			});
			console.log(client.getText());

			assert.equal(client.getLength(), 6, "length not expected");

			const tile = client.findTile(0, tileLabel, false);

			assert(tile, "Returned tile undefined.");

			assert.equal(tile.pos, 0, "Tile with label not at expected position");
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

			const tile = client.findTile(5, tileLabel);

			assert(tile, "Returned tile undefined.");

			assert.equal(tile.pos, 0, "Tile with label not at expected position");
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

			const tile = client.findTile(5, tileLabel, false);

			assert(tile, "Returned tile undefined.");

			assert.equal(tile.pos, 6, "Tile with label not at expected position");
		});

		it("Should be able to find tile from client with text length 1", () => {
			const tileLabel = "EOP";
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [tileLabel],
				[reservedMarkerIdKey]: "some-id",
			});

			console.log(client.getText());

			assert.equal(client.getLength(), 1, "length not expected");

			const tile = client.findTile(client.getLength(), tileLabel);

			assert(tile, "Returned tile undefined.");

			assert.equal(tile.pos, 0, "Tile with label not at expected position");

			const tile1 = client.findTile(0, tileLabel, false);

			assert(tile1, "Returned tile undefined.");

			assert.equal(tile1.pos, 0, "Tile with label not at expected position");
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

			const tile = client.findTile(5, tileLabel);

			assert(tile, "Returned tile undefined.");

			assert.equal(tile.pos, 3, "Tile with label not at expected position");

			const tile1 = client.findTile(5, tileLabel, false);

			assert.equal(typeof tile1, "undefined", "Returned tile should be undefined.");
		});

		it("Should return undefined when trying to find tile from text without the specified tile", () => {
			const tileLabel = "EOP";
			client.insertTextLocal(0, "abc");
			console.log(client.getText());

			assert.equal(client.getLength(), 3, "length not expected");

			const tile = client.findTile(1, tileLabel);

			assert.equal(typeof tile, "undefined", "Returned tile should be undefined.");

			const tile1 = client.findTile(1, tileLabel, false);

			assert.equal(typeof tile1, "undefined", "Returned tile should be undefined.");
		});

		it("Should return undefined when trying to find tile from null text", () => {
			const tileLabel = "EOP";

			const tile = client.findTile(1, tileLabel);

			assert.equal(typeof tile, "undefined", "Returned tile should be undefined.");

			const tile1 = client.findTile(1, tileLabel, false);

			assert.equal(typeof tile1, "undefined", "Returned tile should be undefined.");
		});
	});

	describe(".annotateMarker", () => {
		it("annotate valid marker", () => {
			const insertOp = client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedMarkerIdKey]: "123",
			});
			assert(insertOp);
			const markerInfo = client.getContainingSegment(0);
			const marker = markerInfo.segment as Marker;
			const annotateOp = client.annotateMarker(marker, { foo: "bar" });
			assert(annotateOp);
			assert(marker.properties);
			assert(marker.properties.foo, "bar");
		});
	});
});
