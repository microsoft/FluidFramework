/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, Type } from "@sinclair/typebox";
import { brandedNumberType } from "../../util";
import { ForestRootId } from "./detachedFieldIndex";

export const version = 1.0;

// Define the Major and Minor types:
const MajorSchema = Type.Union([Type.String(), Type.Number(), Type.Undefined()]);
const MinorSchema = Type.Number();

const ForestRootIdSchema = brandedNumberType<ForestRootId>();

// Define the tuple:
const TupleSchema = Type.Tuple([MajorSchema, MinorSchema, ForestRootIdSchema]);

export const Format = Type.Object(
	{
		version: Type.Literal(version),
		data: Type.Array(TupleSchema),
		maxId: ForestRootIdSchema,
	},
	{ additionalProperties: false },
);

export type Format = Static<typeof Format>;

export const Versioned = Type.Object({
	version: Type.Number(),
});
export type Versioned = Static<typeof Versioned>;
