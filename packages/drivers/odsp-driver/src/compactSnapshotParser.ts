/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	ISnapshot,
	ISnapshotTree,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import { ReadBuffer } from "./ReadBufferUtils.js";
import { measure } from "./odspUtils.js";
import {
	NodeCore,
	NodeTypes,
	TreeBuilder,
	assertBlobCoreInstance,
	assertBoolInstance,
	assertNodeCoreInstance,
	assertNumberInstance,
	getNodeProps,
	getStringInstance,
} from "./zipItDataRepresentationUtils.js";

export const snapshotMinReadVersion = "1.0";
export const currentReadVersion = "1.0";

/**
 * The parsing is significantly faster if the position of props is well known instead of dynamic. So these variables
 * represents how many times slower parsing path is executed. This will be then logged into telemetry.
 * @internal
 */
export interface ISnapshotContentsWithProps extends ISnapshot {
	telemetryProps: Record<string, number>;
}

/**
 * Recreates blobs section of the tree.
 * @param node - tree node to read blob section from
 */
function readBlobSection(node: NodeTypes): {
	blobContents: Map<string, ArrayBuffer>;
	slowBlobStructureCount: number;
} {
	assertNodeCoreInstance(node, "TreeBlobs should be of type NodeCore");
	let slowBlobStructureCount = 0;
	const blobContents: Map<string, ArrayBuffer> = new Map();
	for (const blob of node) {
		assertNodeCoreInstance(blob, "blob should be node");

		/**
		 * Perf optimization - the most common cases!
		 * This is essentially unrolling code below for faster processing
		 * It speeds up tree parsing by 2-3x times!
		 */
		if (
			blob.length === 4 &&
			blob.getMaybeString(0) === "id" &&
			blob.getMaybeString(2) === "data"
		) {
			// "id": <node name>
			// "data": <blob>
			blobContents.set(blob.getString(1), blob.getBlob(3).arrayBuffer);
		} else {
			/**
			 * More generalized workflow
			 */
			slowBlobStructureCount += 1;
			const records = getNodeProps(blob);
			assertBlobCoreInstance(records.data, "data should be of BlobCore type");
			const id = getStringInstance(records.id, "blob id should be string");
			blobContents.set(id, records.data.arrayBuffer);
		}
	}
	return { blobContents, slowBlobStructureCount };
}

/**
 * Recreates ops section of the tree.
 * @param node - tree node to read ops section from
 */
function readOpsSection(node: NodeTypes): ISequencedDocumentMessage[] {
	assertNodeCoreInstance(node, "Deltas should be of type NodeCore");
	const ops: ISequencedDocumentMessage[] = [];
	const records = getNodeProps(node);
	assertNumberInstance(records.firstSequenceNumber, "Seq number should be a number");
	assertNodeCoreInstance(records.deltas, "Deltas should be a Node");
	for (let i = 0; i < records.deltas.length; ++i) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		ops.push(JSON.parse(records.deltas.getString(i)));
	}
	// Due to a bug at service side, in an edge case service was serializing deltas even
	// when there are no ops. So just make the code resilient to that bug. Service has also
	// fixed that bug.
	assert(
		ops.length === 0 || records.firstSequenceNumber.valueOf() === ops[0].sequenceNumber,
		0x280 /* "Validate first op seq number" */,
	);
	return ops;
}

/**
 * Recreates snapshot tree out of tree representation.
 * @param node - tree node to de-serialize from
 */
