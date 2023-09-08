/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { buildChunkedForest } from "../../../feature-libraries/chunked-forest/chunkedForest";
// eslint-disable-next-line import/no-internal-modules
import { tryGetChunk } from "../../../feature-libraries/chunked-forest/chunk";
import {
	IChunker,
	basicChunkTree,
	basicOnlyChunkPolicy,
	makeTreeChunker,
	Chunker,
	polymorphic,
	ShapeInfo,
	defaultChunkPolicy,
	tryShapeFromSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkTree";

import {
	mintRevisionTag,
	initializeForest,
	InMemoryStoredSchemaRepository,
	JsonableTree,
	mapCursorField,
	moveToDetachedField,
	rootFieldKey,
	Delta,
	IForestSubscription,
	StoredSchemaRepository,
	applyDelta,
} from "../../../core";
import { jsonObject } from "../../../domains";
import {
	defaultSchemaPolicy,
	jsonableTreeFromCursor,
	singleTextCursor,
} from "../../../feature-libraries";
import { testForest } from "../../forestTestSuite";
import { jsonSequenceRootSchema, mockIntoDelta } from "../../utils";

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

describe("ChunkedForest", () => {
	for (const [name, chunker] of chunkers) {
		describe(name, () => {
			testForest({
				suiteName: "ChunkedForest forest suite",
				factory: (schema) => buildChunkedForest(chunker(schema)),
				skipCursorErrorCheck: true,
			});
		});
	}
});
