/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "@fluidframework/id-compressor";
import { type ObjectOptions, type TSchema, Array as _typebox_Array, Literal as _typebox_Literal, Object as _typebox_Object, Optional as _typebox_Optional } from "@sinclair/typebox";
const Type = { Array: _typebox_Array, Literal: _typebox_Literal, Object: _typebox_Object, Optional: _typebox_Optional };

import { SessionIdSchema } from "../core/index.js";

import { EncodedSharedBranch, EditManagerFormatVersion } from "./editManagerFormatCommons.js";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

// Many of the return types in this module are intentionally derived, rather than explicitly specified.
/* eslint-disable @typescript-eslint/explicit-function-return-type */

export interface EncodedEditManager<TChangeset> {
	readonly version: typeof EditManagerFormatVersion.vSharedBranches;
	readonly originator: SessionId;
	readonly main: EncodedSharedBranch<TChangeset>;
	readonly branches?: readonly EncodedSharedBranch<TChangeset>[];
}

export const EncodedEditManager = <ChangeSchema extends TSchema>(tChange: ChangeSchema) =>
	Type.Object(
		{
			version: Type.Literal(EditManagerFormatVersion.vSharedBranches),
			originator: SessionIdSchema,
			main: EncodedSharedBranch(tChange),
			branches: Type.Optional(Type.Array(EncodedSharedBranch(tChange))),
		},
		noAdditionalProps,
	);

/* eslint-enable @typescript-eslint/explicit-function-return-type */
