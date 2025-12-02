import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { TreeNodeSchema } from "./core/index.js";
import {
	type FieldSchemaAlpha,
	type ImplicitFieldSchema,
	normalizeFieldSchema,
} from "./fieldSchema.js";
import type { SimpleNodeSchema, SimpleTreeSchema } from "./simpleSchema.js";
import { walkFieldSchema } from "./walkFieldSchema.js";

export function createTreeSchema(rootSchema: ImplicitFieldSchema): TreeSchema {
	const root = normalizeFieldSchema(rootSchema);
	const definitions = new Map<string, SimpleNodeSchema & TreeNodeSchema>();

	walkFieldSchema(root, {
		node: (schema) => {
			if (definitions.has(schema.identifier)) {
				throw new UsageError(
					`Multiple schema found with identifier: ${JSON.stringify(schema.identifier)}`,
				);
			}
			definitions.set(schema.identifier, schema as SimpleNodeSchema & TreeNodeSchema);
		},
	});

	return { root, definitions };
}

/**
 * {@link TreeViewConfigurationAlpha}
 * @sealed @alpha
 */
export interface TreeSchema extends SimpleTreeSchema {
	/**
	 * {@inheritDoc SimpleTreeSchema.root}
	 */
	readonly root: FieldSchemaAlpha;

	/**
	 * {@inheritDoc SimpleTreeSchema.definitions}
	 */
	readonly definitions: ReadonlyMap<string, SimpleNodeSchema & TreeNodeSchema>;
}
