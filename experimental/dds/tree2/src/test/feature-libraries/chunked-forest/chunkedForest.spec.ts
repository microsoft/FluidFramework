/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Allow importing from this specific file which is being tested:
// eslint-disable-next-line import/no-internal-modules
import { buildChunkedForest } from "../../../feature-libraries/chunked-forest/chunkedForest";
import {
	IChunker,
	makeTreeChunker,
	Chunker,
	polymorphic,
	ShapeInfo,
	defaultChunkPolicy,
	tryShapeFromSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkTree";

import {
	initializeForest,
	InMemoryStoredSchemaRepository,
	rootFieldKey,
	StoredSchemaRepository,
	UpPath,
} from "../../../core";
import { defaultSchemaPolicy } from "../../../feature-libraries";
import { testForest } from "../../forestTestSuite";
import { jsonRoot, jsonSchema, SchemaBuilder, singleJsonCursor } from "../../../domains";
import { expectEqualPaths } from "../../utils";

const chunkers: [string, (schema: StoredSchemaRepository) => IChunker][] = [
	[
		"basic",
		(schema): IChunker =>
			new Chunker(
				schema,
				defaultSchemaPolicy,
				Number.POSITIVE_INFINITY,
				Number.POSITIVE_INFINITY,
				0,
				() => polymorphic,
			),
	],
	["default", (schema) => makeTreeChunker(schema, defaultSchemaPolicy)],
	[
		"sequences",
		(schema): IChunker =>
			new Chunker(schema, defaultSchemaPolicy, 2, 1, 0, (): ShapeInfo => polymorphic),
	],
	[
		"minimal-uniform",
		(schema): IChunker =>
			new Chunker(
				schema,
				defaultSchemaPolicy,
				Number.POSITIVE_INFINITY,
				Number.POSITIVE_INFINITY,
				1,
				tryShapeFromSchema,
			),
	],
	[
		"uniform",
		(schema): IChunker =>
			new Chunker(
				schema,
				defaultSchemaPolicy,
				Number.POSITIVE_INFINITY,
				Number.POSITIVE_INFINITY,
				defaultChunkPolicy.uniformChunkNodeCount,
				tryShapeFromSchema,
			),
	],
	[
		"mixed",
		(schema): IChunker =>
			new Chunker(
				schema,
				defaultSchemaPolicy,
				2,
				1,
				defaultChunkPolicy.uniformChunkNodeCount,
				tryShapeFromSchema,
			),
	],
];

const jsonDocumentSchema = new SchemaBuilder({
	scope: "jsonDocumentSchema",
	libraries: [jsonSchema],
}).intoSchema(SchemaBuilder.sequence(jsonRoot));

describe("ChunkedForest", () => {
	for (const [name, chunker] of chunkers) {
		describe(name, () => {
			testForest({
				suiteName: "ChunkedForest forest suite",
				factory: (schema) => buildChunkedForest(chunker(schema)),
				skipCursorErrorCheck: true,
			});

			it("getCursorAboveDetachedFields", () => {
				const forest = buildChunkedForest(
					chunker(new InMemoryStoredSchemaRepository(jsonDocumentSchema)),
				);
				initializeForest(forest, [singleJsonCursor([1, 2])]);
				const cursor = forest.getCursorAboveDetachedFields();
				const expectedPath: UpPath = {
					parent: undefined,
					parentField: rootFieldKey,
					parentIndex: 0,
				};
				expectEqualPaths(cursor.getPath(), expectedPath);
			});
		});
	}
});
