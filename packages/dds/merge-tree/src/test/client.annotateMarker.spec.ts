/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { Marker, reservedMarkerIdKey, type ISegmentPrivate } from "../mergeTreeNodes.js";
import { ReferenceType } from "../ops.js";
import { TextSegment } from "../textSegment.js";

import { TestClient } from "./testClient.js";

describe("TestClient", () => {
	const localUserLongId = "localUser";
	let client: TestClient;

	beforeEach(() => {
		client = new TestClient();
		client.mergeTree.insertSegments(
			0,
			[TextSegment.make("")],
			client.mergeTree.localPerspective,
			client.mergeTree.collabWindow.mintNextLocalOperationStamp(),
			undefined,
		);
		client.startOrUpdateCollaboration(localUserLongId);
	});

	describe(".annotateMarker", () => {
		it("annotate valid marker", () => {
			const insertOp = client.insertMarkerLocal(0, ReferenceType.Tile, {
				[reservedMarkerIdKey]: "123",
			});
			assert(insertOp);
			const markerInfo = client.getContainingSegment<ISegmentPrivate>(0);
			const marker = markerInfo.segment as Marker;
			const annotateOp = client.annotateMarker(marker, { foo: "bar" });
			assert(annotateOp);
			assert(marker.properties);
			assert(marker.properties.foo, "bar");
		});
	});
});
