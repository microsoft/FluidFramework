/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import { ISnapshot, ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";

import { parseCompactSnapshotResponse } from "../compactSnapshotParser.js";
import { convertToCompactSnapshot } from "../compactSnapshotWriter.js";

const snapshotTree: ISnapshotTree = {
	id: "SnapshotId",
	blobs: {},
	trees: {
		".protocol": {
			blobs: {
				attributes: "bARADgIe4qmDjJl2l2zz12IM3",
				quorumMembers: "bARBkx1nses1pHL1vKnmFUfIC",
				quorumProposals: "bARBkx1nses1pHL1vKnmFUfIC",
			},
			trees: {},
		},
		".app": {
			blobs: { ".metadata": "bARD4RKvW4LL1KmaUKp6hUMSp" },
			trees: {
				".channels": {
					blobs: {},
					trees: {
						default: {
							blobs: {
								".component": "bARC6dCXlcrPxQHw3PeROtmKc",
								"gc": "bARDNMoBed+nKrsf04id52iUA",
							},
							trees: {
								".channels": {
									blobs: {},
									trees: {
										root: { blobs: {}, trees: {} },
									},
								},
							},
						},
					},
					unreferenced: true,
				},
				".blobs": { blobs: {}, trees: {} },
			},
			unreferenced: true,
		},
	},
};

const blobContents = new Map<string, ArrayBuffer>([
	[
		"bARADgIe4qmDjJl2l2zz12IM3",
		stringToBuffer(
			JSON.stringify({ branch: "", minimumSequenceNumber: 0, sequenceNumber: 0, term: 1 }),
			"utf8",
		),
	],
	["bARBkx1nses1pHL1vKnmFUfIC", stringToBuffer(JSON.stringify([]), "utf8")],
	[
		"bARD4RKvW4LL1KmaUKp6hUMSp",
		stringToBuffer(JSON.stringify({ summaryFormatVersion: 1, gcFeature: 0 }), "utf8"),
	],
	[
		"bARC6dCXlcrPxQHw3PeROtmKc",
		stringToBuffer(
			JSON.stringify({
				pkg: '["@fluid-example/smde"]',
				summaryFormatVersion: 2,
				isRootDataStore: true,
			}),
			"utf8",
		),
	],
	[
		"bARDNMoBed+nKrsf04id52iUA",
		stringToBuffer(
			JSON.stringify({
				usedRoutes: [""],
				gcData: {
					gcNodes: {
						"/root": ["/default/01b197a2-0432-413b-b2c9-83a992b804c4", "/default"],
						"/01b197a2-0432-413b-b2c9-83a992b804c4": ["/default"],
						"/": ["/default/root", "/default/01b197a2-0432-413b-b2c9-83a992b804c4"],
					},
				},
			}),
			"utf8",
		),
	],
]);

const ops: ISequencedDocumentMessage[] = [
	{
		clientId: "X",
		clientSequenceNumber: -1,
		contents: null,
		minimumSequenceNumber: 0,
		referenceSequenceNumber: -1,
		sequenceNumber: 1,
		timestamp: 1623883807452,
		type: "join",
	},
	{
		clientId: "Y",
		clientSequenceNumber: -1,
		contents: null,
		minimumSequenceNumber: 0,
		referenceSequenceNumber: -1,
		sequenceNumber: 2,
		timestamp: 1623883811928,
		type: "join",
	},
];

const snapshotTreeWithGroupId: ISnapshotTree = {
	id: "SnapshotId",
	blobs: {},
	trees: {
		".protocol": {
			blobs: {},
			trees: {},
		},
		".app": {
			blobs: { ".metadata": "bARD4RKvW4LL1KmaUKp6hUMSp" },
			trees: {
				".channels": {
					blobs: {},
					trees: {
						default: {
							blobs: {},
							trees: {
								dds: {
									blobs: {},
									trees: {},
								},
							},
							groupId: "G3",
						},
					},
					unreferenced: true,
					groupId: "G2",
				},
				".blobs": { blobs: {}, trees: {} },
			},
			unreferenced: true,
			groupId: "G4",
		},
	},
};

const blobContents2 = new Map<string, ArrayBuffer>([
	[
		"bARD4RKvW4LL1KmaUKp6hUMSp",
		stringToBuffer(JSON.stringify({ summaryFormatVersion: 1, gcFeature: 0 }), "utf8"),
	],
]);

describe("Snapshot Format Conversion Tests", () => {
	it("Conversion test", async () => {
		const snapshotContents: ISnapshot = {
			snapshotTree,
			blobContents,
			ops,
			sequenceNumber: 0,
			latestSequenceNumber: 2,
			snapshotFormatV: 1,
		};
		const logger = new MockLogger();
		const compactSnapshot = convertToCompactSnapshot(snapshotContents);
		const result = parseCompactSnapshotResponse(compactSnapshot, logger.toTelemetryLogger());
		assert.deepStrictEqual(result.snapshotTree, snapshotTree, "Tree structure should match");
		assert.deepStrictEqual(result.blobContents, blobContents, "Blobs content should match");
		assert.deepStrictEqual(result.ops, ops, "Ops should match");
		assert(result.sequenceNumber === 0, "Seq number should match");
		assert(result.latestSequenceNumber === 2, "Latest sequence number should match");
		assert(
			(result.snapshotTree.id = snapshotContents.snapshotTree.id),
			"Snapshot id should match",
		);

		assert(result.telemetryProps.slowBlobStructureCount === 0);
		// there is { name, unreferenced } structure (i.e. empty unreferenced tree) that we do not optimize
		assert(result.telemetryProps.slowTreeStructureCount === 1);

		// Convert to compact snapshot again and then match to previous one.
		const compactSnapshot2 = convertToCompactSnapshot(result);
		assert.deepStrictEqual(
			compactSnapshot2.buffer,
			compactSnapshot.buffer,
			"Compact representation should remain same",
		);
		logger.assertMatchNone([{ category: "error" }]);
	});

	it("Conversion test with empty ops", async () => {
		const snapshotContents: ISnapshot = {
			snapshotTree,
			blobContents,
			ops: [],
			sequenceNumber: 0,
			latestSequenceNumber: 2,
			snapshotFormatV: 1,
		};
		const logger = new MockLogger();
		const compactSnapshot = convertToCompactSnapshot(snapshotContents);
		const result = parseCompactSnapshotResponse(compactSnapshot, logger.toTelemetryLogger());
		assert.deepStrictEqual(result.snapshotTree, snapshotTree, "Tree structure should match");
		assert.deepStrictEqual(result.blobContents, blobContents, "Blobs content should match");
		assert.deepStrictEqual(result.ops, [], "Ops should match");
		assert(result.sequenceNumber === 0, "Seq number should match");
		assert(result.latestSequenceNumber === 2, "Latest sequence number should match");
		assert(
			(result.snapshotTree.id = snapshotContents.snapshotTree.id),
			"Snapshot id should match",
		);
		assert(result.telemetryProps.slowBlobStructureCount === 0);
		// there is { name, unreferenced } structure (i.e. empty unreferenced tree) that we do not optimize
		assert(result.telemetryProps.slowTreeStructureCount === 1);

		// Convert to compact snapshot again and then match to previous one.
		const compactSnapshot2 = convertToCompactSnapshot(result);
		assert.deepStrictEqual(
			compactSnapshot2.buffer,
			compactSnapshot.buffer,
			"Compact representation should remain same",
		);
		logger.assertMatchNone([{ category: "error" }]);
	});

	it("Conversion test for snapshot with GroupId", async () => {
		const snapshotContents: ISnapshot = {
			snapshotTree: snapshotTreeWithGroupId,
			blobContents: blobContents2,
			ops,
			sequenceNumber: 0,
			latestSequenceNumber: 2,
			snapshotFormatV: 1,
		};
		const logger = new MockLogger();
		const compactSnapshot = convertToCompactSnapshot(snapshotContents);
		const result = parseCompactSnapshotResponse(compactSnapshot, logger.toTelemetryLogger());
		assert.deepStrictEqual(
			result.snapshotTree,
			snapshotTreeWithGroupId,
			"Tree structure should match",
		);
		assert.deepStrictEqual(result.blobContents, blobContents2, "Blobs content should match");
		assert.deepStrictEqual(result.ops, ops, "Ops should match");
		assert(result.sequenceNumber === 0, "Seq number should match");
		assert(result.latestSequenceNumber === 2, "Latest sequence number should match");
		assert(
			(result.snapshotTree.id = snapshotContents.snapshotTree.id),
			"Snapshot id should match",
		);
		assert(result.telemetryProps.slowBlobStructureCount === 0);
		// there is { name, unreferenced } structure (i.e. empty unreferenced tree) that we do not optimize
		assert(result.telemetryProps.slowTreeStructureCount === 4);

		// Convert to compact snapshot again and then match to previous one.
		const compactSnapshot2 = convertToCompactSnapshot(result);
		assert.deepStrictEqual(
			compactSnapshot2.buffer,
			compactSnapshot.buffer,
			"Compact representation should remain same",
		);
		logger.assertMatchNone([{ category: "error" }]);
	});
});
