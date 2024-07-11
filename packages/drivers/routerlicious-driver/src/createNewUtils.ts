/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Uint8ArrayToString } from "@fluid-internal/client-utils";
import { ISummaryTree, SummaryType } from "@fluidframework/driver-definitions";

/**
 * Utility api to convert ISummaryTree to a summary tree where blob contents are only utf8 strings.
 * @param summary - Summary supplied by the runtime to upload.
 * @returns Modified summary tree where the blob contents could be utf8 string only.
 */
export function convertSummaryToCreateNewSummary(summary: ISummaryTree): ISummaryTree {
	for (const [key, summaryObject] of Object.entries(summary.tree)) {
		switch (summaryObject.type) {
			case SummaryType.Tree: {
				summary.tree[key] = convertSummaryToCreateNewSummary(summaryObject);
				break;
			}
			case SummaryType.Blob: {
				summaryObject.content =
					typeof summaryObject.content === "string"
						? summaryObject.content
						: Uint8ArrayToString(summaryObject.content, "utf8");
				break;
			}
			case SummaryType.Handle: {
				throw new Error("No handle should be present for first summary!!");
			}
			default: {
				throw new Error(`Unknown tree type ${summaryObject.type}`);
			}
		}
	}

	return summary;
}
