/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line unicorn/prefer-node-protocol
import { strict as assert } from "assert";
import { IOdspSnapshot } from "../contracts.js";
import { convertOdspSnapshotToSnapshotTreeAndBlobs } from "../odspSnapshotParser.js";

const snapshotTree: IOdspSnapshot = {
	id: "bBzkVAgAHAAAA",
	trees: [
		{
			id: "bBzkVAgAHAAAA",
			sequenceNumber: 1,
			entries: [
				{
					path: ".protocol",
					type: "tree",
				},
				{
					id: "bARA4itsHfCA5XZQaYhmASYpj",
					path: ".protocol/quorumMembers",
					type: "blob",
				},
				{
					path: ".app",
					type: "tree",
				},
				{
					path: ".app/.channels",
					type: "tree",
				},
				{
					path: ".app/.channels/23c54bd8-ef53-42fa-a898-413de4c6f0f2",
					type: "tree",
					unreferenced: true,
				},
				{
					id: "bARDoHhrwJMLoGao2yx8mD7nz",
					path: ".app/.channels/23c54bd8-ef53-42fa-a898-413de4c6f0f2/.attributes",
					type: "blob",
				},
				{
					path: ".app/.channels/23c54bd8-ef53-42fa-a898-413de4c6f0f2/d65a4af3-0bf8-4052-8442-a898651ad9b8",
					type: "tree",
				},
			],
		},
	],
	blobs: [
		{
			id: "bARA4itsHfCA5XZQaYhmASYpj",
			content: "   \n",
			size: 4,
			encoding: undefined,
		},
		{
			id: "bARDoHhrwJMLoGao2yx8mD7nz",
			content: "KR  \n",
			size: 5,
			encoding: undefined,
		},
	],
	ops: [
		{
			sequenceNumber: 2,
			op: {
				clientId: "38777331-8149-4d15-b734-cd8110295ab6",
				clientSequenceNumber: 2,
				contents: null,
				metadata: {},
				minimumSequenceNumber: 136505,
				referenceSequenceNumber: 136505,
				sequenceNumber: 2,
				timestamp: 1657840275913,
				type: "op",
			},
		},
		{
			sequenceNumber: 3,
			op: {
				clientId: "38777331-8149-4d15-b734-cd8110295ab6",
				clientSequenceNumber: -1,
				contents: null,
				minimumSequenceNumber: 136505,
				referenceSequenceNumber: -1,
				sequenceNumber: 3,
				timestamp: 1657840275922,
				type: "join",
			},
		},
	],
};

describe("JSON Snapshot Format Conversion Tests", () => {
	it("Conversion test", async () => {
		const result = convertOdspSnapshotToSnapshotTreeAndBlobs(snapshotTree);
		assert(result.sequenceNumber === 1, "Seq number should match");
		assert(result.latestSequenceNumber === 3, "Latest sequence number should match");
		assert((result.snapshotTree.id = snapshotTree.id), "Snapshot id should match");
		assert(result.ops.length === 2, "2 ops should be there");
		assert(result.blobContents.size === 2, "2 blobs should be there");
		assert(Object.keys(result.snapshotTree.trees).length === 2, "2 trees should be there");
		const shouldBeEmptyTree =
			result.snapshotTree.trees[".app"]?.trees[".channels"]?.trees[
				"23c54bd8-ef53-42fa-a898-413de4c6f0f2"
			]?.trees["d65a4af3-0bf8-4052-8442-a898651ad9b8"];
		const emptyTree = { blobs: {}, trees: {}, unreferenced: undefined, groupId: undefined };
		assert.deepStrictEqual(shouldBeEmptyTree, emptyTree, "Tree should have no blobs and trees");
	});
});
