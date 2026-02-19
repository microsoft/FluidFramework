/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeNodeSchema } from "@fluidframework/tree";
import { walkFieldSchema } from "@fluidframework/tree/internal";
import type { ImplicitFieldSchema, SimpleTreeSchema } from "@fluidframework/tree/internal";

import type { BindableSchema } from "./methodBinding.js";
import { getExposedMethods, isBindableSchema } from "./methodBinding.js";
import { getExposedProperties } from "./propertyBinding.js";
import {
	renderSchemaTypeScript,
	type SchemaTypeScriptRenderResult,
} from "./renderSchemaTypeScript.js";
import { getOrCreate } from "./utils.js";

const promptSchemaCache = new WeakMap<SimpleTreeSchema, SchemaTypeScriptRenderResult>();

/**
 * Generates TypeScript declarations for the schemas reachable from the provided root field schema.
 */
export function generateEditTypesForPrompt(
	rootSchema: ImplicitFieldSchema,
	schema: SimpleTreeSchema,
): SchemaTypeScriptRenderResult {
	return getOrCreate(promptSchemaCache, schema, () =>
		buildPromptSchemaDescription(rootSchema),
	);
}

function buildPromptSchemaDescription(
	rootSchema: ImplicitFieldSchema,
): SchemaTypeScriptRenderResult {
	const bindableSchemas = new Map<string, BindableSchema>();
	const allSchemas = new Set<TreeNodeSchema>();

	walkFieldSchema(
		rootSchema,
		{
			node: (node) => {
				if (isBindableSchema(node)) {
					bindableSchemas.set(node.identifier, node);

					const exposedMethods = getExposedMethods(node);
					for (const referenced of exposedMethods.referencedTypes) {
						if (isBindableSchema(referenced)) {
							bindableSchemas.set(referenced.identifier, referenced);
						}
					}

					const exposedProperties = getExposedProperties(node);
					for (const referenced of exposedProperties.referencedTypes) {
						if (isBindableSchema(referenced)) {
							bindableSchemas.set(referenced.identifier, referenced);
						}
					}
				}
			},
		},
		allSchemas,
	);

	return renderSchemaTypeScript(allSchemas, bindableSchemas);
}
