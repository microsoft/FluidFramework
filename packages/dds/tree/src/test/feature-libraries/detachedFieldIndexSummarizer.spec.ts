/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { SummaryType, type SummaryObject } from "@fluidframework/driver-definitions/internal";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
import { MockStorage } from "@fluidframework/test-runtime-utils/internal";

import { DetachedFieldIndex, type ForestRootId } from "../../core/index.js";
import {
	detachedFieldIndexMetadataKey,
	DetachedFieldIndexSummarizer,
	DetachedFieldIndexSummaryVersion,
	type DetachedFieldIndexSummaryMetadata,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../feature-libraries/detachedFieldIndexSummarizer.js";
import { FluidClientVersion } from "../../codec/index.js";
import { testIdCompressor, testRevisionTagCodec } from "../utils.js";
import { type IdAllocator, idAllocatorFromMaxId } from "../../util/index.js";

function createDetachedFieldIndexSummarizer(options?: {
	minVersionForCollab?: MinimumVersionForCollab;
}): {
	summarizer: DetachedFieldIndexSummarizer;
	index: DetachedFieldIndex;
} {
	const index = new DetachedFieldIndex(
		"test",
		idAllocatorFromMaxId() as IdAllocator<ForestRootId>,
		testRevisionTagCodec,
		testIdCompressor,
	);
	const summarizer = new DetachedFieldIndexSummarizer(
		index,
		options?.minVersionForCollab ?? FluidClientVersion.v2_73,
	);
	return { summarizer, index };
}

describe("DetachedFieldIndexSummarizer", () => {
	describe("Metadata blob validation", () => {
		it("does not write metadata blob for minVersionForCollab < 2.73.0", () => {
			const { summarizer } = createDetachedFieldIndexSummarizer({
				minVersionForCollab: FluidClientVersion.v2_52,
			});

			const summary = summarizer.summarize({
				stringify: JSON.stringify,
				fullTree: false,
			});

			// Check if metadata blob exists
			const metadataBlob: SummaryObject | undefined =
				summary.summary.tree[detachedFieldIndexMetadataKey];
			assert(metadataBlob === undefined, "Metadata blob should not exist");
		});

		it("writes metadata blob with version 1 for minVersionForCollab 2.73.0", () => {
			const { summarizer } = createDetachedFieldIndexSummarizer({
				minVersionForCollab: FluidClientVersion.v2_73,
			});

			const summary = summarizer.summarize({
				stringify: JSON.stringify,
				fullTree: false,
			});

			// Check if metadata blob exists
			const metadataBlob: SummaryObject | undefined =
				summary.summary.tree[detachedFieldIndexMetadataKey];
			assert(metadataBlob !== undefined, "Metadata blob should exist");
			assert.equal(metadataBlob.type, SummaryType.Blob, "Metadata should be a blob");
			const metadataContent = JSON.parse(
				metadataBlob.content as string,
			) as DetachedFieldIndexSummaryMetadata;
			assert.equal(
				metadataContent.version,
				DetachedFieldIndexSummaryVersion.v1,
				"Metadata version should be 1",
			);
		});

		it("loads with metadata blob with version >= 1", async () => {
			const { summarizer } = createDetachedFieldIndexSummarizer({
				minVersionForCollab: FluidClientVersion.v2_73,
			});

			const summary = summarizer.summarize({
				stringify: JSON.stringify,
				fullTree: false,
			});

			// Verify metadata exists and has version = 1
			const metadataBlob: SummaryObject | undefined =
				summary.summary.tree[detachedFieldIndexMetadataKey];
			assert(metadataBlob !== undefined, "Metadata blob should exist");
			assert.equal(metadataBlob.type, SummaryType.Blob, "Metadata should be a blob");
			const metadataContent = JSON.parse(
				metadataBlob.content as string,
			) as DetachedFieldIndexSummaryMetadata;
			assert.equal(
				metadataContent.version,
				DetachedFieldIndexSummaryVersion.v1,
				"Metadata version should be 1",
			);

			// Create a new DetachedFieldIndexSummarizer and load with the above summary
			const mockStorage = MockStorage.createFromSummary(summary.summary);
			const { summarizer: summarizer2 } = createDetachedFieldIndexSummarizer();

			// Should load successfully with version >= 1
			await assert.doesNotReject(
				async () => summarizer2.load(mockStorage, JSON.parse),
				"Should load successfully with metadata version >= 1",
			);
		});
	});
});
