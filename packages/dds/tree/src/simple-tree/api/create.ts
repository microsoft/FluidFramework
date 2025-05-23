/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";

import type { ITreeCursorSynchronous, SchemaAndPolicy } from "../../core/index.js";
import type { ImplicitFieldSchema, TreeFieldFromImplicitField } from "../schemaTypes.js";
import type { Unhydrated } from "../core/index.js";
import {
	defaultSchemaPolicy,
	inSchemaOrThrow,
	mapTreeFromCursor,
	isFieldInSchema,
} from "../../feature-libraries/index.js";
import { getUnhydratedContext } from "../createContext.js";
import { createUnknownOptionalFieldPolicy } from "../node-kinds/index.js";

/**
 * Creates an unhydrated simple-tree field from a cursor in nodes mode.
 */
export function createFromCursor<const TSchema extends ImplicitFieldSchema>(
	schema: TSchema,
	cursor: ITreeCursorSynchronous | undefined,
): Unhydrated<TreeFieldFromImplicitField<TSchema>> {
	const mapTrees = cursor === undefined ? [] : [mapTreeFromCursor(cursor)];
	const context = getUnhydratedContext(schema);
	const flexSchema = context.flexContext.schema;

	const schemaValidationPolicy: SchemaAndPolicy = {
		policy: {
			...defaultSchemaPolicy,
			allowUnknownOptionalFields: createUnknownOptionalFieldPolicy(schema),
		},
		schema: context.flexContext.schema,
	};

	const maybeError = isFieldInSchema(
		mapTrees,
		flexSchema.rootFieldSchema,
		schemaValidationPolicy,
	);
	inSchemaOrThrow(maybeError);

	if (mapTrees.length === 0) {
		return undefined as Unhydrated<TreeFieldFromImplicitField<TSchema>>;
	}
	assert(mapTrees.length === 1, 0xa11 /* unexpected field length */);
	// Length asserted above, so this is safe. This assert is done instead of checking for undefined after indexing to ensure a length greater than 1 also errors.
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const _mapTree = mapTrees[0]!;

	return fail("TODO");
}
