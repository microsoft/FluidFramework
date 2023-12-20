/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, Type } from "@sinclair/typebox";
import { brandedNumberType } from "../../util";
import { RevisionTagSchema, SessionIdSchema } from "../rebase";
import { ForestRootId } from "./detachedFieldIndex";

export const version = 1.0;

// Define the Major and Minor types:
const MinorSchema = Type.Number();

const ForestRootIdSchema = brandedNumberType<ForestRootId>();

// Define the tuple:
const TupleSchema = Type.Tuple([
	RevisionTagSchema,
	MinorSchema,
	ForestRootIdSchema,
	SessionIdSchema,
]);

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
