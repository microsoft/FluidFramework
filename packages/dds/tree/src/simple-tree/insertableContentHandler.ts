/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { FieldKey } from "../core/index.js";
import { FieldKinds } from "../feature-libraries/index.js";
import { brand } from "../util/index.js";

import {
	createField,
	type UnhydratedFlexTreeField,
	unannotateImplicitAllowedTypes,
	normalizeAllowedTypes,
	type FlexContent,
} from "./core/index.js";
import { getUnhydratedContext } from "./createContext.js";

import type { MapNodeSchema, RecordNodeSchema } from "./node-kinds/index.js";
import {
	unhydratedFlexTreeFromInsertableNode,
	type InsertableContent,
} from "./unhydratedFlexTreeFromInsertable.js";

/**
 * Converts record-like data to a FlexContent representation for map/record schema.
 */
export function recordLikeDataToFlexContent(
	fieldsIterator: Iterable<readonly [string, InsertableContent]>,
	schema: MapNodeSchema | RecordNodeSchema,
): FlexContent {
	const allowedChildTypes = normalizeAllowedTypes(unannotateImplicitAllowedTypes(schema.info));
	const context = getUnhydratedContext(schema).flexContext;

	const transformedFields = new Map<FieldKey, UnhydratedFlexTreeField>();
	for (const item of fieldsIterator) {
		const [key, value] = item;
		assert(!transformedFields.has(brand(key)), 0x84c /* Keys should not be duplicated */);

		// Omit undefined values - an entry with an undefined value is equivalent to one that has been removed or omitted
		if (value !== undefined) {
			const child = unhydratedFlexTreeFromInsertableNode(value, allowedChildTypes);
			const field = createField(context, FieldKinds.optional.identifier, brand(key), [child]);
			transformedFields.set(brand(key), field);
		}
	}

	return [
		{
			type: brand(schema.identifier),
		},
		transformedFields,
	];
}
