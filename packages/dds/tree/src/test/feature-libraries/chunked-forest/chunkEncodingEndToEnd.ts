/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { AllowedUpdateType, moveToDetachedField } from "../../../core";
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

describe("End to End chunk encoding", () => {
	it(`insert op values are correct and reference equal to the original chunk.`, async () => {
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
		// TODO: Currently we split up a uniform chunk into several individual basicChunks for each node during op creation.
		// Once we're able to insert a uniform chunk as one chunk, we will be able to add a check that the values are reference equal to the original chunk.
		function submitLocalMessage(content: any, localOpMetadata: unknown = undefined): void {
			oldSubmitLocalMessage(content, localOpMetadata);
			// Checks that the op contains same values as the original chunk used to create an op.
			if (content.changeset[0].data !== undefined) {
				const chunks = decode(content.changeset[0].data.builds.trees);
				const values = chunks.map((c) => (c as BasicChunk).value);
				assert.deepEqual(values, chunk.values);
				// TODO: once uniform chunks can be encoded without separation, the following check chunk reference should be made.
				// const insertedChunk = decode(content.changeset[0].data.builds.trees)[0]
				// assert(insertedChunk.isShared())
			}
		}
		(tree as any).submitLocalMessage = submitLocalMessage;

		const numberShape = new TreeShape(leaf.number.name, true, []);
		const chunk = new UniformChunk(numberShape.withTopLevelLength(4), [1, 2, 3, 4]);

		flexTree.editableTree.insertAt(0, chunk.cursor());

		const cursor = tree.view.forest.allocateCursor();
		moveToDetachedField(tree.view.forest, cursor);
		const insertedValues = [];
		for (let inNodes = cursor.firstNode(); inNodes; inNodes = cursor.nextNode()) {
			const insertedChunk = tryGetChunk(cursor);
			assert(insertedChunk !== undefined);
			insertedValues.push(insertedChunk.value);
		}
		assert.deepEqual(insertedValues, chunk.values);

		// TODO: once uniform chunks can be encoded without separation, the following check chunk reference should be made.
		// const insertedChunk = decode(content.changeset[0].data.builds.trees)[0]
		// assert(insertedChunk.isShared())
	});
});
