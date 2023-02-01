/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	TestField,
	testGeneralPurposeTreeCursor,
	testSpecializedFieldCursor,
} from "../../cursorTestSuite";
import { EmptyKey, ITreeCursor, ITreeCursorSynchronous, TreeSchemaIdentifier } from "../../../core";
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

describe("basicChunk", () => {
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
	);

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
	});
});
