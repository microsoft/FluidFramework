/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { TreeStoredSchema } from "../core/index.js";
import { getOrCreate } from "../util/index.js";

import {
	NodeKind,
	getTreeNodeSchemaPrivateData,
	walkSchema,
	type AllowedTypesFullEvaluated,
	type Context,
	type TreeNodeSchema,
} from "./core/index.js";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used by TSDoc links.
import type { getUnhydratedContext } from "./createContext.js";
import {
	type FieldSchemaAlpha,
	type ImplicitFieldSchema,
	normalizeFieldSchema,
} from "./fieldSchema.js";
import type { SchemaType, SimpleNodeSchema, SimpleTreeSchema } from "./simpleSchema.js";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used by TSDoc links.
import type { toStoredSchema } from "./toStoredSchema.js";
import { walkFieldSchema } from "./walkFieldSchema.js";

/**
 * Uncached reference graph construction, retaining the visitor walk's postorder.
 * Independent of component analysis and stored-schema result caches.
 */
export function createTreeSchema(rootSchema: ImplicitFieldSchema): TreeSchema {
	const root = normalizeFieldSchema(rootSchema);
	const definitions = new Map<string, SimpleNodeSchema<SchemaType.View> & TreeNodeSchema>();
	walkFieldSchema(root, { node: (schema) => addDefinition(definitions, schema) });
	return { root, definitions };
}

/**
 * Completed unfiltered topology and staging analysis, shared by all identities in a strongly connected component.
 * @remarks
 * Does not certify identifier uniqueness or configuration-specific union validity.
 * Retains only members and outgoing dependencies, never parents or configurations.
 * Reachable definitions are materialized only for requested components, not eagerly for every descendant.
 */
export interface SchemaComponent {
	readonly members: readonly TreeNodeSchema[];
	readonly dependencies: ReadonlySet<SchemaComponent>;
	readonly hasStagedSchema: boolean;
	/**
	 * Shared, identifier-validated lookup data, published only after successful materialization.
	 * Iteration order is unspecified; serializers that require stable ordering must canonicalize it.
	 */
	definitions?: TreeSchema["definitions"];
	/**
	 * Immutable converted node definitions for the permissive policy only.
	 * Populated by {@link toStoredSchema} after conversion succeeds.
	 * Filtering under other policies can split this component, so their maps cannot use this slot.
	 */
	permissiveStoredDefinitions?: TreeStoredSchema["nodeSchema"];
}

/**
 * Root-owned state shared by {@link toStoredSchema} and {@link getUnhydratedContext}.
 * Root field kind, annotations and metadata remain distinct even when definitions are shared.
 */
export interface SchemaDerivedData {
	readonly treeSchema: TreeSchema;
	readonly hasStagedSchema: boolean;
	/**
	 * The component containing all root allowed types, if there is exactly one.
	 * Root fields remain separate from component-owned view and permissive stored definitions.
	 */
	readonly component: SchemaComponent | undefined;
	/**
	 * Populated by {@link getUnhydratedContext} only after construction succeeds.
	 * Analysis and stored conversion must not initialize contexts.
	 */
	unhydratedContext?: Context;
}

/**
 * Root identity owns validated graphs and lazy contexts; components own topology and shared definitions.
 * Policy-specific converted results remain owned by {@link toStoredSchema}.
 */
const schemaDerivedDataCache = new WeakMap<ImplicitFieldSchema, SchemaDerivedData>();

/**
 * Builds or retrieves a validated root graph without initializing contexts.
 * @remarks
 * Component completion is independent of root validation: valid dependencies can survive a failed parent request.
 * Identifier conflicts are checked when combining reachable components, even when every component is cached.
 * Configuration-specific validation remains eager in {@link TreeViewConfiguration}.
 *
 * Definition iteration order is unspecified.
 * Components share one map across their root wrappers and unhydrated lookups.
 * Field and union roots spanning components own their combined map.
 * Schema definitions must remain unchanged after evaluation.
 */
