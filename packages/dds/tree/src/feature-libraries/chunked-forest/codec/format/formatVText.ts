/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Static, Type } from "@sinclair/typebox";

import { unionOptions } from "../../../../codec/index.js";

import { ShapeIndex } from "./formatGeneric.js";
import { EncodedFieldShape, EncodedValueShape } from "./formatV1.js";
import { shapesV2 } from "./formatV2.js";

/**
 * A node shape that derives from another node shape by overlaying property-level overrides.
 *
 * @remarks
 * Compresses runs of node shapes that differ only in a few properties: a base node shape
 * defines the structural skeleton, and the specialization narrows specific properties.
 *
 * For example, a base `FormatNode` with a variable-boolean `bold` field can be specialized
 * to a shape that pins `bold` to a constant `true` — every node decoded with the
 * specialization contributes zero stream tokens for `bold`.
 *
 * Merge rules: `type` is always inherited from the resolved base. `fields`, `value`, and
 * `extraFields` are inherited unless the specialization sets them as own properties — to
 * inherit, the property must be omitted; setting it explicitly (even to `false` or
 * `undefined`) is treated as an override.
 */
export type EncodedSpecializedNodeShape = Static<typeof EncodedSpecializedNodeShape>;
export const EncodedSpecializedNodeShape = Type.Object(
	{
		/**
		 * Index into the enclosing batch's shapes array of the shape this specializes.
		 * Must resolve to either an {@link EncodedNodeShape} or another
		 * `EncodedSpecializedNodeShape`; chains are followed transitively until a node shape
		 * is reached. This restriction is enforced at runtime, not by the schema.
		 */
		base: ShapeIndex,
		/**
		 * Field-level overrides applied to the resolved base's `fields`. Entries whose key
		 * matches a base field replace that field's shape index in place; entries with new
		 * keys are appended after all base fields, in the order given here. Base field order
		 * is preserved — this is the stream consumption order at decode time, so encoders
		 * must serialize per-field tokens in the merged order, not in this list's order.
		 */
		fields: Type.Optional(Type.Array(EncodedFieldShape)),
		/**
		 * If present, replaces the resolved base's value shape.
		 */
		value: Type.Optional(EncodedValueShape),
		/**
		 * If present, replaces the resolved base's extraFields shape.
		 */
		extraFields: Type.Optional(ShapeIndex),
	},
	{ additionalProperties: false },
);

/**
 * Experimental extension of {@link EncodedChunkShapeV2}.
 * @remarks
 * See {@link DiscriminatedUnionDispatcher} for more information on this pattern.
 */
export type EncodedChunkShapeVTextExperimental = Static<
	typeof EncodedChunkShapeVTextExperimental
>;
export const EncodedChunkShapeVTextExperimental = Type.Object(
	{
		...shapesV2,
		f: Type.Optional(EncodedSpecializedNodeShape),
	},
	unionOptions,
);
