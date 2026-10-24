/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { defaultSchemaPolicy } from "../feature-libraries/index.js";

import {
	Context,
	getTreeNodeSchemaPrivateData,
	UnhydratedContext,
	type TreeNodeSchema,
	type TreeNodeSchemaInitializedData,
} from "./core/index.js";
import type { ImplicitFieldSchema } from "./fieldSchema.js";
import { toStoredSchema, toUnhydratedSchema } from "./toStoredSchema.js";
import { getSchemaDerivedData } from "./treeSchema.js";

/**
 * See note in {@link getUnhydratedContext}.
 */
let getUnhydratedContextIsRunning = false;

/**
 * Utility for creating {@link Context}s for unhydrated nodes.
 * @remarks
 * The resulting context will not allow any unknown optional fields.
 * {@link getSchemaDerivedData} owns the shared root cache; this function fills its context slot only after construction succeeds.
 * The cached graph supplies the context's node lookup map without another traversal or map copy.
 * Contexts remain root-specific even when their immutable schema lookup maps are shared.
 *
 * {@link toStoredSchema} uses the same analysis but a separate policy-specific result cache.
 * Analysis must not initialize contexts because context construction calls stored-schema generation.
 */
export function getUnhydratedContext(schema: ImplicitFieldSchema): Context {
	// Due to caching, calling this reentrantly can cause issues.
	// Due to recursive schema, and generally lots of lazy initialization code depending on this, bugs with this going reentrant are not uncommon.
	// To make debugging such cases much easier, we assert that this is not called reentrantly.
	assert(
		!getUnhydratedContextIsRunning,
		0xca7 /* getUnhydratedContext should not be reentrant */,
	);
	getUnhydratedContextIsRunning = true;
	try {
		const data = getSchemaDerivedData(schema);
		if (data.unhydratedContext === undefined) {
			const flexContext = new UnhydratedContext(
				defaultSchemaPolicy,
				toStoredSchema(schema, toUnhydratedSchema),
			);
			data.unhydratedContext = new Context(flexContext, data.treeSchema.definitions);
		}
		return data.unhydratedContext;
	} finally {
		getUnhydratedContextIsRunning = false;
	}
}

/**
 * Utility for creating {@link TreeNodeSchemaInitializedData}.
 * @remarks
 * Node-specific conversion handlers and evaluated child types belong to this initialization data.
 * Its context is shared through {@link getUnhydratedContext} and {@link getSchemaDerivedData}, which also support field and union roots.
 * Stored-schema generation can access root analysis without invoking node initialization.
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
