/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Uint8ArrayToString, unreachableCase } from "@fluidframework/common-utils";
import { AttachmentTreeEntry, BlobTreeEntry, TreeTreeEntry } from "@fluidframework/protocol-base";
import { ISummaryTree, ITree, ITreeEntry, SummaryType } from "@fluidframework/protocol-definitions";

/**
 * Converts ISummaryTree to ITree format.
 * @param summaryTree - summary tree in ISummaryTree format
 */
export function convertSummaryTreeToSnapshotITree(summaryTree: ISummaryTree): ITree {
	const entries: ITreeEntry[] = [];
	const protocolSummary = summaryTree.tree[".protocol"] as ISummaryTree;
	const appSummary = summaryTree.tree[".app"] as ISummaryTree;
	// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
	const adaptSumaryTree = protocolSummary && appSummary;
	// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
	const allSummaryEntries = adaptSumaryTree
		? [...Object.entries(protocolSummary.tree), ...Object.entries(appSummary.tree)]
		: Object.entries(summaryTree.tree);

	for (const [key, value] of allSummaryEntries) {
		// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
		const k = adaptSumaryTree && ["attributes"].includes(key) ? `.${key}` : key;
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
	};
}
