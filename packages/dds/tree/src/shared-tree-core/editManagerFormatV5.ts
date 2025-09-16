/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ObjectOptions, type TSchema, Type } from "@sinclair/typebox";

import { EncodedSharedBranch } from "./editManagerFormatCommons.js";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

// Many of the return types in this module are intentionally derived, rather than explicitly specified.
/* eslint-disable @typescript-eslint/explicit-function-return-type */

export interface EncodedEditManager<TChangeset> {
	readonly version: 5;
	readonly main: EncodedSharedBranch<TChangeset>;
	readonly branches?: readonly EncodedSharedBranch<TChangeset>[];
}

export const EncodedEditManager = <ChangeSchema extends TSchema>(tChange: ChangeSchema) =>
	Type.Object(
		{
			version: Type.Union([Type.Literal(5)]),
			main: EncodedSharedBranch(tChange),
			branches: Type.Optional(Type.Array(EncodedSharedBranch(tChange))),
		},
		noAdditionalProps,
	);

/* eslint-enable @typescript-eslint/explicit-function-return-type */
