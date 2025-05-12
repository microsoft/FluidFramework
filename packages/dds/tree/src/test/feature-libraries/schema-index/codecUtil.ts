/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidClientVersion } from "../../../codec/index.js";
import {
	makeSchemaCodecs,
	SchemaCodecVersion,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/schema-index/index.js";
import { ajvValidator } from "../../codec/index.js";

/*
 * The list of supported schema write versions. Used in tests that cover multiple schema versions.
 */
export const supportedSchemaFormats = Array.from(
	makeSchemaCodecs({ jsonValidator: ajvValidator }).getSupportedFormats(),
).filter((format) => format !== undefined) as SchemaCodecVersion[];

/**
 * Convert a schema version to the minimum Fluid client version supporting that format.
 * @param schemaFormat - The schema format version.
 * @returns The Fluid client version that supports the provided schema format.
 */
export function schemaFormatToClientVersion(
	schemaFormat: SchemaCodecVersion,
): FluidClientVersion {
	switch (schemaFormat) {
		case SchemaCodecVersion.v1:
			return FluidClientVersion.v2_0;
		case SchemaCodecVersion.v2:
			return FluidClientVersion.v2_4;
		default:
			throw new Error(`Unsupported schema format: ${schemaFormat}`);
	}
}
