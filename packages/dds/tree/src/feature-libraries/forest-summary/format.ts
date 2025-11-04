/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Static, Type } from "@sinclair/typebox";

import { Versioned } from "../../codec/index.js";
import { schemaFormatV1 } from "../../core/index.js";
import type { Brand } from "../../util/index.js";

/**
 * The format version for the forest.
 */
export const ForestFormatVersion = {
	v1: 1,
} as const;
export type ForestFormatVersion = Brand<
	(typeof ForestFormatVersion)[keyof typeof ForestFormatVersion],
	"ForestFormatVersion"
>;

export const Format = <TVersion extends ForestFormatVersion>(
	tVersion: TVersion = ForestFormatVersion.v1 as TVersion,
	// Return type is intentionally derived.
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
) =>
	Type.Object(
		{
			version: Type.Literal(tVersion),
			keys: Type.Array(schemaFormatV1.FieldKeySchema),
			fields: Versioned,
		},
		{ additionalProperties: false },
	);

export type Format = Static<ReturnType<typeof Format>>;
