/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { rootFieldKey, type TreeFieldStoredSchema } from "../../core/index.js";
import { defaultSchemaPolicy, FieldKinds } from "../default-schema/index.js";
import { isFieldInSchema, throwOutOfSchema } from "../schemaChecker.js";

import type { ObjectForest } from "./objectForest.js";

/** Validate every root of the reference forest after an edit in expensive-debug mode. */
export function checkForestSchema(forest: ObjectForest): void {
	forest.breaker.run(() => {
		const { schema } = forest;
		if (schema !== undefined) {
			const roots = new Set([...forest.roots.fields.keys(), rootFieldKey]);
			for (const key of roots) {
				const documentRoot = forest.roots.fields.get(key) ?? [];
				const fieldSchema: TreeFieldStoredSchema =
					key === rootFieldKey
						? schema.rootFieldSchema
						: {
								// Detached fields can contain several nodes.
								kind: FieldKinds.sequence.identifier,
								types: new Set(documentRoot.map((node) => node.type)),
								persistedMetadata: undefined,
							};
				isFieldInSchema(
					documentRoot,
					fieldSchema,
					{ schema, policy: defaultSchemaPolicy },
					throwOutOfSchema,
				);
			}
		}
	});
}
