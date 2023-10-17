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

	describe(".searchForMarker", () => {
		it("Should be able to find non preceding marker based on label", () => {
			const markerLabel = "EOP";

			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [markerLabel],
				[reservedMarkerIdKey]: "some-id",
			});

			client.insertTextLocal(0, "abc");

			console.log(client.getText());

			assert.equal(client.getLength(), 4, "length not expected");

			const marker = client.searchForMarker(0, markerLabel, false);

			assert(marker, "Returned marker undefined.");

			assert.equal(
				client.localReferencePositionToPosition(marker),
				3,
				"Tile with label not at expected position",
			);
		});

		it("Should be able to find non preceding tile position based on label from client with single tile", () => {
			const markerLabel = "EOP";
			client.insertTextLocal(0, "abc d");

			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [markerLabel],
				[reservedMarkerIdKey]: "some-id",
			});
			console.log(client.getText());

			assert.equal(client.getLength(), 6, "length not expected");

			const tile = client.searchForMarker(0, markerLabel, false);

			assert(tile, "Returned marker undefined.");

			assert.equal(
				client.localReferencePositionToPosition(tile),
				0,
				"Marker with label not at expected position",
			);
		});

		it("Should be able to find preceding tile position based on label from client with multiple tile", () => {
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
			console.log(client.getText());

			assert.equal(client.getLength(), 10, "length not expected");

			const tile = client.searchForMarker(5, markerLabel);

			assert(tile, "Returned marker undefined.");

			assert.equal(
				client.localReferencePositionToPosition(tile),
				0,
				"Tile with label not at expected position",
			);
		});

		it("Should be able to find non preceding tile position from client with multiple tile", () => {
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
			console.log(client.getText());

			assert.equal(client.getLength(), 10, "length not expected");

			const marker = client.searchForMarker(5, markerLabel, false);

			assert(marker, "Returned marker undefined.");

			assert.equal(
				client.localReferencePositionToPosition(marker),
				6,
				"Tile with label not at expected position",
			);
		});

		it("Should be able to find marker from client with text length 1", () => {
			const markerLabel = "EOP";
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [markerLabel],
				[reservedMarkerIdKey]: "some-id",
			});

			console.log(client.getText());

			assert.equal(client.getLength(), 1, "length not expected");

			const marker = client.searchForMarker(client.getLength(), markerLabel);

			assert(marker, "Returned marker undefined.");

			assert.equal(
				client.localReferencePositionToPosition(marker),
				0,
				"Tile with label not at expected position",
			);

			const marker1 = client.searchForMarker(0, markerLabel, false);

			assert(marker1, "Returned marker undefined.");

			assert.equal(
				client.localReferencePositionToPosition(marker1),
				0,
				"Tile with label not at expected position",
			);
		});

		it("Should be able to find only preceding but not non preceding marker with index out of bound", () => {
			const markerLabel = "EOP";
			client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [markerLabel],
				[reservedMarkerIdKey]: "some-id",
			});

			client.insertTextLocal(0, "abc");
			console.log(client.getText());

			assert.equal(client.getLength(), 4, "length not expected");

			const marker = client.searchForMarker(5, markerLabel);

			assert(marker, "Returned marker undefined.");

			assert.equal(
				client.localReferencePositionToPosition(marker),
				3,
				"Tile with label not at expected position",
			);

			const marker1 = client.searchForMarker(5, markerLabel, false);

			assert.equal(typeof marker1, "undefined", "Returned marker should be undefined.");
		});

		it("Should return undefined when trying to find marker from text without the specified marker", () => {
			const markerLabel = "EOP";
			client.insertTextLocal(0, "abc");
			console.log(client.getText());

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
	});

	describe(".annotateMarker", () => {
		it("annotate valid marker", () => {
			const insertOp = client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedMarkerIdKey]: "123",
			});
			assert(insertOp);
			const markerInfo = client.getContainingSegment(0);
			const marker = markerInfo.segment as Marker;
			const annotateOp = client.annotateMarker(marker, { foo: "bar" }, undefined);
			assert(annotateOp);
			assert(marker.properties);
			assert(marker.properties.foo, "bar");
		});
	});
});
