/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { CodecWriteOptions } from "../../../codec/index.js";
import { FluidClientVersion } from "../../../codec/index.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import {
	defaultSchemaPolicy,
	type FieldBatchEncodingContext,
	ForestSummarizer,
	makeFieldBatchCodec,
	TreeCompressionStrategy,
} from "../../../feature-libraries/index.js";
import { ForestTypeOptimized, type TreeCheckout } from "../../../shared-tree/index.js";
import {
	incrementalEncodingPolicyForAllowedTypes,
	incrementalSummaryHint,
	permissiveStoredSchemaGenerationOptions,
	SchemaFactoryAlpha,
	TreeViewConfigurationAlpha,
	toStoredSchema,
} from "../../../simple-tree/index.js";
import { fieldJsonCursor } from "../../json/index.js";
import {
	checkoutWithContent,
	fieldCursorFromInsertable,
	type TreeStoredContentStrict,
	testIdCompressor,
	testRevisionTagCodec,
} from "../../utils.js";

const sf = new SchemaFactoryAlpha("IncrementalSummarization");

/**
 * Deepest level - contains primitive data
 */
export class Level3 extends sf.objectAlpha("level3", {
	value: sf.string,
	timestamp: sf.number,
}) {}

/**
 * Third level - contains Level3 object
 */
export class Level2 extends sf.objectAlpha("level2", {
	nested: Level3,
	metadata: sf.string,
}) {}

/**
 * Second level - contains Level2 object
 */
export class Level1 extends sf.objectAlpha("level1", {
	nested: Level2,
	description: sf.string,
}) {}

/**
 * A deeply nested item with multiple levels of nesting.
 * Each field is marked for incremental summarization.
 */
export class BarItem extends sf.objectAlpha("barItem", {
	id: sf.number,
	data: sf.types([{ type: sf.string, metadata: {} }], {
		custom: { [incrementalSummaryHint]: true },
	}),
	nested: sf.types([{ type: Level1, metadata: {} }], {
		custom: { [incrementalSummaryHint]: true },
	}),
}) {}

/**
 * Array of BarItems
 */
export class BarArray extends sf.array("barArray", BarItem) {}

export class Root extends sf.objectAlpha("root", {
	rootId: sf.number,
	barArray: BarArray,
}) {}

/**
 * Sets up the forest summarizer for incremental summarization. It creates a forest and sets up some
 * of the fields to support incremental encoding.
 * Note that it creates a chunked forest of type `ForestTypeOptimized` with compression strategy
 * `TreeCompressionStrategy.CompressedIncremental` since incremental summarization is only
 * supported by this combination.
 */
export function setupForestForIncrementalSummarization(
	initialBoard: Root | undefined,
	options?: CodecWriteOptions,
): { forestSummarizer: ForestSummarizer; checkout: TreeCheckout } {
	const fieldCursor = initialBoard
		? fieldCursorFromInsertable(Root, initialBoard)
		: fieldJsonCursor([]);
	const initialContent: TreeStoredContentStrict = {
		schema: toStoredSchema(Root, permissiveStoredSchemaGenerationOptions),
		initialTree: fieldCursor,
	};

	const codecOptions: CodecWriteOptions = options ?? {
		jsonValidator: FormatValidatorBasic,
		minVersionForCollab: FluidClientVersion.v2_74,
	};
	const fieldBatchCodec = makeFieldBatchCodec(codecOptions);
	const checkout = checkoutWithContent(initialContent, {
		forestType: ForestTypeOptimized,
		shouldEncodeIncrementally: incrementalEncodingPolicyForAllowedTypes(
			new TreeViewConfigurationAlpha({ schema: Root }),
		),
	});
	const encoderContext: FieldBatchEncodingContext = {
		encodeType: TreeCompressionStrategy.CompressedIncremental,
		idCompressor: testIdCompressor,
		originatorId: testIdCompressor.localSessionId,
		schema: { schema: initialContent.schema, policy: defaultSchemaPolicy },
	};
	return {
		checkout,
		forestSummarizer: new ForestSummarizer(
			checkout.forest,
			testRevisionTagCodec,
			fieldBatchCodec,
			encoderContext,
			codecOptions,
			testIdCompressor,
			0 /* initialSequenceNumber */,
			incrementalEncodingPolicyForAllowedTypes(
				new TreeViewConfigurationAlpha({ schema: Root }),
			),
		),
	};
}

/**
 * Creates a BarItem with deeply nested structure.
 * @param id - The ID for this BarItem
 */
function createBarItem(id: number): BarItem {
	return new BarItem({
		id,
		data: `Data for item ${id}`,
		nested: new Level1({
			description: `ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345ABCDEFGHIJKLMNOPQRSTUVWXYZ012345`,
			nested: new Level2({
				metadata: `Metadata for item ${id}`,
				nested: new Level3({
					value: `Value for item ${id}`,
					timestamp: Date.now(),
				}),
			}),
		}),
	});
}

/**
 * Creates an initial Root object with the specified number of top-level items.
 * Each item contains a deeply nested structure with 4 levels of nesting (BarItem -\> Level1 -\> Level2 -\> Level3).
 * The `id` for `BarItem`s are set to 10, 20, ..., itemsCount * 10. This is to make debugging simpler.
 * @param itemsCount - The number of top-level items to create.
 */
export function createInitialBoard(itemsCount: number): Root {
	let nextItemId = 10;
	const barArray: BarItem[] = [];
	for (let i = 0; i < itemsCount; i++) {
		barArray.push(createBarItem(nextItemId));
		nextItemId += 10;
	}
	return new Root({
		rootId: 1,
		barArray,
	});
}
