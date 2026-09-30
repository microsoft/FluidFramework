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
import type { OldestSupportedClientVersion } from "@fluidframework/runtime-definitions/internal";
import { MockStorage, validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import {
	currentVersion,
	DependentFormatVersion,
	FluidClientVersion,
} from "../../codec/index.js";
import { RevisionTagCodec } from "../../core/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import {
	EditManagerFormatVersion,
	editManagerFormatVersions,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../shared-tree-core/editManagerFormatCommons.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { EncodedEditManager } from "../../shared-tree-core/editManagerFormatV1toV4.js";
import {
	EditManagerSummaryFormatVersion,
	stringKey,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../shared-tree-core/editManagerSummarizer.js";
import {
	EditManagerSummarizer,
	makeEditManagerCodecBuilder,
	summarizablesMetadataKey,
	type SharedTreeSummarizableMetadata,
} from "../../shared-tree-core/index.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	toInitialSchema,
} from "../../simple-tree/index.js";
import { testChangeFamilyFactory, type TestChange } from "../testChange.js";
import {
	expectSchemaEqual,
	SharedTreeTestFactory,
	TestTreeProviderLite,
	testIdCompressor,
} from "../utils.js";

// eslint-disable-next-line import-x/no-internal-modules
import { editManagerFactory } from "./edit-manager/editManagerTestUtils.js";

function createEditManagerSummarizer(options?: {
	minVersionForCollab?: OldestSupportedClientVersion;
}) {
	const family = testChangeFamilyFactory();
	const editManager = editManagerFactory(family);

	const revisionTagCodec = new RevisionTagCodec(testIdCompressor);
	// Use a simple passthrough DependentFormatVersion for testing
	const changeFormatVersion = DependentFormatVersion.fromPairs(
		Array.from(editManagerFormatVersions, (e) => [e, 1]),
	);
	const minVersionForCollab = options?.minVersionForCollab ?? FluidClientVersion.v2_74;
	const codec = makeEditManagerCodecBuilder<TestChange>().build({
		jsonValidator: FormatValidatorBasic,
		minVersionForCollab,
		changeCodecs: family.codecs,
		dependentChangeFormatVersion: changeFormatVersion,
		revisionTagCodec,
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
	// TODO: 0xb53: peer data commits are encoded using the current document schema rather than
	// the schema established by the preceding peer commit.
	// Minimized from topLevel.fuzz.spec.ts, Batch rebasing seed 41.
	it.skip("summarizes peer history after a schema upgrade and dependent edit lose a rebase", async () => {
		const sf = new SchemaFactory("summarySchemaRebase");
		class Added extends sf.object("Added", { value: sf.string }) {}
		const oldConfig = new TreeViewConfiguration({ schema: sf.optional(sf.string) });
		const newConfig = new TreeViewConfiguration({ schema: sf.optional([sf.string, Added]) });
		const provider = new TestTreeProviderLite(
			2,
			new SharedTreeTestFactory(() => {}, undefined, { minVersionForCollab: currentVersion }),
		);
		const [a, b] = provider.trees;
		const aView = a.viewWith(oldConfig);
		aView.initialize("initial");
		provider.synchronizeMessages();
		const bView = b.viewWith(newConfig);

		aView.root = "concurrent edit";
		bView.upgradeSchema();
		bView.root = new Added({ value: "dependent data" });
		provider.synchronizeMessages();

		assert.equal(aView.root, "concurrent edit");
		assert.equal(bView.compatibility.isEquivalent, false);
		expectSchemaEqual(a.kernel.checkout.storedSchema, toInitialSchema(oldConfig.schema));
		// A retains B's original schema and data commits in peer history, although its current
		// document schema no longer includes Added. Encoding that history must still succeed.
		await a.summarize();
	});

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
