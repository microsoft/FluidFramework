/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils/internal";
import { ISummaryTree, SummaryObject, SummaryType } from "@fluidframework/driver-definitions";
import { ISnapshotTree } from "@fluidframework/driver-definitions/internal";

import { INormalizedWholeSnapshot } from "./contracts.js";

/**
 * Summary tree assembler props
 */
export interface ISummaryTreeAssemblerProps {
	/**
	 * Indicates that this tree is unreferenced. If this is not present, the tree is considered referenced.
	 */
	unreferenced?: true;
	groupId?: string;
}

/**
 * Summary tree assembler (without stats collection).
 */
export class SummaryTreeAssembler {
	private attachmentCounter: number = 0;
	private readonly summaryTree: { [path: string]: SummaryObject } = {};

	constructor(private readonly props?: ISummaryTreeAssemblerProps) {}

	/**
	 * Get final summary
	 */
	public get summary(): ISummaryTree {
		return {
			type: SummaryType.Tree,
			tree: { ...this.summaryTree },
			unreferenced: this.props?.unreferenced,
			groupId: this.props?.groupId,
		};
	}

	/**
	 * Add blob to summary
	 */
	public addBlob(key: string, content: string | Uint8Array): void {
		this.summaryTree[key] = {
			type: SummaryType.Blob,
			content,
		};
	}

	/**
	 * Add handle to summary
	 */
	public addHandle(
		key: string,
		handleType: SummaryType.Tree | SummaryType.Blob | SummaryType.Attachment,
		handle: string,
	): void {
		this.summaryTree[key] = {
			type: SummaryType.Handle,
			handleType,
			handle,
		};
	}

	/**
	 * Add tree to summary
	 */
	public addTree(key: string, summary: ISummaryTree): void {
		this.summaryTree[key] = summary;
	}

	/**
	 * Add attachment to summary
	 */
	public addAttachment(id: string) {
		this.summaryTree[this.attachmentCounter++] = { id, type: SummaryType.Attachment };
	}
}

/**
 * Helper function that converts ISnapshotTree and blobs to ISummaryTree
 * @param snapshot - Source snapshot tree
 * @param blobs - Blobs cache
 * @returns Converted snapshot in ISummaryTree format
 */
export function convertSnapshotAndBlobsToSummaryTree(
	snapshot: ISnapshotTree,
	blobs: Map<string, ArrayBuffer>,
): ISummaryTree {
	const assembler = new SummaryTreeAssembler({
		unreferenced: snapshot.unreferenced,
		groupId: snapshot.groupId,
	});
	for (const [path, id] of Object.entries(snapshot.blobs)) {
		const blob = blobs.get(id);
		assert(blob !== undefined, 0x2dd /* "Cannot find blob for a given id" */);
		assembler.addBlob(path, IsoBuffer.from(blob).toString("utf-8"));
	}
	for (const [key, tree] of Object.entries(snapshot.trees)) {
		const subtree = convertSnapshotAndBlobsToSummaryTree(tree, blobs);
		assembler.addTree(key, subtree);
	}
	return assembler.summary;
}

export function evalBlobsAndTrees(snapshot: INormalizedWholeSnapshot) {
	const trees = countTreesInSnapshotTree(snapshot.snapshotTree);
	const numBlobs = snapshot.blobs.size;
	let encodedBlobsSize = 0;
	for (const [_, blobContent] of snapshot.blobs) {
		encodedBlobsSize += blobContent.byteLength;
	}
	return { trees, numBlobs, encodedBlobsSize };
}

export function validateBlobsAndTrees(snapshot: ISnapshotTree) {
	assert(
		snapshot.trees !== undefined,
		0x5d0 /* Returned r11s snapshot is malformed. No trees! */,
	);
	assert(
		snapshot.blobs !== undefined,
		0x5d1 /* Returned r11s snapshot is malformed. No blobs! */,
	);
}

function countTreesInSnapshotTree(snapshotTree: ISnapshotTree): number {
	let numTrees = 0;
	for (const [_, tree] of Object.entries(snapshotTree.trees)) {
		numTrees += 1 + countTreesInSnapshotTree(tree);
	}
	return numTrees;
}
