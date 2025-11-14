/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { SummaryType, type SummaryObject } from "@fluidframework/driver-definitions/internal";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
import { MockStorage } from "@fluidframework/test-runtime-utils/internal";

import { storedEmptyFieldSchema, TreeStoredSchemaRepository } from "../../../core/index.js";
import {
	encodeTreeSchema,
	SchemaSummarizer,
	SchemaSummaryVersion,
	schemaMetadataKey,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/schema-index/schemaSummarizer.js";
import { toInitialSchema } from "../../../simple-tree/index.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots/index.js";
import { JsonAsTree } from "../../../jsonDomainSchema.js";
import { supportedSchemaFormats } from "./codecUtil.js";
import { FluidClientVersion } from "../../../codec/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { CollabWindow } from "../../../feature-libraries/incrementalSummarizationUtils.js";

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

	describe("Metadata blob validation", () => {
		function createSchemaSummarizer(options?: {
			minVersionForCollab?: MinimumVersionForCollab;
		}): SchemaSummarizer {
			const schema = new TreeStoredSchemaRepository();
			const collabWindow: CollabWindow = {
				getCurrentSeq: () => 0,
			};
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const codec: any = {
				encode: (data: unknown) => data,
				decode: (data: unknown) => data,
			};
			return new SchemaSummarizer(
				schema,
				collabWindow,
				codec,
				options?.minVersionForCollab ?? FluidClientVersion.v2_73,
			);
		}

		it("does not write metadata blob for minVersionForCollab < 2.73.0", () => {
			const summarizer = createSchemaSummarizer({
				minVersionForCollab: FluidClientVersion.v2_52,
			});

			const summary = summarizer.summarize({
				stringify: JSON.stringify,
				fullTree: false,
			});

			// Check if metadata blob exists
			const metadataBlob: SummaryObject | undefined = summary.summary.tree[schemaMetadataKey];
			assert(metadataBlob === undefined, "Metadata blob should not exist");
		});

		it("writes metadata blob with version 1 for minVersionForCollab 2.73.0", () => {
			const summarizer = createSchemaSummarizer({
				minVersionForCollab: FluidClientVersion.v2_73,
			});

			const summary = summarizer.summarize({
				stringify: JSON.stringify,
				fullTree: false,
			});

			// Check if metadata blob exists
			const metadataBlob: SummaryObject | undefined = summary.summary.tree[schemaMetadataKey];
			assert(metadataBlob !== undefined, "Metadata blob should exist");
			assert.equal(metadataBlob.type, SummaryType.Blob, "Metadata should be a blob");
			const metadataContent = JSON.parse(metadataBlob.content as string) as {
				version: number;
			};
			assert.equal(
				metadataContent.version,
				SchemaSummaryVersion.v1,
				"Metadata version should be 1",
			);
		});

		it("loads with metadata blob with version >= 1", async () => {
			const summarizer = createSchemaSummarizer({
				minVersionForCollab: FluidClientVersion.v2_73,
			});

			const summary = summarizer.summarize({
				stringify: JSON.stringify,
				fullTree: false,
			});

			// Verify metadata exists and has version = 1
			const metadataBlob: SummaryObject | undefined = summary.summary.tree[schemaMetadataKey];
			assert(metadataBlob !== undefined, "Metadata blob should exist");
			assert.equal(metadataBlob.type, SummaryType.Blob, "Metadata should be a blob");
			const metadataContent = JSON.parse(metadataBlob.content as string) as {
				version: number;
			};
			assert.equal(metadataContent.version, 1, "Metadata version should be 1");

			// Create a new SchemaSummarizer and load with the above summary
			const mockStorage = MockStorage.createFromSummary(summary.summary);
			const summarizer2 = createSchemaSummarizer();

			// Should load successfully with version >= 1
			await assert.doesNotReject(
				async () => summarizer2.load(mockStorage, JSON.parse),
				"Should load successfully with metadata version >= 1",
			);
		});
	});
});
