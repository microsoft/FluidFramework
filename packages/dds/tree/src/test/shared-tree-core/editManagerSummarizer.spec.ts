/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { SummaryType, type SummaryObject } from "@fluidframework/driver-definitions/internal";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
import { MockStorage } from "@fluidframework/test-runtime-utils/internal";

import {
	EditManagerSummarizer,
	makeEditManagerCodec,
	editManagerFormatVersions,
} from "../../shared-tree-core/index.js";
import {
	editManagerMetadataKey,
	EditManagerSummaryVersion,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../shared-tree-core/editManagerSummarizer.js";
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
	const minVersionForCollab = options?.minVersionForCollab ?? FluidClientVersion.v2_73;
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
	describe("Metadata blob validation", () => {
		it("does not write metadata blob for minVersionForCollab < 2.73.0", () => {
			const { summarizer } = createEditManagerSummarizer({
				minVersionForCollab: FluidClientVersion.v2_52,
			});

			const summary = summarizer.summarize({
				stringify: JSON.stringify,
				fullTree: false,
			});

			// Check if metadata blob exists
			const metadataBlob: SummaryObject | undefined =
				summary.summary.tree[editManagerMetadataKey];
			assert(metadataBlob === undefined, "Metadata blob should not exist");
		});

		it("writes metadata blob with version 1 for minVersionForCollab 2.73.0", () => {
			const { summarizer } = createEditManagerSummarizer({
				minVersionForCollab: FluidClientVersion.v2_73,
			});

			const summary = summarizer.summarize({
				stringify: JSON.stringify,
				fullTree: false,
			});

			// Check if metadata blob exists
			const metadataBlob: SummaryObject | undefined =
				summary.summary.tree[editManagerMetadataKey];
			assert(metadataBlob !== undefined, "Metadata blob should exist");
			assert.equal(metadataBlob.type, SummaryType.Blob, "Metadata should be a blob");
			const metadataContent = JSON.parse(metadataBlob.content as string) as {
				version: number;
			};
			assert.equal(
				metadataContent.version,
				EditManagerSummaryVersion.v1,
				"Metadata version should be 1",
			);
		});

		it("loads with metadata blob with version >= 1", async () => {
			const { summarizer } = createEditManagerSummarizer({
				minVersionForCollab: FluidClientVersion.v2_73,
			});

			const summary = summarizer.summarize({
				stringify: JSON.stringify,
				fullTree: false,
			});

			// Verify metadata exists and has version = 1
			const metadataBlob: SummaryObject | undefined =
				summary.summary.tree[editManagerMetadataKey];
			assert(metadataBlob !== undefined, "Metadata blob should exist");
			assert.equal(metadataBlob.type, SummaryType.Blob, "Metadata should be a blob");
			const metadataContent = JSON.parse(metadataBlob.content as string) as {
				version: number;
			};
			assert.equal(
				metadataContent.version,
				EditManagerSummaryVersion.v1,
				"Metadata version should be 1",
			);

			// Create a new EditManagerSummarizer and load with the above summary
			const mockStorage = MockStorage.createFromSummary(summary.summary);
			const { summarizer: summarizer2 } = createEditManagerSummarizer();

			// Should load successfully with version >= 1
			await assert.doesNotReject(
				async () => summarizer2.load(mockStorage, JSON.parse),
				"Should load successfully with metadata version >= 1",
			);
		});
	});
});
