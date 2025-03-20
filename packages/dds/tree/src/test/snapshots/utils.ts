/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { Uint8ArrayToString } from "@fluid-internal/client-utils";
import {
	type ISummaryTree,
	type SummaryObject,
	SummaryType,
} from "@fluidframework/driver-definitions";

import { takeJsonSnapshot } from "./snapshotTools.js";

function getSummaryTypeName(summaryObject: SummaryObject): "blob" | "tree" {
	const type =
		summaryObject.type === SummaryType.Handle ? summaryObject.handleType : summaryObject.type;

	switch (type) {
		case SummaryType.Blob:
		case SummaryType.Attachment: {
			return "blob";
		}
		case SummaryType.Tree: {
			return "tree";
		}
		default: {
			throw new Error(`Unknown type: ${type}`);
		}
	}
}

/**
 * Rather than JSON.stringify the entire `ISummaryTree` for the purpose of writing
 * it to disk, this function more closely resembles how the summary gets serialized
 * to storage. This helps avoid confusion on problems such as
 * double-JSON-stringification and makes it easier to diff using line-by-line
 * tools.
 */
function serializeTree(parentHandle: string, tree: ISummaryTree, rootNodeName: string) {
	const entries: { type: "blob" | "tree" }[] = [];

	for (const key of Object.keys(tree.tree)) {
		const summaryObject = tree.tree[key];
		let id: string | undefined;
		let value: object | undefined;
		switch (summaryObject.type) {
			case SummaryType.Tree: {
				const result = serializeTree(parentHandle, summaryObject, rootNodeName);
				value = result;
				break;
			}
			case SummaryType.Blob: {
				value =
					typeof summaryObject.content === "string"
						? {
								type: "blob",
								content: JSON.parse(summaryObject.content),
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
				if (!parentHandle) {
					throw new Error("Parent summary does not exist to reference by handle.");
				}
				let handlePath = summaryObject.handle;
				if (handlePath.length > 0 && !handlePath.startsWith("/")) {
					handlePath = `/${handlePath}`;
				}
				const pathKey = `${rootNodeName}${handlePath}`;
				id = `${parentHandle}/${pathKey}`;
				break;
			}
			case SummaryType.Attachment: {
				id = summaryObject.id;
				break;
			}
			default: {
				throw new Error(`Unknown type: ${(summaryObject as SummaryObject).type}`);
			}
		}

		const baseEntry = {
			type: getSummaryTypeName(summaryObject),
		};
		let entry;
		if (value !== undefined) {
			assert.equal(id, undefined, "Snapshot entry has both a tree value and a referenced id!");
			entry = {
				...baseEntry,
				[encodeURIComponent(key)]: value,
			};
		} else if (id !== undefined) {
			entry = {
				...baseEntry,
				[encodeURIComponent(key)]: id,
			};
		} else {
			throw new Error(`Invalid tree entry for ${summaryObject.type}`);
		}
		entries.push(entry);
	}

	if (entries.length === 1) {
		return { type: "tree", tree: entries[0] };
	}

	return { type: "tree", entries };
}

export function takeSummarySnapshot(data: ISummaryTree, suffix = ""): void {
	const tree = serializeTree(".handle", data, ".app");
	takeJsonSnapshot(tree, suffix);
}
