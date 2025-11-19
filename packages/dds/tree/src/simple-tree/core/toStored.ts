/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { brand } from "../../util/index.js";
import type { SchemaUpgrade } from "./allowedTypes.js";
import type { TreeNodeSchemaIdentifier, TreeTypeSet } from "../../core/index.js";
import type { SimpleAllowedTypeAttributes, SimpleAllowedTypes } from "../simpleSchema.js";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

/**
 * Options for generating a {@link TreeStoredSchema} from view schema.
 */
export interface StoredFromViewSchemaGenerationOptions {
	/**
	 * Determines whether to include staged schema in the resulting stored schema.
	 * @remarks
	 * Due to caching, the behavior of this function must be pure.
	 */
	includeStaged(upgrade: SchemaUpgrade): boolean;
}

/**
 * Marker type indicating that the input schema is already a stored schema.
 */
export const ExpectStored = Symbol("ExpectStored");
export type ExpectStored = typeof ExpectStored;

export type StoredSchemaGenerationOptions =
	| StoredFromViewSchemaGenerationOptions
	| ExpectStored;

/**
 * Filters an allowed type based on the provided options.
 * @param allowedType - The allowed type to filter.
 * @param options - The options to use for filtering.
 * @returns Whether the allowed type passes the filter.
 */
export function allowedTypeFilter(
	data: SimpleAllowedTypeAttributes,
	options: StoredSchemaGenerationOptions,
): boolean {
	if (options === ExpectStored) {
		if (data.isStaged !== undefined) {
			throw new UsageError(
				"Failed to covert view schema to stored schema. The simple schema provided was indicated to be a stored schema by the use of `ExpectStored`, but view schema specific content was encountered which requires a `StoredFromViewSchemaGenerationOptions` to process.",
			);
		}
		return true;
	}

	if (data.isStaged === undefined) {
		throw new UsageError(
			"Failed to covert view schema to stored schema. The simple schema provided as the view schema was actually a stored schema. If this was intended, use `ExpectStored` for the `StoredSchemaGenerationOptions` to indicate the input is already a stored schema and only a format conversion is required.",
		);
	}

	// If the allowed type is staged, only include it if the options allow it.
	if (data.isStaged === false) {
		return true;
	}

	return options.includeStaged(data.isStaged);
}

/**
 * Converts a {@link SimpleAllowedTypes} to a stored schema.
 * @param schema - The schema to convert.
 * @param options - The options to use for filtering.
 * @returns The converted stored schema.
 */
export function convertAllowedTypes(
	schema: SimpleAllowedTypes,
	options: StoredSchemaGenerationOptions,
): TreeTypeSet {
	const filtered: TreeNodeSchemaIdentifier[] = [];
	for (const [type, data] of schema) {
		if (allowedTypeFilter(data, options)) {
			filtered.push(brand<TreeNodeSchemaIdentifier>(type));
		}
	}
	return new Set(filtered);
}
