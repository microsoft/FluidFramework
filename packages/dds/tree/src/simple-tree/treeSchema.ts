/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { getOrCreate } from "../util/index.js";

import {
	NodeKind,
	type Context,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports -- Used by TSDoc links.
	type StagedSchemaUpgradePolicy,
	type TreeNodeSchema,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used by TSDoc links.
	type TreeNodeSchemaInitializedData,
} from "./core/index.js";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used by TSDoc links.
import type { getUnhydratedContext } from "./createContext.js";
import {
	type FieldSchemaAlpha,
	type ImplicitFieldSchema,
	normalizeFieldSchema,
} from "./fieldSchema.js";
import type {
	SchemaType,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used by TSDoc links.
	SimpleAllowedTypeAttributes,
	SimpleAllowedTypes,
	SimpleFieldSchema,
	SimpleNodeSchema,
	SimpleTreeSchema,
} from "./simpleSchema.js";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used by TSDoc links.
import type { toStoredSchema, transformSimpleSchema } from "./toStoredSchema.js";
import { walkFieldSchema } from "./walkFieldSchema.js";

export function createTreeSchema(rootSchema: ImplicitFieldSchema): TreeSchema {
	const root = normalizeFieldSchema(rootSchema);
	const definitions = new Map<string, SimpleNodeSchema<SchemaType.View> & TreeNodeSchema>();

	walkFieldSchema(root, {
		node: (schema) => {
			if (definitions.has(schema.identifier)) {
				throw new UsageError(
					`Multiple schema encountered with the identifier ${JSON.stringify(schema.identifier)}. Remove or rename them to avoid the collision.`,
				);
			}
			definitions.set(
				schema.identifier,
				schema as SimpleNodeSchema<SchemaType.View> & TreeNodeSchema,
			);
		},
	});

	return { root, definitions };
}

/**
 * Data derived from one {@link ImplicitFieldSchema | root}, shared by {@link toStoredSchema} and {@link getUnhydratedContext}.
 */
export interface SchemaDerivedData {
	/**
	 * Complete, unfiltered view-schema graph produced by {@link createTreeSchema}.
	 * Retains schemas reachable only through staged references so {@link transformSimpleSchema} can apply any staged-upgrade policy.
	 */
	readonly treeSchema: TreeSchema;

	/**
	 * Whether the root field or any transitively reachable schema contains staging, as determined by {@link treeSchemaHasStagedSchema}.
	 * If `false`, {@link toStoredSchema} can share its result across all {@link (StagedSchemaUpgradePolicy:interface)} instances.
	 */
	readonly hasStagedSchema: boolean;

	/**
	 * Unhydrated context, populated by {@link getUnhydratedContext} only after construction succeeds.
	 * Also retained by {@link TreeNodeSchemaInitializedData.context} when this root is a node schema.
	 * Not populated by schema analysis or stored-schema generation, which must not initialize contexts.
	 */
	unhydratedContext?: Context;
}

/**
 * Caches {@link SchemaDerivedData} by root identity, preserving root field kind, annotations, and metadata.
 * @remarks
 * Analysis is completed before an entry is published; {@link getUnhydratedContext} fills its context slot separately.
 * Context creation can therefore call {@link toStoredSchema} without recursively initializing itself.
 *
 * Unlike the stored-schema cache in {@link toStoredSchema}, this cache does not depend on a {@link (StagedSchemaUpgradePolicy:interface)}.
 * Node-specific conversion handlers remain in {@link TreeNodeSchemaInitializedData}; roots here can also be fields or unions.
 */
const schemaDerivedDataCache = new WeakMap<ImplicitFieldSchema, SchemaDerivedData>();

/**
 * Builds or retrieves a root's completed analysis without initializing its {@link SchemaDerivedData.unhydratedContext}.
 * @remarks
 * Keeps the unfiltered graph for stored-schema conversion and unhydrated-context lookup maps.
 * As with {@link toStoredSchema} caching, schema definitions must remain unchanged after evaluation.
 *
 * Does not cache intermediate answers for descendants: a recursive back-edge can hide staging until the traversal completes.
 */
export function getSchemaDerivedData(root: ImplicitFieldSchema): SchemaDerivedData {
	return getOrCreate(schemaDerivedDataCache, root, () => {
		const treeSchema = createTreeSchema(root);
		return { treeSchema, hasStagedSchema: treeSchemaHasStagedSchema(treeSchema) };
	});
}

/**
 * Checks staging annotations in a complete, unfiltered graph produced by {@link createTreeSchema}.
 * @remarks
 * The graph already contains all reachable definitions, so this scan does not recurse or initialize node contexts.
 * When adding a staging mechanism, update this check and add an observable staged case to the test-schema catalog.
 */
function treeSchemaHasStagedSchema(schema: TreeSchema): boolean {
	/**
	 * Checks {@link SimpleAllowedTypeAttributes.isStaged} on allowed-type references, not on the referenced node definitions.
	 */
	function allowedTypesHaveStaging(types: SimpleAllowedTypes<SchemaType.View>): boolean {
		for (const attributes of types.values()) {
			if (attributes.isStaged !== false) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Includes {@link SimpleFieldSchema.isStagedOptional}, which is not represented by allowed-type annotations.
	 */
	function fieldHasStaging(field: SimpleFieldSchema<SchemaType.View>): boolean {
		return (
			(field.isStagedOptional !== undefined && field.isStagedOptional !== false) ||
			allowedTypesHaveStaging(field.simpleAllowedTypes)
		);
	}

	if (fieldHasStaging(schema.root)) {
		return true;
	}
	for (const node of schema.definitions.values()) {
		switch (node.kind) {
			case NodeKind.Leaf: {
				break;
			}
			case NodeKind.Array:
			case NodeKind.Map:
			case NodeKind.Record: {
				if (allowedTypesHaveStaging(node.simpleAllowedTypes)) {
					return true;
				}
				break;
			}
			case NodeKind.Object: {
				for (const field of node.fields.values()) {
					if (fieldHasStaging(field)) {
						return true;
					}
				}
				break;
			}
			default: {
				unreachableCase(node);
			}
		}
	}
	return false;
}

/**
 * {@link TreeViewConfigurationAlpha}
 * @sealed @alpha
 */
export interface TreeSchema extends SimpleTreeSchema<SchemaType.View> {
	readonly root: FieldSchemaAlpha;

	readonly definitions: ReadonlyMap<
		string,
		SimpleNodeSchema<SchemaType.View> & TreeNodeSchema
	>;
}
