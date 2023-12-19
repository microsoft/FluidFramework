/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { UniversalSequenceNumber } from "../constants";
import { Marker, reservedMarkerIdKey } from "../mergeTreeNodes";
import { ReferenceType } from "../ops";
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
