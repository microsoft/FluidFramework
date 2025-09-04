/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeStoredSchemaSubscription } from "../../../core/index.js";
import {
	Chunker,
	type IChunker,
	type ShapeInfo,
	defaultChunkPolicy,
	makeTreeChunker,
	polymorphic,
	tryShapeFromSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkTree.js";
// Allow importing from this specific file which is being tested:
// eslint-disable-next-line import/no-internal-modules
import { buildChunkedForest } from "../../../feature-libraries/chunked-forest/chunkedForest.js";
import {
	defaultIncrementalEncodingPolicy,
	defaultSchemaPolicy,
} from "../../../feature-libraries/index.js";
import { testForest } from "../../forestTestSuite.js";

const chunkers: [string, (schema: TreeStoredSchemaSubscription) => IChunker][] = [
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
	[
		"default",
		(schema) => makeTreeChunker(schema, defaultSchemaPolicy, defaultIncrementalEncodingPolicy),
	],
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
				(...args) =>
					tryShapeFromSchema(
						schema,
						defaultSchemaPolicy,
						defaultIncrementalEncodingPolicy,
						...args,
					),
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
				(...args) =>
					tryShapeFromSchema(
						schema,
						defaultSchemaPolicy,
						defaultIncrementalEncodingPolicy,
						...args,
					),
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
				(...args) =>
					tryShapeFromSchema(
						schema,
						defaultSchemaPolicy,
						defaultIncrementalEncodingPolicy,
						...args,
					),
			),
	],
];

describe("ChunkedForest", () => {
	for (const [name, chunker] of chunkers) {
		describe(name, () => {
			testForest({
				factory: (schema) => buildChunkedForest(chunker(schema)),
				skipCursorErrorCheck: true,
			});
		});
	}
});
