/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	SummaryType,
	type ISummaryBlob,
	type ISummaryTree,
	type SummaryObject,
} from "@fluidframework/driver-definitions/internal";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
import { MockStorage, validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import {
	DetachedFieldIndex,
	DetachedFieldIndexFormatVersion,
	type ForestRootId,
} from "../../core/index.js";
import {
	DetachedFieldIndexSummarizer,
	DetachedFieldIndexSummaryFormatVersion,
	detachedFieldIndexBlobKey,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../feature-libraries/detachedFieldIndexSummarizer.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { FormatV1 } from "../../core/tree/detachedFieldIndexFormatV1.js";
import { FluidClientVersion } from "../../codec/index.js";
import { testIdCompressor, testRevisionTagCodec } from "../utils.js";
import { brand, type IdAllocator, idAllocatorFromMaxId } from "../../util/index.js";
import {
	summarizablesMetadataKey,
	type SharedTreeSummarizableMetadata,
} from "../../shared-tree-core/index.js";

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
		options?.minVersionForCollab ?? FluidClientVersion.v2_74,
	);
	return { summarizer, index };
}

describe("DetachedFieldIndexSummarizer", () => {
	describe("Summary metadata validation", () => {
		it("writes metadata blob with version 2", () => {
			const { summarizer } = createDetachedFieldIndexSummarizer();

			const summary = summarizer.summarize({
				stringify: JSON.stringify,
			});

			// Check if metadata blob exists
			const metadataBlob: SummaryObject | undefined =
				summary.summary.tree[summarizablesMetadataKey];
			assert(metadataBlob !== undefined, "Metadata blob should exist");
			assert.equal(metadataBlob.type, SummaryType.Blob, "Metadata should be a blob");
			const metadataContent = JSON.parse(
				metadataBlob.content as string,
			) as SharedTreeSummarizableMetadata;
			assert.equal(
				metadataContent.version,
				DetachedFieldIndexSummaryFormatVersion.v2,
				"Metadata version should be 2",
			);
		});

		it("loads with metadata blob with version 2", async () => {
			const { summarizer } = createDetachedFieldIndexSummarizer();

			const summary = summarizer.summarize({
				stringify: JSON.stringify,
			});

			// Verify metadata exists and has version = 2
			const metadataBlob: SummaryObject | undefined =
				summary.summary.tree[summarizablesMetadataKey];
			assert(metadataBlob !== undefined, "Metadata blob should exist");
			assert.equal(metadataBlob.type, SummaryType.Blob, "Metadata should be a blob");
			const metadataContent = JSON.parse(
				metadataBlob.content as string,
			) as SharedTreeSummarizableMetadata;
			assert.equal(
				metadataContent.version,
				DetachedFieldIndexSummaryFormatVersion.v2,
				"Metadata version should be 2",
			);

			// Create a new DetachedFieldIndexSummarizer and load with the above summary
			const mockStorage = MockStorage.createFromSummary(summary.summary);
			const { summarizer: summarizer2 } = createDetachedFieldIndexSummarizer();

			// Should load successfully with version 2
			await assert.doesNotReject(async () => summarizer2.load(mockStorage, JSON.parse));
		});

		it("loads pre-versioning format with no metadata blob", async () => {
			// Create data in v1 summary format.
			const mintedTag = testIdCompressor.generateCompressedId();
			const finalizedTag = testIdCompressor.normalizeToOpSpace(mintedTag);
			const detachedFieldDataV1: FormatV1 = {
				version: brand(DetachedFieldIndexFormatVersion.v1),
				data: [[brand(finalizedTag), 0, brand(1)]],
				maxId: brand(-1),
			};
			const summaryBlob: ISummaryBlob = {
				type: SummaryType.Blob,
				content: JSON.stringify(detachedFieldDataV1),
			};
			const summaryTree: ISummaryTree = {
				type: SummaryType.Tree,
				tree: {
					[detachedFieldIndexBlobKey]: summaryBlob,
				},
			};

			// Should load successfully
			const mockStorage = MockStorage.createFromSummary(summaryTree);
			const { summarizer: summarizer2 } = createDetachedFieldIndexSummarizer();

			await assert.doesNotReject(async () => summarizer2.load(mockStorage, JSON.parse));
		});

		it("fail to load with metadata blob with version > latest", async () => {
			const { summarizer } = createDetachedFieldIndexSummarizer();

			const summary = summarizer.summarize({
				stringify: JSON.stringify,
			});

			// Modify metadata to have version > latest
			const metadataBlob: SummaryObject | undefined =
				summary.summary.tree[summarizablesMetadataKey];
			assert(metadataBlob !== undefined, "Metadata blob should exist");
			assert.equal(metadataBlob.type, SummaryType.Blob, "Metadata should be a blob");
			const modifiedMetadata: SharedTreeSummarizableMetadata = {
				version: DetachedFieldIndexSummaryFormatVersion.vLatest + 1,
			};
			metadataBlob.content = JSON.stringify(modifiedMetadata);

			// Create a new DetachedFieldIndexSummarizer and load with the above summary
			const mockStorage = MockStorage.createFromSummary(summary.summary);
			const { summarizer: summarizer2 } = createDetachedFieldIndexSummarizer();

			// Should fail to load with version > latest
			await assert.rejects(
				async () => summarizer2.load(mockStorage, JSON.parse),
				validateUsageError(/Cannot read version/),
			);
		});
	});
});
