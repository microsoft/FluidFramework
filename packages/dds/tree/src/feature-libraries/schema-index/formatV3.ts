/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Type from "typebox/type";
import type { TObjectOptions, Static } from "typebox";

import { SchemaFormatVersion, schemaFormatV2 } from "../../core/index.js";
import { stringKeyRecord } from "../../util/index.js";

const noAdditionalProps: TObjectOptions = { additionalProperties: false };

/**
 * Defines an experimental stored schema format with application-defined versions.
 */
export const Format = Type.Object(
	{
		version: Type.Literal(SchemaFormatVersion.v3Experimental),
		nodes: stringKeyRecord(schemaFormatV2.TreeNodeSchemaDataFormat),
		root: schemaFormatV2.FieldSchemaFormat,
		schemaVersion: Type.Optional(
			Type.Array(Type.Tuple([Type.String(), Type.Integer({ minimum: 0 })])),
		),
	},
	noAdditionalProps,
);
export type Format = Static<typeof Format>;
