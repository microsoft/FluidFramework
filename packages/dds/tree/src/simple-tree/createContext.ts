/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { defaultSchemaPolicy } from "../feature-libraries/index.js";
import { getOrCreate } from "../util/index.js";

import {
	Context,
	getTreeNodeSchemaPrivateData,
	UnhydratedContext,
	type TreeNodeSchema,
	type TreeNodeSchemaInitializedData,
} from "./core/index.js";
import { normalizeFieldSchema, type ImplicitFieldSchema } from "./fieldSchema.js";
import { toStoredSchema, toUnhydratedSchema } from "./toStoredSchema.js";

const contextCache: WeakMap<ImplicitFieldSchema, Context> = new WeakMap();

/**
 * See note in {@link getUnhydratedContext}.
 */
let getUnhydratedContextIsRunning = false;

/**
 * Utility for creating {@link Context}s for unhydrated nodes.
 * @remarks
 * The resulting context will not allow any unknown optional fields.
 */
export function getUnhydratedContext(schema: ImplicitFieldSchema): Context {
	// Due to caching, calling this reentrantly can cause issues.
	// Due to recursive schema, and generally lots of lazy initialization code depending on this, bugs with this going reentrant are not uncommon.
	// To make debugging such cases much easier, we assert that this is not called reentrantly.
	assert(!getUnhydratedContextIsRunning, "getUnhydratedContext should not be reentrant");
	getUnhydratedContextIsRunning = true;
	try {
		return getOrCreate(contextCache, schema, (s) => {
			const normalized = normalizeFieldSchema(schema);

			const flexContext = new UnhydratedContext(
				defaultSchemaPolicy,
				toStoredSchema(schema, toUnhydratedSchema),
			);
			return new Context(
				flexContext,
				Context.schemaMapFromRootSchema(normalized.allowedTypesFull.evaluate()),
			);
		});
	} finally {
		getUnhydratedContextIsRunning = false;
	}
}

/**
 * Utility for creating {@link TreeNodeSchemaInitializedData}.
 */
export function getTreeNodeSchemaInitializedData(
	schema: TreeNodeSchema,
	handler: Pick<TreeNodeSchemaInitializedData, "toFlexContent" | "shallowCompatibilityTest">,
): TreeNodeSchemaInitializedData {
	const data = getTreeNodeSchemaPrivateData(schema);
	return {
		...handler,
		context: getUnhydratedContext(schema),
		childAllowedTypes: data.childAllowedTypes.map((t) => t.evaluate()),
	};
}
