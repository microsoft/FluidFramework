/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { getOrCreate } from "../util/index.js";

import {
	NodeKind,
	getTreeNodeSchemaPrivateData,
	type Context,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports -- Used by TSDoc links.
	type StagedSchemaUpgradePolicy,
	type TreeNodeSchema,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used by TSDoc links.
	type TreeNodeSchemaPrivateData,
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
 * Staging reachability is also cached per node in {@link TreeNodeSchemaPrivateData.hasStagedSchema},
 * so overlapping roots reuse completed descendant analysis without initializing their contexts.
 */
export function getSchemaDerivedData(root: ImplicitFieldSchema): SchemaDerivedData {
	return getOrCreate(schemaDerivedDataCache, root, () => {
		const treeSchema = createTreeSchema(root);
		return { treeSchema, hasStagedSchema: treeSchemaHasStagedSchema(treeSchema) };
	});
}

/**
 * Resolves staging reachability using a complete, validated graph from {@link createTreeSchema}.
 * @remarks
 * Discovers uncached nodes and temporary reverse reference edges, stopping at completed per-node answers.
 * Nodes with direct staging or references to cached staging seed a reverse flood-fill.
 * After propagation, all remaining discovered nodes are staging-free, including cycles with no staging.
 * Only completed answers are published; no parent edges are retained in the per-node cache.
 *
 * Work and temporary storage are linear in the newly inspected annotations, nodes, and references.
 * Tarjan's strongly connected components algorithm could also resolve cycles and may be more efficient,
 * particularly by avoiding the temporary reverse-edge storage.
 *
 * Root-field annotations affect only the root answer, not the referenced nodes' cached answers.
 * The unfiltered graph includes staged references and remains separately validated even when node analysis is cached.
 * This analysis must not initialize contexts, whose construction depends on stored-schema generation.
 * When adding a staging mechanism, update this check and add an observable staged case to the test-schema catalog.
 */
function treeSchemaHasStagedSchema(schema: TreeSchema): boolean {
	const dependents = new Map<TreeNodeSchema, Set<TreeNodeSchema>>();
	const pending: (SimpleNodeSchema<SchemaType.View> & TreeNodeSchema)[] = [];
	const staged = new Set<TreeNodeSchema>();
	const roots = new Set<TreeNodeSchema>();
	let rootHasStaging =
		schema.root.isStagedOptional !== undefined && schema.root.isStagedOptional !== false;

	/**
	 * Records dependencies and attributes {@link SimpleAllowedTypeAttributes.isStaged | staging} on a reference to its parent, never to the referenced node.
	 * Omitting the parent denotes the root field, whose annotations are not cached on node schemas.
	 */
	function visitAllowedTypes(
		types: SimpleAllowedTypes<SchemaType.View>,
		parent?: TreeNodeSchema,
	): void {
		for (const [identifier, attributes] of types) {
			if (attributes.isStaged !== false) {
				if (parent === undefined) {
					rootHasStaging = true;
				} else {
					staged.add(parent);
				}
			}

			const node = schema.definitions.get(identifier);
			assert(node !== undefined, "Staging analysis requires a complete schema graph");
			if (parent === undefined) {
				roots.add(node);
			}
			const cached = getTreeNodeSchemaPrivateData(node).hasStagedSchema;
			if (cached !== undefined) {
				if (cached && parent !== undefined) {
					staged.add(parent);
				}
				continue;
			}
			const parents = getOrCreate(dependents, node, () => {
				pending.push(node);
				return new Set<TreeNodeSchema>();
			});
			if (parent !== undefined) {
				parents.add(parent);
			}
		}
	}

	visitAllowedTypes(schema.root.simpleAllowedTypes);
	// Array iteration includes newly discovered nodes without recursing through the schema graph.
	for (const node of pending) {
		switch (node.kind) {
			case NodeKind.Leaf: {
				break;
			}
			case NodeKind.Array:
			case NodeKind.Map:
			case NodeKind.Record: {
				visitAllowedTypes(node.simpleAllowedTypes, node);
				break;
			}
			case NodeKind.Object: {
				for (const field of node.fields.values()) {
					if (field.isStagedOptional !== undefined && field.isStagedOptional !== false) {
						staged.add(node);
					}
					visitAllowedTypes(field.simpleAllowedTypes, node);
				}
				break;
			}
			default: {
				unreachableCase(node);
			}
		}
	}

	// Set iteration includes newly marked parents, propagating through cycles without provisional negative answers.
	for (const node of staged) {
		for (const parent of dependents.get(node) ?? []) {
			staged.add(parent);
		}
	}
	for (const node of dependents.keys()) {
		getTreeNodeSchemaPrivateData(node).hasStagedSchema = staged.has(node);
	}
	for (const root of roots) {
		if (getTreeNodeSchemaPrivateData(root).hasStagedSchema === true) {
			return true;
		}
	}
	return rootHasStaging;
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
