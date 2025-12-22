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
	EditManagerSummarizer,
	makeEditManagerCodec,
	summarizablesMetadataKey,
	type SharedTreeSummarizableMetadata,
} from "../../shared-tree-core/index.js";
import {
	EditManagerSummaryFormatVersion,
	stringKey,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../shared-tree-core/editManagerSummarizer.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { EncodedEditManager } from "../../shared-tree-core/editManagerFormatV1toV4.js";
import {
	EditManagerFormatVersion,
	editManagerFormatVersions,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../shared-tree-core/editManagerFormatCommons.js";
import { DependentFormatVersion, FluidClientVersion } from "../../codec/index.js";
import { testIdCompressor } from "../utils.js";
import { RevisionTagCodec } from "../../core/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { editManagerFactory } from "./edit-manager/editManagerTestUtils.js";
import { testChangeFamilyFactory } from "../testChange.js";

function createEditManagerSummarizer(options?: {
	minVersionForCollab?: MinimumVersionForCollab;
}) {
	const family = testChangeFamilyFactory();
	const editManager = editManagerFactory(family);

	const revisionTagCodec = new RevisionTagCodec(testIdCompressor);
	// Use a simple passthrough DependentFormatVersion for testing
	const changeFormatVersion = DependentFormatVersion.fromPairs(
		Array.from(editManagerFormatVersions, (e) => [e, 1]),
	);
	const minVersionForCollab = options?.minVersionForCollab ?? FluidClientVersion.v2_74;
	const codec = makeEditManagerCodec(family.codecs, changeFormatVersion, revisionTagCodec, {
		jsonValidator: FormatValidatorBasic,
		minVersionForCollab,
	});
	const summarizer = new EditManagerSummarizer(
		editManager,
		codec,
		testIdCompressor,
		minVersionForCollab,
	);
	return { summarizer, editManager };
}

describe("EditManagerSummarizer", () => {
	describe("Summary metadata validation", () => {
		it("writes metadata blob with version 2", () => {
			const { summarizer } = createEditManagerSummarizer();

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
				EditManagerSummaryFormatVersion.v2,
				"Metadata version should be 2",
			);
		});

		it("loads with metadata blob with version 2", async () => {
			const { summarizer } = createEditManagerSummarizer({
				minVersionForCollab: FluidClientVersion.v2_74,
			});

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
				EditManagerSummaryFormatVersion.v2,
				"Metadata version should be 2",
			);

			// Create a new EditManagerSummarizer and load with the above summary
			const mockStorage = MockStorage.createFromSummary(summary.summary);
			const { summarizer: summarizer2 } = createEditManagerSummarizer();

			// Should load successfully with version 2
			await assert.doesNotReject(async () => summarizer2.load(mockStorage, JSON.parse));
		});

		it("loads pre-versioning format with no metadata blob", async () => {
			// Create data in v1 summary format .
			const editManagerDataV1: EncodedEditManager<unknown> = {
				version: EditManagerFormatVersion.v3,
				trunk: [],
				branches: [],
			};
			const editManagerBlob: ISummaryBlob = {
				type: SummaryType.Blob,
				content: JSON.stringify(editManagerDataV1),
			};
			const summaryTree: ISummaryTree = {
				type: SummaryType.Tree,
				tree: {
					[stringKey]: editManagerBlob,
				},
			};

			// Should load successfully
			const mockStorage = MockStorage.createFromSummary(summaryTree);
			const { summarizer } = createEditManagerSummarizer();

			await assert.doesNotReject(async () => summarizer.load(mockStorage, JSON.parse));
		});

		it("fail to load with metadata blob with version > latest", async () => {
			const { summarizer } = createEditManagerSummarizer({
				minVersionForCollab: FluidClientVersion.v2_74,
			});

			const summary = summarizer.summarize({
				stringify: JSON.stringify,
			});

			// Modify metadata to have version > latest
			const metadataBlob: SummaryObject | undefined =
				summary.summary.tree[summarizablesMetadataKey];
			assert(metadataBlob !== undefined, "Metadata blob should exist");
			assert.equal(metadataBlob.type, SummaryType.Blob, "Metadata should be a blob");
			const modifiedMetadata: SharedTreeSummarizableMetadata = {
				version: EditManagerSummaryFormatVersion.vLatest + 1,
			};
			metadataBlob.content = JSON.stringify(modifiedMetadata);

			// Create a new EditManagerSummarizer and load with the above summary
			const mockStorage = MockStorage.createFromSummary(summary.summary);
			const { summarizer: summarizer2 } = createEditManagerSummarizer();

			// Should fail to load with version > latest
			await assert.rejects(
				async () => summarizer2.load(mockStorage, JSON.parse),
				validateUsageError(/Cannot read version/),
			);
		});
	});
});
