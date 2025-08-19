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
import {
	checkoutWithContent,
	testIdCompressor,
	testRevisionTagCodec,
	type TreeStoredContentStrict,
} from "../../utils.js";
import { jsonSequenceRootSchema } from "../../sequenceRootUtils.js";
import {
	ForestTypeOptimized,
	ForestTypeReference,
	type ForestType,
} from "../../../shared-tree/index.js";
import {
	permissiveStoredSchemaGenerationOptions,
	SchemaFactory,
	toStoredSchema,
} from "../../../simple-tree/index.js";
import { fieldJsonCursor } from "../../json/index.js";
// eslint-disable-next-line import/no-internal-modules
import { treeBlobKey } from "../../../feature-libraries/forest-summary/forestSummarizer.js";

describe("ForestSummarizer", () => {
	function createForestSummarizer(args: {
		// The encoding strategy to use when summarizing the forest.
		encodeType: TreeCompressionStrategy;
		// The type of forest to create.
		forestType: ForestType;
		// The content and schema to initialize the forest with. By default, it is an empty forest.
		initialContent?: TreeStoredContentStrict;
	}): ForestSummarizer {
		const {
			initialContent = {
				schema: jsonSequenceRootSchema,
				initialTree: undefined,
			},
			encodeType,
			forestType,
		} = args;
		const fieldBatchCodec = makeFieldBatchCodec({ jsonValidator: typeboxValidator }, 1);
		const options: CodecWriteOptions = {
			jsonValidator: typeboxValidator,
			oldestCompatibleClient: FluidClientVersion.v2_0,
		};
		const checkout = checkoutWithContent(initialContent, {
			forestType,
		});
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
			testType: string;
			forestType: ForestType;
		}[] = [
			{
				encodeType: TreeCompressionStrategy.Compressed,
				testType: "compressed",
				forestType: ForestTypeReference,
			},
			{
				encodeType: TreeCompressionStrategy.Uncompressed,
				testType: "uncompressed",
				forestType: ForestTypeReference,
			},
			{
				encodeType: TreeCompressionStrategy.Compressed,
				testType: "compressed chunked",
				forestType: ForestTypeOptimized,
			},
			{
				encodeType: TreeCompressionStrategy.Uncompressed,
				testType: "uncompressed chunked",
				forestType: ForestTypeOptimized,
			},
		];
		for (const { encodeType, testType, forestType } of testCases) {
			it(`can summarize empty ${testType} forest and load from it`, async () => {
				const forestSummarizer = createForestSummarizer({ encodeType, forestType });
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
				const forestSummarizer2 = createForestSummarizer({ encodeType, forestType });
				await assert.doesNotReject(async () => {
					await forestSummarizer2.load(mockStorage, JSON.parse);
				});
			});

			it(`can summarize ${testType} forest with simple content and load from it`, async () => {
				const schema = SchemaFactory.number;
				const initialContent: TreeStoredContentStrict = {
					schema: toStoredSchema(schema, permissiveStoredSchemaGenerationOptions),
					get initialTree() {
						return fieldJsonCursor([5]);
					},
				};
				const forestSummarizer = createForestSummarizer({
					initialContent,
					encodeType,
					forestType,
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
				const forestSummarizer2 = createForestSummarizer({ encodeType, forestType });
				await assert.doesNotReject(async () => {
					await forestSummarizer2.load(mockStorage, JSON.parse);
				});
			});
		}
	});
});
