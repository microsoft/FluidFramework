/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	TestField,
	testGeneralPurposeTreeCursor,
	testSpecializedFieldCursor,
} from "../../cursorTestSuite";
import {
	EmptyKey,
	ITreeCursor,
	ITreeCursorSynchronous,
	JsonableTree,
	TreeSchemaIdentifier,
} from "../../../core";
import {
	jsonableTreeFromCursor,
	singleTextCursor,
	chunkTree,
	TreeChunk,
} from "../../../feature-libraries";
import { brand } from "../../../util";
// eslint-disable-next-line import/no-internal-modules
import { uniformChunk } from "../../../feature-libraries/chunked-forest";
// eslint-disable-next-line import/no-internal-modules
import { BasicChunk } from "../../../feature-libraries/chunked-forest/basicChunk";
import { emptyShape, testData } from "./uniformChunkTestData";

describe("basic chunk", () => {
	// TODO: Unskip once BasicChunk implements [cursorChunk]
	it.skip("calling chunkTree on existing chunk adds a reference", () => {
		const data: JsonableTree = { type: brand("Foo"), value: "test" };
		const inputCursor = singleTextCursor(data);
		const chunk = chunkTree(inputCursor);
		assert(!chunk.isShared(), "newly created chunk should not have more than one reference");

		const chunkCursor = chunk.cursor();
		const newChunk = chunkTree(chunkCursor);
		assert(
			newChunk.isShared() && chunk.isShared(),
			"chunk created off of existing chunk should be shared",
		);
	});

	testGeneralPurposeTreeCursor(
		"basic chunk cursor",
		(data): ITreeCursor => {
			const inputCursor = singleTextCursor(data);
			const chunk = chunkTree(inputCursor);
			const cursor: ITreeCursor = chunk.cursor();
			cursor.enterNode(0);
			return cursor;
		},
		jsonableTreeFromCursor,
		true,
	).timeout(10000);

	const schema: TreeSchemaIdentifier = brand("fakeSchema");

	const hybridData: TestField<BasicChunk>[] = [];
	for (const data of testData) {
		hybridData.push({
			name: data.name,
			dataFactory: () => new BasicChunk(schema, new Map([[EmptyKey, [data.dataFactory()]]])),
			reference: [{ type: schema, fields: { [EmptyKey]: data.reference } }],
			path: data.path,
		});
	}

	testSpecializedFieldCursor<TreeChunk, ITreeCursorSynchronous>({
		cursorName: "basic chunk + uniform chunk",
		builders: {
			withKeys: (keys) => {
				const withKeysShape = new BasicChunk(
					schema,
					new Map(
						keys.map((key) => [
							key,
							[uniformChunk(emptyShape.withTopLevelLength(1), [])],
						]),
					),
				);
				return withKeysShape;
			},
		},
		cursorFactory: (data: TreeChunk): ITreeCursorSynchronous => data.cursor(),
		testData: hybridData,
	}).timeout(10000);
});
