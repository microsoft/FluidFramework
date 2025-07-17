/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { defaultSchemaPolicy } from "../feature-libraries/index.js";
import { getOrCreate } from "../util/index.js";

import {
	Context,
	getTreeNodeSchemaPrivateData,
	normalizeAnnotatedAllowedTypes,
	UnhydratedContext,
	type TreeNodeSchema,
	type TreeNodeSchemaInitializedData,
} from "./core/index.js";
import { normalizeFieldSchema, type ImplicitFieldSchema } from "./fieldSchema.js";
import { toStoredSchema } from "./toStoredSchema.js";

const contextCache: WeakMap<ImplicitFieldSchema, Context> = new WeakMap();

/**
 * Utility for creating {@link Context}s for unhydrated nodes.
 */
export function getUnhydratedContext(schema: ImplicitFieldSchema): Context {
	return getOrCreate(contextCache, schema, (s) => {
		const normalized = normalizeFieldSchema(schema);

		const flexContext = new UnhydratedContext(defaultSchemaPolicy, toStoredSchema(schema));
		return new Context(normalized.annotatedAllowedTypesNormalized, flexContext);
	});
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
		childAnnotatedAllowedTypes: data.childAnnotatedAllowedTypes.map(
			normalizeAnnotatedAllowedTypes,
		),
	};
}
