/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, Type } from "@sinclair/typebox";
import { brandedStringType } from "../util";
import { FieldKey } from "../core";
import { EncodedChunk } from "./chunked-forest";

export const version = 1.0;

// Define the FieldKey type, assuming it's a string
const FieldKeyType = brandedStringType<FieldKey>();

// Define the type for an array of tuples [FieldKey, EncodedChunk]
export const FieldKeyEncodedChunkArray = Type.Array(Type.Tuple([FieldKeyType, EncodedChunk]));

export const Format = Type.Object(
	{
		version: Type.Literal(version),
		data: FieldKeyEncodedChunkArray,
	},
	{ additionalProperties: false },
);

export type Format = Static<typeof Format>;

export const Versioned = Type.Object({
	version: Type.Number(),
});
export type Versioned = Static<typeof Versioned>;
