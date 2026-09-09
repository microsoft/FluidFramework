/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Type from "@sinclair/typebox";
import type { ObjectOptions, Static } from "@sinclair/typebox";

import { SchemaFormatVersion, schemaFormatV2 } from "../../core/index.js";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

/**
 * Experimental stored schema format which adds application-defined schema versions.
 */
export const Format = Type.Object(
	{
		version: Type.Literal(SchemaFormatVersion.v3Experimental),
		nodes: Type.Record(Type.String(), schemaFormatV2.TreeNodeSchemaDataFormat),
		root: schemaFormatV2.FieldSchemaFormat,
		schemaVersion: Type.Array(Type.Tuple([Type.String(), Type.Integer({ minimum: 0 })])),
	},
	noAdditionalProps,
);
export type Format = Static<typeof Format>;
