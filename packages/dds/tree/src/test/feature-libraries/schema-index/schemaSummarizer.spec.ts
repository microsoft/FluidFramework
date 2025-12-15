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
	SchemaFormatVersion,
	storedEmptyFieldSchema,
	TreeStoredSchemaRepository,
} from "../../../core/index.js";
import {
	encodeTreeSchema,
	SchemaSummarizer,
	SchemaSummaryFormatVersion,
	schemaStringKey,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/schema-index/schemaSummarizer.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { Format as SchemaFormatV1 } from "../../../feature-libraries/schema-index/formatV1.js";
import { toInitialSchema } from "../../../simple-tree/index.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots/index.js";
import { JsonAsTree } from "../../../jsonDomainSchema.js";
import { supportedSchemaFormats } from "./codecUtil.js";
import { FluidClientVersion, type CodecWriteOptions } from "../../../codec/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { CollabWindow } from "../../../feature-libraries/incrementalSummarizationUtils.js";
import { makeSchemaCodec } from "../../../feature-libraries/index.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import {
	summarizablesMetadataKey,
	type SharedTreeSummarizableMetadata,
} from "../../../shared-tree-core/index.js";

describe("schemaSummarizer", () => {
	describe("encodeTreeSchema", () => {
		useSnapshotDirectory("encodeTreeSchema");
		for (const schemaFormat of supportedSchemaFormats) {
			it(`empty - schema v${schemaFormat}`, () => {
				const encoded = encodeTreeSchema(
					{
						rootFieldSchema: storedEmptyFieldSchema,
						nodeSchema: new Map(),
					},
					schemaFormat,
				);
				takeJsonSnapshot(encoded);
			});

			it(`simple encoded schema - schema v${schemaFormat}`, () => {
				const encoded = encodeTreeSchema(toInitialSchema(JsonAsTree.Tree), schemaFormat);
				takeJsonSnapshot(encoded);
			});
		}
	});

	describe("Summary metadata validation", () => {
		function createSchemaSummarizer(options?: {
			minVersionForCollab?: MinimumVersionForCollab;
		}): SchemaSummarizer {
			const schema = new TreeStoredSchemaRepository();
			const collabWindow: CollabWindow = {
				getCurrentSeq: () => 0,
			};
			const minVersionForCollab = options?.minVersionForCollab ?? FluidClientVersion.v2_74;
			const codecOptions: CodecWriteOptions = {
				jsonValidator: FormatValidatorBasic,
				minVersionForCollab,
			};
			const codec = makeSchemaCodec(codecOptions);
			return new SchemaSummarizer(schema, collabWindow, codec, minVersionForCollab);
		}

		it("writes metadata blob with version 2", () => {
			const summarizer = createSchemaSummarizer();

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
				SchemaSummaryFormatVersion.v2,
				"Metadata version should be 2",
			);
		});

		it("loads with metadata blob with version 2", async () => {
			const summarizer = createSchemaSummarizer();

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
				SchemaSummaryFormatVersion.v2,
				"Metadata version should be 2",
			);

			// Create a new SchemaSummarizer and load with the above summary
			const mockStorage = MockStorage.createFromSummary(summary.summary);
			const summarizer2 = createSchemaSummarizer();

			// Should load successfully with version 2
			await assert.doesNotReject(async () => summarizer2.load(mockStorage, JSON.parse));
		});

		it("loads pre-versioning format with no metadata blob", async () => {
			// Create data in v1 summary format.
			const schemaDataV1: SchemaFormatV1 = {
				version: SchemaFormatVersion.v1,
				nodes: {},
				root: { kind: storedEmptyFieldSchema.kind, types: [] },
			};
			const schemaBlob: ISummaryBlob = {
				type: SummaryType.Blob,
				content: JSON.stringify(schemaDataV1),
			};
			const summaryTree: ISummaryTree = {
				type: SummaryType.Tree,
				tree: {
					[schemaStringKey]: schemaBlob,
				},
			};

			// Should load successfully
			const mockStorage = MockStorage.createFromSummary(summaryTree);
			const summarizer = createSchemaSummarizer();

			await assert.doesNotReject(async () => summarizer.load(mockStorage, JSON.parse));
		});

		it("fail to load with metadata blob with version > latest", async () => {
			const summarizer = createSchemaSummarizer();

			const summary = summarizer.summarize({
				stringify: JSON.stringify,
			});

			// Modify metadata to have version > latest
			const metadataBlob: SummaryObject | undefined =
				summary.summary.tree[summarizablesMetadataKey];
			assert(metadataBlob !== undefined, "Metadata blob should exist");
			assert.equal(metadataBlob.type, SummaryType.Blob, "Metadata should be a blob");
			const modifiedMetadata = {
				version: SchemaSummaryFormatVersion.vLatest + 1,
			};
			metadataBlob.content = JSON.stringify(modifiedMetadata);

			// Create a new SchemaSummarizer and load with the above summary
			const mockStorage = MockStorage.createFromSummary(summary.summary);
			const summarizer2 = createSchemaSummarizer();

			// Should fail to load with version > latest
			await assert.rejects(
				async () => summarizer2.load(mockStorage, JSON.parse),
				validateUsageError(/Cannot read version/),
			);
		});
	});
});
