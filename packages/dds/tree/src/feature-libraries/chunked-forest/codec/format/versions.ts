/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Static } from "typebox";

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
	 * Adds {@link EncodedSpecializedNodeShape} to the shapes of v2.
	 */
	vTextExperimental: "text",
});

/**
 * Whether the given format version supports incremental chunk encoding.
 *
 * @remarks
 * This helper should be used for comparison since experimental versions
 * can be a string.
 *
 * Formats in this encoding family are additive: each later format, including experimental ones,
 * keeps every shape of the formats before it.
 * Listing only the formats that predate {@link EncodedIncrementalChunkShape} is enough,
 * and new formats do not need to be added here.
 */
export function supportsIncrementalEncoding(version: FieldBatchFormatVersion): boolean {
	if (version === FieldBatchFormatVersion.v1) {
		return false;
	}

	return true;
}

/**
 * Whether the given format version supports the {@link EncodedSpecializedNodeShape} (`f`) shape.
 *
 * @remarks
 * This helper should be used for comparison since experimental versions
 * can be a string.
 *
 * Formats in this encoding family are additive: each later format, including experimental ones,
 * keeps every shape of the formats before it.
 * Listing only the formats that predate {@link EncodedSpecializedNodeShape} is enough,
 * and new formats do not need to be added here.
 */
export function supportsSpecializedNodeShapes(version: FieldBatchFormatVersion): boolean {
	if (version === FieldBatchFormatVersion.v1 || version === FieldBatchFormatVersion.v2) {
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
 * Encoded {@link FieldBatch} in any supported {@link FieldBatchFormatVersion}.
 * @remarks
 * Currently we use the same code-paths to decode all supported versions. To accomplish
 * that, they accept this type. When adding a new format, if continuing this pattern,
 * add the batch type to this union. If the format diverges sufficiently that this approach
 * no longer makes sense, rename this type accordingly, and set up new code paths for
 * handling the new format.
 */
export type EncodedFieldBatchAnyVersion =
	| EncodedFieldBatchV1
	| EncodedFieldBatchV2
	| EncodedFieldBatchVTextExperimental;

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
