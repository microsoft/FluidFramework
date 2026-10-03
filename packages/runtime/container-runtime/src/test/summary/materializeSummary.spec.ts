/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { stringToBuffer, Uint8ArrayToString } from "@fluid-internal/client-utils";
import type { IContainerStorageService } from "@fluidframework/container-definitions/internal";
import type { ISummaryTree, SummaryObject } from "@fluidframework/driver-definitions";
import { SummaryType } from "@fluidframework/driver-definitions";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";

import {
	fetchSnapshotForSummary,
	materializeSummary,
} from "../../summary/materializeSummary.js";

describe("Full tree summary materialization", () => {
	const parentSnapshot: ISnapshotTree = {
		blobs: {
			"root blob": "root-blob-id",
		},
		trees: {
			"tree key": {
				blobs: {
					nested: "nested-blob-id",
				},
				trees: {},
				unreferenced: true,
				groupId: "parent-group",
			},
		},
	};
	const blobContents = new Map([
		["root-blob-id", stringToBuffer("root content", "utf8")],
		["nested-blob-id", stringToBuffer("nested content", "utf8")],
	]);
	const readBlob = async (id: string): Promise<ArrayBufferLike> => {
		const content = blobContents.get(id);
		assert(content !== undefined, `Unexpected blob ID: ${id}`);
		return content;
	};

	it("replaces tree and blob handles while preserving current content", async () => {
		const incrementalSummary: ISummaryTree = {
			type: SummaryType.Tree,
			tree: {
				tree: {
					type: SummaryType.Handle,
					handleType: SummaryType.Tree,
					handle: "/tree%20key",
				},
				blob: {
					type: SummaryType.Handle,
					handleType: SummaryType.Blob,
					handle: "/root%20blob",
				},
				currentTree: {
					type: SummaryType.Tree,
					tree: {
						nestedBlob: {
							type: SummaryType.Handle,
							handleType: SummaryType.Blob,
							handle: "/tree%20key/nested",
						},
						newBlob: {
							type: SummaryType.Blob,
							content: "new content",
						},
					},
					groupId: "current-group",
				},
				attachment: {
					type: SummaryType.Attachment,
					id: "attachment-id",
				},
			},
		};

		const result = await materializeSummary(incrementalSummary, parentSnapshot, readBlob);

		assertNoHandles(result);
		const tree = getSummaryObject(result, "tree", SummaryType.Tree);
		assert.equal(tree.unreferenced, true);
		assert.equal(tree.groupId, "parent-group");
		assert.equal(readSummaryBlob(tree.tree.nested), "nested content");
		assert.equal(readSummaryBlob(result.tree.blob), "root content");

		const currentTree = getSummaryObject(result, "currentTree", SummaryType.Tree);
		assert.equal(currentTree.groupId, "current-group");
		assert.equal(readSummaryBlob(currentTree.tree.nestedBlob), "nested content");
		assert.deepEqual(currentTree.tree.newBlob, {
			type: SummaryType.Blob,
			content: "new content",
		});
		assert.deepEqual(result.tree.attachment, {
			type: SummaryType.Attachment,
			id: "attachment-id",
		});
	});

	it("fails when a handle is absent from the parent snapshot", async () => {
		await assert.rejects(
			materializeSummary(
				{
					type: SummaryType.Tree,
					tree: {
						missing: {
							type: SummaryType.Handle,
							handleType: SummaryType.Tree,
							handle: "/missing",
						},
					},
				},
				parentSnapshot,
				readBlob,
			),
			/does not contain tree handle/,
		);
	});

	it("fetches the requested parent snapshot version", async () => {
		const version = { id: "parent-version", treeId: "parent-tree" };
		const storage: Pick<
			IContainerStorageService,
			"getSnapshotTree" | "getVersions" | "readBlob"
		> = {
			getVersions: async (versionId, count, scenarioName) => {
				assert.equal(versionId, version.id);
				assert.equal(count, 1);
				assert.equal(scenarioName, "MaterializeFullTreeSummary");
				return [version];
			},
			getSnapshotTree: async (requestedVersion, scenarioName) => {
				assert.deepEqual(requestedVersion, version);
				assert.equal(scenarioName, "MaterializeFullTreeSummary");
				return parentSnapshot;
			},
			readBlob,
		};

		assert.equal(await fetchSnapshotForSummary(storage, version.id), parentSnapshot);
	});
});

function assertNoHandles(tree: ISummaryTree): void {
	for (const object of Object.values(tree.tree)) {
		assert.notEqual(object.type, SummaryType.Handle);
		if (object.type === SummaryType.Tree) {
			assertNoHandles(object);
		}
	}
}

function getSummaryObject<TType extends SummaryObject["type"]>(
	tree: ISummaryTree,
	key: string,
	type: TType,
): Extract<SummaryObject, { type: TType }> {
	const object = tree.tree[key];
	assert(object?.type === type, `Expected ${key} to have summary type ${type}`);
	return object as Extract<SummaryObject, { type: TType }>;
}

function readSummaryBlob(object: SummaryObject | undefined): string {
	assert(object?.type === SummaryType.Blob, "Expected a summary blob");
	return typeof object.content === "string"
		? object.content
		: Uint8ArrayToString(object.content, "utf8");
}
