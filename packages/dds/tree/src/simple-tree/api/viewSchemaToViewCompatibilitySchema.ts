/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { SimpleNodeSchema, SimpleTreeSchema } from "../simpleSchema.js";
import type { TreeSchema } from "./configuration.js";
import { LeafNodeSchema } from "../leafNodeSchema.js";
import {
	ArrayNodeSchema,
	MapNodeSchema,
	ObjectNodeSchema,
	RecordNodeSchema,
} from "../node-kinds/index.js";
import { copySimpleNodeSchema, SimpleSchemaCopyMode } from "./viewSchemaToSimpleSchema.js";

/**
 * Convert a stored schema to a SimpleSchema and preserve information needed for compatibility testing.
 *
 * @remarks This method always copies the schema objects to plain JavaScript objects.
 * @param schema - The stored schema to convert.
 * @returns The converted SimpleTreeSchema.
 *
 * @alpha
 */
export function toViewCompatibilityTreeSchema(schema: TreeSchema): SimpleTreeSchema {
	const definitions = new Map<string, SimpleNodeSchema>();

	// Walk the node definitions and convert them one by one. Recurse into fields used in compatibility checks.
	for (const nodeSchema of schema.definitions.values()) {
		// TODO: Move this assert to a common location so it can be used from both SimpleSchema builders.
		// The set of node kinds is extensible, but the typing of SimpleNodeSchema is not, so we need to check that the schema is one of the known kinds.
		assert(
			nodeSchema instanceof ArrayNodeSchema ||
				nodeSchema instanceof MapNodeSchema ||
				nodeSchema instanceof LeafNodeSchema ||
				nodeSchema instanceof ObjectNodeSchema ||
				nodeSchema instanceof RecordNodeSchema,
			// TODO: New error code.
			0xb60 /* Invalid schema */,
		);

		// Read properties that are needed for compatibility and copy them to a SimpleNodeSchema.
		const simpleNodeSchema = copySimpleNodeSchema(
			nodeSchema,
			true,
			SimpleSchemaCopyMode.ViewCompatibilitySchema,
		);
		definitions.set(nodeSchema.identifier, simpleNodeSchema);
	}

	return {
		root: {
			kind: schema.root.kind,
			simpleAllowedTypes: schema.root.simpleAllowedTypes,
			// Don't include metadata or persistedMetadata in view compatibility schema.
			metadata: {},
			persistedMetadata: undefined,
		},
		definitions,
	};
}
