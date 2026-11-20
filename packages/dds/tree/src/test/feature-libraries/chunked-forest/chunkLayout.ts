/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeChunk } from "../../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { BasicChunk } from "../../../feature-libraries/chunked-forest/basicChunk.js";
// eslint-disable-next-line import-x/no-internal-modules
import { SequenceChunk } from "../../../feature-libraries/chunked-forest/sequenceChunk.js";
import {
	type TreeShape,
	UniformChunk,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/uniformChunk.js";

/**
 * Describes how content is stored in `chunks`, without its values:
 * the kind and length of each chunk, the shapes of uniform chunks, and the fields of basic chunks, in order.
 */
export function describeChunkLayout(chunks: readonly TreeChunk[]): unknown[] {
	return chunks.map(describeChunk);
}

function describeChunk(chunk: TreeChunk): unknown {
	if (chunk instanceof UniformChunk) {
		return {
			uniform: describeShape(chunk.shape.treeShape),
			topLevelLength: chunk.topLevelLength,
			values: chunk.values.length,
		};
	}
	if (chunk instanceof BasicChunk) {
		return {
			basic: chunk.type,
			hasValue: chunk.value !== undefined,
			fields: [...chunk.fields].map(([key, children]) => [key, describeChunkLayout(children)]),
		};
	}
	if (chunk instanceof SequenceChunk) {
		return { sequence: describeChunkLayout(chunk.subChunks) };
	}
	return { other: chunk.constructor.name, topLevelLength: chunk.topLevelLength };
}

function describeShape(shape: TreeShape): unknown {
	return [
		shape.type,
		shape.hasValue,
		shape.fieldsArray.map(([key, child, length]) => [key, describeShape(child), length]),
	];
}