export function getSchemaDerivedData(rootSchema: ImplicitFieldSchema): SchemaDerivedData {
	return getOrCreate(schemaDerivedDataCache, rootSchema, () => {
		const root = analyzeSchema(rootSchema);
		const types = root.allowedTypesFull.evaluate().types;
		const components = new Set(types.map((type) => getComponent(type.type)));
		const [only] = components;
		const definitions =
			components.size === 1 && only !== undefined
				? (only.definitions ??= materializeDefinitions(components))
				: materializeDefinitions(components);
		return {
			treeSchema: { root, definitions },
			component: components.size === 1 ? only : undefined,
			hasStagedSchema:
				isStagedOptional(root) ||
				types.some((type) => type.metadata.stagedSchemaUpgrade !== undefined) ||
				[...components].some((component) => component.hasStagedSchema),
		};
	});
}

/**
 * Completes topology and staging analysis without constructing reachable maps or contexts.
 * The optional callback visits every allowed-type list, including in cached components, in visitor order.
 * Root identifier validation remains separate so configurations can preserve their validation phases.
 */
export function analyzeSchema(
	rootSchema: ImplicitFieldSchema,
	allowedTypes?: (types: AllowedTypesFullEvaluated) => void,
): FieldSchemaAlpha {
	const root = normalizeFieldSchema(rootSchema);
	const types = root.allowedTypesFull.evaluate();
	walkSchema(
		types.types.map((type) => type.type),
		{
			allowedTypes,
			wasComponentVisited: (schema) =>
				getTreeNodeSchemaPrivateData(schema).component !== undefined,
			stronglyConnectedComponent: (members) => {
				const identities = new Set(members);
				const referenced = new Set<TreeNodeSchema>();
				const dependencies = new Set<SchemaComponent>();
				let hasStagedSchema = false;
				for (const schema of members) {
					for (const field of getTreeNodeSchemaPrivateData(schema).childAllowedTypes) {
						for (const type of field.evaluate().types) {
							if (type.metadata.stagedSchemaUpgrade !== undefined) {
								hasStagedSchema = true;
							}
							if (!identities.has(type.type)) {
								referenced.add(type.type);
							}
						}
					}
					// Optional-field staging is not an allowed-type annotation.
					const view = schema as SimpleNodeSchema<SchemaType.View> & TreeNodeSchema;
					if (view.kind === NodeKind.Object) {
						for (const field of view.fields.values()) {
							hasStagedSchema ||= isStagedOptional(field);
						}
					}
				}
				for (const schema of referenced) {
					const dependency = getComponent(schema);
					dependencies.add(dependency);
					hasStagedSchema ||= dependency.hasStagedSchema;
				}
				const component: SchemaComponent = {
					members: [...identities],
					dependencies,
					hasStagedSchema,
				};
				for (const schema of identities) {
					getTreeNodeSchemaPrivateData(schema).component = component;
				}
			},
		},
	);
	allowedTypes?.(types);
	return root;
}

function isStagedOptional(field: { readonly isStagedOptional?: unknown }): boolean {
	return field.isStagedOptional !== undefined && field.isStagedOptional !== false;
}

function getComponent(schema: TreeNodeSchema): SchemaComponent {
	const component = getTreeNodeSchemaPrivateData(schema).component;
	assert(component !== undefined, "Expected completed schema component");
	return component;
}

/**
 * Visits each reachable component once, avoiding repeated unions along diamonds.
 * Uses O(V + E) traversal, retaining O(V) entries only for this requested closure.
 * Different acyclic roots can still retain overlapping maps.
 */
function materializeDefinitions(roots: Iterable<SchemaComponent>): TreeSchema["definitions"] {
	const components = new Set(roots);
	const definitions = new Map<string, SimpleNodeSchema<SchemaType.View> & TreeNodeSchema>();
	for (const component of components) {
		for (const schema of component.members) {
			addDefinition(definitions, schema);
		}
		for (const dependency of component.dependencies) {
			components.add(dependency);
		}
	}
	return definitions;
}

function addDefinition(
	definitions: Map<string, SimpleNodeSchema<SchemaType.View> & TreeNodeSchema>,
	schema: TreeNodeSchema,
): void {
	if (definitions.has(schema.identifier)) {
		throw new UsageError(
			`Multiple schema encountered with the identifier ${JSON.stringify(schema.identifier)}. Remove or rename them to avoid the collision.`,
		);
	}
	definitions.set(
		schema.identifier,
		schema as SimpleNodeSchema<SchemaType.View> & TreeNodeSchema,
	);
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
