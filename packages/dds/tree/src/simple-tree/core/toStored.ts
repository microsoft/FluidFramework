/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { brand } from "../../util/index.js";
import {
	normalizeAndEvaluateAnnotatedAllowedTypes,
	type AnnotatedAllowedType,
	type ImplicitAllowedTypes,
	type SchemaUpgrade,
} from "./allowedTypes.js";
import type { TreeNodeSchemaIdentifier, TreeTypeSet } from "../../core/index.js";

/**
 * Options for generating a {@link TreeStoredSchema} from view schema.
 */
export interface StoredSchemaGenerationOptions {
	/**
	 * Determines whether to include staged schema in the resulting stored schema.
	 * @remarks
	 * Due to caching, the behavior of this function must be pure.
	 */
	includeStaged(upgrade: SchemaUpgrade): boolean;
}

/**
 * Filters an allowed type based on the provided options.
 * @param allowedType - The allowed type to filter.
 * @param options - The options to use for filtering.
 * @returns Whether the allowed type passes the filter.
 */
export function allowedTypeFilter(
	allowedType: AnnotatedAllowedType,
	options: StoredSchemaGenerationOptions,
): boolean {
	// If the allowed type is staged, only include it if the options allow it.
	if (allowedType.metadata.stagedSchemaUpgrade !== undefined) {
		return options.includeStaged(allowedType.metadata.stagedSchemaUpgrade);
	}
	return true;
}

/**
 * Converts an ImplicitAllowedTypes to a stored schema.
 * @param schema - The schema to convert.
 * @param options - The options to use for filtering.
 * @returns The converted stored schema.
 */
export function convertAllowedTypes(
	schema: ImplicitAllowedTypes,
	options: StoredSchemaGenerationOptions,
): TreeTypeSet {
	const filtered: TreeNodeSchemaIdentifier[] = normalizeAndEvaluateAnnotatedAllowedTypes(
		schema,
	)
		.types.filter((allowedType) => allowedTypeFilter(allowedType, options))
		.map((a) => brand(a.type.identifier));
	return new Set(filtered);
}