function readTreeSection(node: NodeCore): {
	snapshotTree: ISnapshotTree;
	slowTreeStructureCount: number;
	treeStructureCountWithGroupId: number;
} {
	let slowTreeStructureCount = 0;
	let treeStructureCountWithGroupId = 0;
	const trees: Record<string, ISnapshotTree> = {};
	const snapshotTree: ISnapshotTree = {
		blobs: {},
		trees,
	};
	for (const treeNode of node) {
		assertNodeCoreInstance(treeNode, "tree nodes should be nodes");

		/**
		 * Perf optimization - the most common cases!
		 * This is essentially unrolling code below for faster processing
		 * It speeds up tree parsing by 2-3x times!
		 */
		const length = treeNode.length;
		if (length > 0 && treeNode.getMaybeString(0) === "name") {
			switch (length) {
				case 2: {
					// empty tree case
					// "name": <node name>
					trees[treeNode.getString(1)] = { blobs: {}, trees: {} };
					continue;
				}
				case 4: {
					const content = treeNode.getMaybeString(2);
					// "name": <node name>
					// "children": <blob id>
					if (content === "children") {
						const result = readTreeSection(treeNode.getNode(3));
						trees[treeNode.getString(1)] = result.snapshotTree;
						slowTreeStructureCount += result.slowTreeStructureCount;
						treeStructureCountWithGroupId += result.treeStructureCountWithGroupId;
						continue;
					}
					// "name": <node name>
					// "value": <blob id>
					if (content === "value") {
						snapshotTree.blobs[treeNode.getString(1)] = treeNode.getString(3);
						continue;
					}
					break;
				}
				case 6: {
					// "name": <node name>
					// "nodeType": 3
					// "value": <blob id>
					if (
						treeNode.getMaybeString(2) === "nodeType" &&
						treeNode.getMaybeString(4) === "value"
					) {
						snapshotTree.blobs[treeNode.getString(1)] = treeNode.getString(5);
						continue;
					}

					// "name": <node name>
					// "unreferenced": true
					// "children": <blob id>
					if (
						treeNode.getMaybeString(2) === "unreferenced" &&
						treeNode.getMaybeString(4) === "children"
					) {
						const result = readTreeSection(treeNode.getNode(5));
						trees[treeNode.getString(1)] = result.snapshotTree;
						slowTreeStructureCount += result.slowTreeStructureCount;
						treeStructureCountWithGroupId += result.treeStructureCountWithGroupId;
						assert(treeNode.getBool(3), 0x3db /* Unreferenced if present should be true */);
						snapshotTree.unreferenced = true;
						continue;
					}
					break;
				}
				default: {
					break;
				}
			}
		}

		/**
		 * More generalized workflow
		 */
		slowTreeStructureCount++;
		const records = getNodeProps(treeNode);

		if (records.unreferenced !== undefined) {
			assertBoolInstance(records.unreferenced, "Unreferenced flag should be bool");
			assert(records.unreferenced, 0x281 /* "Unreferenced if present should be true" */);
			snapshotTree.unreferenced = true;
		}

		const path = getStringInstance(records.name, "Path name should be string");
		if (records.value !== undefined) {
			snapshotTree.blobs[path] = getStringInstance(
				records.value,
				"Blob value should be string",
			);
			// eslint-disable-next-line unicorn/no-negated-condition
		} else if (records.children !== undefined) {
			assertNodeCoreInstance(records.children, "Trees should be of type NodeCore");
			const result = readTreeSection(records.children);
			trees[path] = result.snapshotTree;
			if (records.groupId !== undefined) {
				const groupId = getStringInstance(records.groupId, "groupId should be a string");
				trees[path].groupId = groupId;
				treeStructureCountWithGroupId++;
			}
			slowTreeStructureCount += result.slowTreeStructureCount;
			treeStructureCountWithGroupId += result.treeStructureCountWithGroupId;
		} else {
			trees[path] = { blobs: {}, trees: {} };
		}
	}
	return { snapshotTree, slowTreeStructureCount, treeStructureCountWithGroupId };
}

/**
 * Recreates snapshot tree out of tree representation.
 * @param node - tree node to de-serialize from
 */
function readSnapshotSection(node: NodeTypes): {
	sequenceNumber: number;
	snapshotTree: ISnapshotTree;
	slowTreeStructureCount: number;
	treeStructureCountWithGroupId: number;
} {
	assertNodeCoreInstance(node, "Snapshot should be of type NodeCore");
	const records = getNodeProps(node);

	assertNodeCoreInstance(records.treeNodes, "TreeNodes should be of type NodeCore");
	assertNumberInstance(records.sequenceNumber, "sequenceNumber should be of type number");
	const { snapshotTree, slowTreeStructureCount, treeStructureCountWithGroupId } =
		readTreeSection(records.treeNodes);
	snapshotTree.id = getStringInstance(records.id, "snapshotId should be string");
	const sequenceNumber = records.sequenceNumber.valueOf();
	return {
		sequenceNumber,
		snapshotTree,
		slowTreeStructureCount,
		treeStructureCountWithGroupId,
	};
}

/**
 * Converts snapshot from binary compact representation to tree/blobs/ops.
 * @param buffer - Compact snapshot to be parsed into tree/blobs/ops.
 * @returns Tree, blobs and ops from the snapshot.
 * @internal
 */
export function parseCompactSnapshotResponse(
	buffer: Uint8Array,
	logger: ITelemetryLoggerExt,
): ISnapshotContentsWithProps {
	const { builder, telemetryProps } = TreeBuilder.load(new ReadBuffer(buffer), logger);
	assert(builder.length === 1, 0x219 /* "1 root should be there" */);
	const root = builder.getNode(0);

	const records = getNodeProps(root);

	const mrv = getStringInstance(records.mrv, "minReadVersion should be string");
	const cv = getStringInstance(records.cv, "createVersion should be string");
	if (records.lsn !== undefined) {
		assertNumberInstance(records.lsn, "lsn should be a number");
	}

	assert(
		Number.parseFloat(snapshotMinReadVersion) >= Number.parseFloat(mrv),
		0x20f /* "Driver min read version should >= to server minReadVersion" */,
	);
	assert(
		Number.parseFloat(cv) >= Number.parseFloat(snapshotMinReadVersion),
		0x210 /* "Snapshot should be created with minReadVersion or above" */,
	);
	assert(
		currentReadVersion === cv,
		0x2c2 /* "Create Version should be equal to currentReadVersion" */,
	);

	const [snapshot, durationSnapshotTree] = measure(() =>
		readSnapshotSection(records.snapshot),
	);
	const [blobContents, durationBlobs] = measure(() => readBlobSection(records.blobs));

	return {
		...snapshot,
		blobContents: blobContents.blobContents,
		ops: records.deltas === undefined ? [] : readOpsSection(records.deltas),
		latestSequenceNumber: records.lsn,
		snapshotFormatV: 1,
		telemetryProps: {
			...telemetryProps,
			durationSnapshotTree,
			durationBlobs,
			slowTreeStructureCount: snapshot.slowTreeStructureCount,
			slowBlobStructureCount: blobContents.slowBlobStructureCount,
			treeStructureCountWithGroupId: snapshot.treeStructureCountWithGroupId,
		},
	};
}
