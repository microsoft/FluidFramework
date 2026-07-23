/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Static } from "@sinclair/typebox";

import { strictEnum, type Values } from "../../../../util/index.js";

import { EncodedFieldBatchGeneric } from "./formatGeneric.js";
import { EncodedChunkShapeV1 } from "./formatV1.js";
import { EncodedChunkShapeV2 } from "./formatV2.js";
import { EncodedChunkShapeVTextExperimental } from "./formatVText.js";

/**
 * The format version for the field batch.
 */
export type FieldBatchFormatVersion = Values<typeof FieldBatchFormatVersion>;
export const FieldBatchFormatVersion = strictEnum("FieldBatchFormatVersion", {
	/**
	 * Initial version.
	 * @remarks
	 * For simplicity of implementation the format for this version allows the same chunk shapes as v2, but must not use {@link EncodedIncrementalChunkShape}
	 * as older clients will not know how to handle that shape but think they can handle this format.
	 */
	v1: 1,
	/**
	 * Adds support for incremental encoding of chunks.
	 * @remarks
	 * {@link EncodedIncrementalChunkShape} was added in this version.
	 */
	v2: 2,
	/**
	 * Experimental codec with optimizations for text.
	 * @remarks
	 * Uses a non-numeric ("text") version on purpose: this format is still experimental and must
	 * not claim a permanent numbered slot until it is finalized (a numbered version must be
	 * supported/loadable forever and never tweaked).
	 */
	vTextExperimental: "text",
});

/**
 * Whether the given format version supports incremental chunk encoding.
 *
 * @remarks
 * This helper should be used for comparison since experimental versions
 * can be a string.
 */
export function supportsIncrementalEncoding(version: FieldBatchFormatVersion): boolean {
	if (version === FieldBatchFormatVersion.v1) {
		return false;
	}

	return true;
}

/**
 * Encoded {@link FieldBatch} using V1 format.
 * @remarks
 * Does not support {@link EncodedIncrementalChunkShape}.
 */
export type EncodedFieldBatchV1 = Static<typeof EncodedFieldBatchV1>;
export const EncodedFieldBatchV1 = EncodedFieldBatchGeneric(
	FieldBatchFormatVersion.v1,
	EncodedChunkShapeV1,
);

/**
 * Encoded {@link FieldBatch} using V2 format.
 * @remarks
 * Adds support for {@link EncodedIncrementalChunkShape}.
 */
export type EncodedFieldBatchV2 = Static<typeof EncodedFieldBatchV2>;
export const EncodedFieldBatchV2 = EncodedFieldBatchGeneric(
	FieldBatchFormatVersion.v2,
	EncodedChunkShapeV2,
);

/**
 * Encoded {@link FieldBatch} using the experimental text optimized format.
 */
export type EncodedFieldBatchVTextExperimental = Static<
	typeof EncodedFieldBatchVTextExperimental
>;
export const EncodedFieldBatchVTextExperimental = EncodedFieldBatchGeneric(
	FieldBatchFormatVersion.vTextExperimental,
	EncodedChunkShapeVTextExperimental,
);

/**
 * Encoded {@link FieldBatch}, which might use V2 features, but might also have been from a V1 encoder.
 * @remarks
 * Type wise, equivalent to V2, as that is a superset of V1.
 * Used instead of just V2 for clarity.
 */
export type EncodedFieldBatchV1OrV2 = EncodedFieldBatchV1 | EncodedFieldBatchV2;

/**
 * Encoded data, compatible with both V1 and V2 formats.
 * @remarks
 * This is the intersection of the two versions, which is possible because V2 is a non-breaking extension of V1.
 * This type can be used when the code is compatible with both versions and does not need to distinguish between them.
 *
 * Type wise, equivalent to V1, as that is a subset of V2.
 * Used instead of just V1 for clarity.
 */
export type EncodedFieldBatchV1AndV2 = EncodedFieldBatchV1 & EncodedFieldBatchV2;

/**
 * An encoded chunk shape from any known {@link FieldBatchFormatVersion}.
 *
 * @remarks
 * Use this when working with chunk shapes uniformly across versions — for example, in the
 * shared decoder dispatcher and in encoder shape base classes. New format versions should
 * add their chunk shape variant to this union.
 */
export type EncodedChunkShape =
	| EncodedChunkShapeV1
	| EncodedChunkShapeV2
	| EncodedChunkShapeVTextExperimental;
