/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { brand } from "../../util";
import {
	FieldKindIdentifier,
	TreeFieldStoredSchema,
	TreeNodeStoredSchema,
	TreeNodeSchemaIdentifier,
	ValueSchema,
} from "./schema";

/**
 * APIs to help build schema.
 *
 * See typedSchema.ts for a wrapper for these APIs that captures the types as TypeScript types
 * in addition to runtime data.
 */

/**
 * Empty readonly set.
 */
export const emptySet: ReadonlySet<never> = new Set();

/**
 * Empty readonly map.
 */
export const emptyMap: ReadonlyMap<never, never> = new Map<never, never>();

/**
 * Helper for building {@link TreeFieldStoredSchema}.
 * @alpha
 */
export function fieldSchema(
	kind: { identifier: FieldKindIdentifier },
	types?: Iterable<TreeNodeSchemaIdentifier>,
): TreeFieldStoredSchema {
	return {
		kind,
		types: types === undefined ? undefined : new Set(types),
	};
}

/**
 * See {@link TreeNodeStoredSchema} for details.
 */
export interface TreeSchemaBuilder {
	readonly objectNodeFields?: { [key: string]: TreeFieldStoredSchema };
	readonly mapFields?: TreeFieldStoredSchema;
	readonly leafValue?: ValueSchema;
}

/**
 * Helper for building {@link TreeNodeStoredSchema}.
 */
export function treeSchema(data: TreeSchemaBuilder): TreeNodeStoredSchema {
	const objectNodeFields = new Map();
	const fields = data.objectNodeFields ?? {};
	// eslint-disable-next-line no-restricted-syntax
	for (const key in fields) {
		if (Object.prototype.hasOwnProperty.call(fields, key)) {
			objectNodeFields.set(brand(key), fields[key]);
		}
	}

	return {
		objectNodeFields,
		mapFields: data.mapFields,
		leafValue: data.leafValue,
	};
}
