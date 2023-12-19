/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { ITelemetryContext } from "@fluidframework/runtime-definitions";
import {
	AllowedUpdateType,
	FieldKey,
	ITreeCursorSynchronous,
	ITreeSubscriptionCursor,
	TreeNavigationResult,
	forEachField,
	moveToDetachedField,
	rootFieldKey,
} from "../../../core";
import { leaf } from "../../../domains";
import { typeboxValidator } from "../../../external-utilities";
import { TreeCompressionStrategy } from "../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { tryGetChunk } from "../../../feature-libraries/chunked-forest/chunk";
// eslint-disable-next-line import/no-internal-modules
import { TreeShape, UniformChunk } from "../../../feature-libraries/chunked-forest/uniformChunk";
import { ForestType, SharedTreeFactory } from "../../../shared-tree";
import { SummarizeType, TestTreeProvider, jsonSequenceRootSchema } from "../../utils";
// eslint-disable-next-line import/no-internal-modules
import { decode } from "../../../feature-libraries/chunked-forest/codec/chunkDecoding";
// eslint-disable-next-line import/no-internal-modules
import { BasicChunk } from "../../../feature-libraries/chunked-forest/basicChunk";
import { SummaryElementStringifier } from "../../../shared-tree-core";

// TODO: Currently we split up a uniform chunk into several individual basicChunks for each node during op creation.
// Therefore, there is currently no way for us to retrieve a uniform chunk from the tree for us to make the proper checks,
// and the tests are expected to fail. The tests can be unskipped once uniform chunks can be inserted into the tree.
describe("End to End chunked encoding", () => {
	it(`insert op values are correct, and shares reference with the original chunk.`, async () => {
		const factory = new SharedTreeFactory({
			jsonValidator: typeboxValidator,
			forest: ForestType.Optimized,
			summaryEncodeType: TreeCompressionStrategy.Compressed,
		});
		const provider = await TestTreeProvider.create(1, SummarizeType.onDemand, factory);
		const tree = provider.trees[0];
		const flexTree = tree.schematizeInternal({
			allowedSchemaModifications: AllowedUpdateType.None,
			schema: jsonSequenceRootSchema,
			initialTree: [],
		});
		const oldSubmitLocalMessage = (tree as any).submitLocalMessage.bind(tree);
		function submitLocalMessage(content: any, localOpMetadata: unknown = undefined): void {
			oldSubmitLocalMessage(content, localOpMetadata);
			// Checks that the op contains correct values, and share reference to the original uniform chunk.
			if (content.changeset[0].data !== undefined) {
				const insertedChunk = decode(content.changeset[0].data.builds.trees)[0];
				assert(chunk.isShared());
				assert.deepEqual((insertedChunk as UniformChunk).values, chunk.values);
			}
		}
		(tree as any).submitLocalMessage = submitLocalMessage;

		const numberShape = new TreeShape(leaf.number.name, true, []);
		const chunk = new UniformChunk(numberShape.withTopLevelLength(4), [1, 2, 3, 4]);
		assert(!chunk.isShared());
		flexTree.editableTree.insertAt(0, chunk.cursor());

		// checks that the final values in the tree are correct.
		const cursor = tree.view.forest.allocateCursor();
		moveToDetachedField(tree.view.forest, cursor);
		const insertedValues = [];
		for (let inNodes = cursor.firstNode(); inNodes; inNodes = cursor.nextNode()) {
			const insertedChunk = tryGetChunk(cursor);
			assert(insertedChunk !== undefined);
			insertedValues.push((insertedChunk as BasicChunk).value);
		}
		assert.deepEqual(insertedValues, chunk.values);
	});

	it(`summary values are correct, and shares reference with the original chunk.`, async () => {
		const factory = new SharedTreeFactory({
			jsonValidator: typeboxValidator,
			forest: ForestType.Optimized,
			summaryEncodeType: TreeCompressionStrategy.Compressed,
		});
		const provider = await TestTreeProvider.create(1, SummarizeType.onDemand, factory);
		const tree = provider.trees[0];
		const flexTree = tree.schematizeInternal({
			allowedSchemaModifications: AllowedUpdateType.None,
			schema: jsonSequenceRootSchema,
			initialTree: [],
		});

		const numberShape = new TreeShape(leaf.number.name, true, []);
		const chunk = new UniformChunk(numberShape.withTopLevelLength(4), [1, 2, 3, 4]);
		assert(!chunk.isShared());

		flexTree.editableTree.insertAt(0, chunk.cursor());
		await provider.ensureSynchronized();

		const oldGetAttachSummary = (tree as any).getAttachSummary.bind(tree);
		function getAttachSummary(
			this: any,
			fullTree: boolean = false,
			trackState: boolean = false,
			telemetryContext?: ITelemetryContext,
		): void {
			const forestSummarizer = this.summarizables[2];
			function getTreeString(this: any, stringify: SummaryElementStringifier) {
				const rootCursor = this.forest.getCursorAboveDetachedFields();
				const fieldMap: Map<FieldKey, ITreeCursorSynchronous & ITreeSubscriptionCursor> =
					new Map();
				// TODO: Encode all detached fields in one operation for better performance and compression
				forEachField(rootCursor, (cursor) => {
					const key = cursor.getFieldKey();
					const innerCursor = this.forest.allocateCursor();
					assert(
						this.forest.tryMoveCursorToField(
							{ fieldKey: key, parent: undefined },
							innerCursor,
						) === TreeNavigationResult.Ok,
						"failed to navigate to field",
					);
					fieldMap.set(
						key,
						innerCursor as ITreeCursorSynchronous & ITreeSubscriptionCursor,
					);
				});
				const encoded = this.codec.encode(fieldMap);

				fieldMap.forEach((value) => value.free());

				// Check that inserted chunk has correct values and share reference to original chunk.
				const rootkeyCursor = fieldMap.get(rootFieldKey);
				assert(rootkeyCursor !== undefined);
				rootkeyCursor?.enterNode(0);
				const insertedChunk = tryGetChunk(rootkeyCursor);
				assert(chunk.isShared());
				assert.deepEqual((insertedChunk as UniformChunk).values, chunk.values);

				return stringify(encoded);
			}
			forestSummarizer.getTreeString = getTreeString;
			oldGetAttachSummary(false, false);
		}
		(tree as any).getAttachSummary = getAttachSummary;

		tree.getAttachSummary();
	});
});
