/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Static, Literal as _typebox_Literal, Object as _typebox_Object, Optional as _typebox_Optional } from "@sinclair/typebox";
const Type = { Literal: _typebox_Literal, Object: _typebox_Object, Optional: _typebox_Optional };

import { unionOptions } from "../../../../codec/index.js";

import { shapesV1 } from "./formatV1.js";

/**
 * Encoded content is a {@link ChunkReferenceId}.
 * This represents the shape of a chunk that is encoded separately and is referenced by its {@link ChunkReferenceId}.
 */
export type EncodedIncrementalChunkShape = Static<typeof EncodedIncrementalChunkShape>;
export const EncodedIncrementalChunkShape = Type.Literal(0);

/**
 * The chunk shapes supported by the V2 format.
 * @remarks
 * See {@link EncodedChunkShapeV2}.
 */
export const shapesV2 = {
	...shapesV1,
	e: Type.Optional(EncodedIncrementalChunkShape),
} as const;

/**
 * V2 extension of {@link EncodedChunkShapeV1}.
 * @remarks
 * See {@link DiscriminatedUnionDispatcher} for more information on this pattern.
 */
export type EncodedChunkShapeV2 = Static<typeof EncodedChunkShapeV2>;
export const EncodedChunkShapeV2 = Type.Object(shapesV2, unionOptions);
