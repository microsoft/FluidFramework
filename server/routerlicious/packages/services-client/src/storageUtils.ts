/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	stringToBuffer,
	Uint8ArrayToString,
} from "@fluidframework/server-common-utils";
import { getGitType } from "@fluidframework/protocol-base";
import { ISnapshotTree, SummaryObject, SummaryType } from "@fluidframework/protocol-definitions";
import { assert } from "./assert";
import {
	ISummaryTree,
	IWholeSummaryTree,
	WholeSummaryTreeValue,
	IWholeSummaryTreeBaseEntry,
	WholeSummaryTreeEntry,
	IEmbeddedSummaryHandle,
	IWholeFlatSummaryTree,
	IWholeFlatSummary,
	INormalizedWholeSummary,
	IWholeSummaryTreeValueEntry,
	IWholeSummaryBlob,
} from "./storageContracts";
import { unreachableCase } from "./utils";

/**
 * Convert a list of nodes to a tree path.
 * If a node is empty (blank) it will be removed.
 * If a node's name begins and/or ends with a "/", it will be removed.
 * @param nodeNames - node names in path
 * @internal
 */
export const buildTreePath = (...nodeNames: string[]): string =>
	nodeNames
		.map((nodeName) => nodeName.replace(/^\//, "").replace(/\/$/, ""))
		.filter((nodeName) => !!nodeName)
		.join("/");

/**
 * Converts the summary tree to a whole summary tree to be uploaded. Always upload full whole summary tree.
 * @param parentHandle - Handle of the last uploaded summary or detach new summary.
 * @param tree - Summary Tree which will be converted to whole summary tree to be uploaded.
 * @param path - Current path of node which is getting evaluated.
 * @internal
 */
export function convertSummaryTreeToWholeSummaryTree(
	parentHandle: string | undefined,
	tree: ISummaryTree,
	path: string = "",
	rootNodeName: string = "",
): IWholeSummaryTree {
	const wholeSummaryTree: IWholeSummaryTree = {
		type: "tree",
		entries: [] as WholeSummaryTreeEntry[],
	};

	const keys = Object.keys(tree.tree);
	for (const key of keys) {
		const summaryObject = tree.tree[key];

		let id: string | undefined;
		let value: WholeSummaryTreeValue | undefined;
		let unreferenced: true | undefined;

		const currentPath =
			path === "" ? buildTreePath(rootNodeName, key) : buildTreePath(path, key);
		switch (summaryObject.type) {
			case SummaryType.Tree: {
				const result = convertSummaryTreeToWholeSummaryTree(
					parentHandle,
					summaryObject,
					currentPath,
					rootNodeName,
				);
				value = result;
				unreferenced = summaryObject.unreferenced || undefined;
				break;
			}
			case SummaryType.Blob: {
				value =
					typeof summaryObject.content === "string"
						? {
								type: "blob",
								content: summaryObject.content,
								encoding: "utf-8",
						  }
						: {
								type: "blob",
								content: Uint8ArrayToString(summaryObject.content, "base64"),
								encoding: "base64",
						  };
				break;
			}
			case SummaryType.Handle: {
				const handleValue = summaryObject as IEmbeddedSummaryHandle;
				if (handleValue.embedded) {
					id = summaryObject.handle;
				} else {
					if (!parentHandle) {
						throw Error("Parent summary does not exist to reference by handle.");
					}
					id = buildTreePath(parentHandle, rootNodeName, summaryObject.handle);
				}
				break;
			}
			case SummaryType.Attachment: {
				id = summaryObject.id;
				break;
			}
			default: {
				unreachableCase(summaryObject, `Unknown type: ${(summaryObject as any).type}`);
			}
		}

		const baseEntry: IWholeSummaryTreeBaseEntry = {
			path: encodeURIComponent(key),
			type: getGitType(summaryObject),
		};

		let entry: WholeSummaryTreeEntry;

		if (value) {
			assert(
				id === undefined,
				0x0ad /* "Snapshot entry has both a tree value and a referenced id!" */,
			);
			entry = {
				value,
				unreferenced,
				...baseEntry,
			};
		} else if (id) {
			entry = {
				...baseEntry,
				id,
			};
		} else {
			throw new Error(`Invalid tree entry for ${summaryObject.type}`);
		}

		wholeSummaryTree.entries?.push(entry);
	}

	return wholeSummaryTree;
}

/**
 * Build a tree hierarchy from a flat tree.
 *
 * @param flatTree - a flat tree
 * @param treePrefixToRemove - tree prefix to strip
 * @returns the heirarchical tree
 */
function buildSummaryTreeHierarchy(
	flatTree: IWholeFlatSummaryTree,
	treePrefixToRemove: string,
): ISnapshotTree {
	const lookup: { [path: string]: ISnapshotTree } = {};
	// Root tree id will be used to determine which version was downloaded.
	const root: ISnapshotTree = { id: flatTree.id, blobs: {}, trees: {} };
	lookup[""] = root;

	for (const entry of flatTree.entries) {
		// Strip the `treePrefixToRemove` path from tree entries such that they are stored under root.
		const entryPath = entry.path.replace(new RegExp(`^${treePrefixToRemove}/`), "");
		const lastIndex = entryPath.lastIndexOf("/");
		const entryPathDir = entryPath.slice(0, Math.max(0, lastIndex));
		const entryPathBase = entryPath.slice(lastIndex + 1);

		// The flat output is breadth-first so we can assume we see tree nodes prior to their contents
		const node = lookup[entryPathDir];

		// Add in either the blob or tree
		if (entry.type === "tree") {
			const newTree: ISnapshotTree = {
				blobs: {},
				trees: {},
				unreferenced: entry.unreferenced,
			};
			node.trees[decodeURIComponent(entryPathBase)] = newTree;
			lookup[entryPath] = newTree;
		} else if (entry.type === "blob") {
			node.blobs[decodeURIComponent(entryPathBase)] = entry.id;
		} else {
			throw new Error(`Unknown entry type!!`);
		}
	}

	return root;
}

/**
 * Converts existing IWholeFlatSummary to snapshot tree, blob array, and sequence number.
 *
 * @param flatSummary - flat summary
 * @param treePrefixToRemove - tree prefix to strip. By default we are stripping ".app" prefix
 * @returns snapshot tree, blob array, and sequence number
 * @internal
 */
export function convertWholeFlatSummaryToSnapshotTreeAndBlobs(
	flatSummary: IWholeFlatSummary,
	treePrefixToRemove: string = ".app",
): INormalizedWholeSummary {
	const blobs = new Map<string, ArrayBuffer>();
	if (flatSummary.blobs) {
		flatSummary.blobs.forEach((blob) => {
			blobs.set(blob.id, stringToBuffer(blob.content, blob.encoding ?? "utf-8"));
		});
	}
	const flatSummaryTree = flatSummary.trees?.[0];
	const sequenceNumber = flatSummaryTree?.sequenceNumber;
	const snapshotTree = buildSummaryTreeHierarchy(flatSummaryTree, treePrefixToRemove);

	return {
		blobs,
		snapshotTree,
		sequenceNumber,
	};
}

/**
 * Validates whether the entry is an IWholeSummaryTreeEntry with a value field
 * @param obj - object to be evaluated
 * @returns Whether the value is of IWholeSummaryTreeEntry type
 */
function isWholeSummaryTreeValueEntry(obj: any): obj is IWholeSummaryTreeValueEntry {
	return typeof obj === "object" && obj !== null && "value" in obj;
}

/**
 * Validates whether a specific value is of IWholeSummaryBlob type.
 * @param obj - object to be evaluated
 * @returns Whether the value is of IWholeSummaryBlob type
 */
function isWholeSummaryBlob(obj: unknown): obj is IWholeSummaryBlob {
	return typeof obj === "object" && obj !== null && "content" in obj;
}

/**
 * Validates whether a specific value is of IWholeSummaryBlob type.
 * @param obj - object to be evaluated
 * @returns Whether the value is of IWholeSummaryBlob type
 */
function isWholeSummaryTree(obj: any): obj is IWholeSummaryTree {
	return typeof obj === "object" && obj !== null && "type" in obj;
}

/**
 * Converts existing IWholeSummaryTree to ISummaryTree for the first summary (without Handle entries)
 * @param wholeSummaryTree - wholeSummaryTree used on the payload for creating and uploading a document.
 * @returns Summary tree to be used when creating a new document.
 * @internal
 */
export function convertFirstSummaryWholeSummaryTreeToSummaryTree(
	wholeSummaryTree: IWholeSummaryTree,
	unreferenced?: true | undefined,
): ISummaryTree {
	const tree: { [path: string]: SummaryObject } = {};
	for (const entry of wholeSummaryTree.entries ?? []) {
		switch (entry.type) {
			case "blob": {
				assert(isWholeSummaryTreeValueEntry(entry), "Invalid entry type");
				assert(isWholeSummaryBlob(entry.value), "entry value is not an IWholeSummaryBlob");
				const blobPayload = entry.value;
				tree[entry.path] = {
					type: SummaryType.Blob,
					content:
						blobPayload.encoding === "base64"
							? new Uint8Array(stringToBuffer(blobPayload.content, "base64"))
							: blobPayload.content,
				};
				break;
			}
			case "tree": {
				assert(isWholeSummaryTreeValueEntry(entry), "Invalid entry type");
				assert(isWholeSummaryTree(entry.value), "entry value is not an IWholeSummaryTree");
				const treePayload = entry.value;
				const nodeReferenced = entry.unreferenced;
				tree[entry.path] = convertFirstSummaryWholeSummaryTreeToSummaryTree(
					treePayload,
					nodeReferenced,
				);
				break;
			}
			default: {
				throw new Error(`Unsupported tree type for first summary`);
			}
		}
	}
	return unreferenced
		? {
				type: SummaryType.Tree,
				tree,
				unreferenced,
		  }
		: {
				type: SummaryType.Tree,
				tree,
		  };
}
