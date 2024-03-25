/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Uint8ArrayToString } from "@fluid-internal/client-utils";
import { unreachableCase } from "@fluidframework/core-utils";
import { ISummaryTree, ITree, ITreeEntry, SummaryType } from "@fluidframework/protocol-definitions";
import { AttachmentTreeEntry, BlobTreeEntry, TreeTreeEntry } from "./blob.js";
import { isCombinedAppAndProtocolSummary } from "./summaryForCreateNew.js";

/**
 * Converts ISummaryTree to ITree format.
 * @param summaryTree - summary tree in ISummaryTree format
 * @internal
 */
export function convertSummaryTreeToSnapshotITree(summaryTree: ISummaryTree): ITree {
	const entries: ITreeEntry[] = [];
	const adaptSummaryTree = isCombinedAppAndProtocolSummary(summaryTree);
	const allSummaryEntries = adaptSummaryTree
		? [
				...Object.entries(summaryTree.tree[".protocol"].tree),
				...Object.entries(summaryTree.tree[".app"].tree),
		  ]
		: Object.entries(summaryTree.tree);

	for (const [key, value] of allSummaryEntries) {
		const k = adaptSummaryTree && key === "attributes" ? ".attributes" : key;
		switch (value.type) {
			case SummaryType.Blob: {
				let parsedContent: string;
				let encoding: "utf-8" | "base64" = "utf-8";
				if (typeof value.content === "string") {
					parsedContent = value.content;
				} else {
					parsedContent = Uint8ArrayToString(value.content, "base64");
					encoding = "base64";
				}
				entries.push(new BlobTreeEntry(k, parsedContent, encoding));
				break;
			}

			case SummaryType.Tree: {
				entries.push(new TreeTreeEntry(k, convertSummaryTreeToSnapshotITree(value)));
				break;
			}

			case SummaryType.Attachment: {
				entries.push(new AttachmentTreeEntry(k, value.id));
				break;
			}

			case SummaryType.Handle: {
				throw new Error("Should not have Handle type in summary tree");
			}

			default:
				unreachableCase(value, "Unexpected summary tree type");
		}
	}
	return {
		entries,
		unreferenced: summaryTree.unreferenced,
		groupId: summaryTree.groupId,
	};
}
