/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { SummaryType, type SummaryObject } from "@fluidframework/driver-definitions";
import { MockStorage } from "@fluidframework/test-runtime-utils/internal";

import { typeboxValidator } from "../../../external-utilities/index.js";
import { FluidClientVersion, type CodecWriteOptions } from "../../../codec/index.js";
import {
	ForestSummarizer,
	TreeCompressionStrategy,
	defaultSchemaPolicy,
	makeFieldBatchCodec,
	type FieldBatchEncodingContext,
} from "../../../feature-libraries/index.js";
import { checkoutWithContent, testIdCompressor, testRevisionTagCodec } from "../../utils.js";
import { jsonSequenceRootSchema } from "../../sequenceRootUtils.js";
import type { TreeStoredContent } from "../../../shared-tree/index.js";
import {
	permissiveStoredSchemaGenerationOptions,
	SchemaFactory,
	toStoredSchema,
} from "../../../simple-tree/index.js";
import { singleJsonCursor } from "../../json/index.js";
// eslint-disable-next-line import/no-internal-modules
import { treeBlobKey } from "../../../feature-libraries/forest-summary/forestSummarizer.js";

describe("ForestSummarizer", () => {
	function createForestSummarizer(args: {
		// The encoding strategy to use when summarizing the forest.
		encodeType: TreeCompressionStrategy;
		// The content and schema to initialize the forest with. By default, it is an empty forest.
		initialContent?: TreeStoredContent;
		// True for creating a chunked forest.
		chunkedForest?: true;
	}): ForestSummarizer {
		const {
			initialContent = {
				schema: jsonSequenceRootSchema,
				initialTree: undefined,
			},
			encodeType,
			chunkedForest,
		} = args;
		const fieldBatchCodec = makeFieldBatchCodec({ jsonValidator: typeboxValidator }, 1);
		const options: CodecWriteOptions = {
			jsonValidator: typeboxValidator,
			oldestCompatibleClient: FluidClientVersion.v2_0,
		};
		const checkout = checkoutWithContent(initialContent, { chunkedForest });
		const encoderContext: FieldBatchEncodingContext = {
			encodeType,
			idCompressor: testIdCompressor,
			originatorId: testIdCompressor.localSessionId,
			schema: { schema: initialContent.schema, policy: defaultSchemaPolicy },
		};
		return new ForestSummarizer(
			checkout.forest,
			testRevisionTagCodec,
			fieldBatchCodec,
			encoderContext,
			options,
			testIdCompressor,
		);
	}

	describe("Create and Load", () => {
		const testCases: {
			encodeType: TreeCompressionStrategy;
			type: string;
			chunkedForest?: true;
		}[] = [
			{
				encodeType: TreeCompressionStrategy.Compressed,
				type: "compressed",
			},
			{
				encodeType: TreeCompressionStrategy.Uncompressed,
				type: "uncompressed",
			},
			{
				encodeType: TreeCompressionStrategy.Compressed,
				type: "compressed chunked",
				chunkedForest: true,
			},
			{
				encodeType: TreeCompressionStrategy.Uncompressed,
				type: "uncompressed chunked",
				chunkedForest: true,
			},
		];
		for (const { encodeType, type, chunkedForest } of testCases) {
			it(`can summarize empty ${type} forest and load from it`, async () => {
				const forestSummarizer = createForestSummarizer({ encodeType, chunkedForest });
				const summary = forestSummarizer.summarize({ stringify: JSON.stringify });
				assert(
					Object.keys(summary.summary.tree).length === 1,
					"Summary tree should only contain one entry for the forest contents",
				);
				const forestContentsBlob: SummaryObject | undefined =
					summary.summary.tree[treeBlobKey];
				assert(
					forestContentsBlob?.type === SummaryType.Blob,
					"Forest summary contents not found",
				);

				// Create a new ForestSummarizer and load with the above summary.
				const mockStorage = MockStorage.createFromSummary(summary.summary);
				const forestSummarizer2 = createForestSummarizer({ encodeType, chunkedForest });
				await assert.doesNotReject(async () => {
					await forestSummarizer2.load(mockStorage, JSON.parse);
				});
			});

			it(`can summarize ${type} forest with simple content and load from it`, async () => {
				const sf = new SchemaFactory("test");
				const schema = sf.number;
				const initialContent: TreeStoredContent = {
					schema: toStoredSchema(schema, permissiveStoredSchemaGenerationOptions),
					get initialTree() {
						return singleJsonCursor(5);
					},
				};
				const forestSummarizer = createForestSummarizer({
					initialContent,
					encodeType,
					chunkedForest,
				});
				const summary = forestSummarizer.summarize({ stringify: JSON.stringify });
				assert(
					Object.keys(summary.summary.tree).length === 1,
					"Summary tree should only contain one entry for the forest contents",
				);
				const forestContentsBlob: SummaryObject | undefined =
					summary.summary.tree[treeBlobKey];
				assert(
					forestContentsBlob?.type === SummaryType.Blob,
					"Forest summary contents not found",
				);

				// Create a new empty ForestSummarizer and load with the above summary.
				const mockStorage = MockStorage.createFromSummary(summary.summary);
				const forestSummarizer2 = createForestSummarizer({ encodeType, chunkedForest });
				await assert.doesNotReject(async () => {
					await forestSummarizer2.load(mockStorage, JSON.parse);
				});
			});
		}
	});
});
