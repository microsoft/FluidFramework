/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

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
 * @remarks
 * Includes references with staged upgrades, resolves lazy references, and rejects conflicting identifiers.
 * Does not populate derived-state or stored-schema result caches or initialize node contexts.
 * Lazy-reference evaluation retains its own existing memoization.
 * This independent graph-construction path supports reference conversions in tests.
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
	/**
	 * Every schema identity in this unfiltered component, including non-class leaf schemas.
	 * Member order is unspecified.
	 */
	readonly members: readonly TreeNodeSchema[];
	/**
	 * Completed components directly referenced by members, excluding this component.
	 * Includes staged references and retains no reverse dependents.
	 */
	readonly dependencies: ReadonlySet<SchemaComponent>;
	/**
	 * Whether any member or transitively reachable schema contains staged allowed types or staged optional fields.
	 * Staging on a reference belongs to the referencing schema, not its target.
	 * Root-field annotations are excluded; `false` permits policy-independent stored conversion.
	 */
	readonly hasStagedSchema: boolean;
	/**
	 * Complete unfiltered definitions reachable from any member, shared by roots within this component.
	 * Published only after reachable identifier uniqueness is validated.
	 * Remains absent until a root requests this map; discovering a component does not materialize its map.
	 * Iteration order is unspecified; serializers that require stable ordering must canonicalize it.
	 */
	definitions?: TreeSchema["definitions"];
}

/**
 * Root-owned state shared by {@link toStoredSchema} and {@link getUnhydratedContext}.
 * Root field kind, annotations and metadata remain distinct even when definitions are shared.
 */
export interface SchemaDerivedData {
	/**
	 * Root field and complete, identifier-validated unfiltered definitions.
	 * Treat this graph as immutable; its definitions may also serve other roots and context lookups.
	 */
	readonly treeSchema: TreeSchema;
	/**
	 * Whether the root field has staging or reaches a component with {@link SchemaComponent.hasStagedSchema}.
	 * `false` permits root-result sharing across policies; `true` does not guarantee that policy results differ.
	 */
	readonly hasStagedSchema: boolean;
	/**
	 * The component containing all root allowed types, if they belong to exactly one component.
	 * Absent for empty roots and roots spanning multiple components.
	 * Root fields remain separate from component-owned view definitions.
	 */
	readonly component: SchemaComponent | undefined;
	/**
	 * Populated by {@link getUnhydratedContext} only after construction succeeds.
	 * Analysis and stored conversion must not initialize contexts.
	 */
	unhydratedContext?: Context;
}

/**
 * Caches successful {@link SchemaDerivedData} records by original root identity.
 * Root identity owns validated graphs and lazy contexts; components own topology and shared definitions.
 * Failed requests do not publish root records, but already completed component analysis remains reusable.
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
 * @param rootSchema - Schema whose lazy references are ready to be evaluated.
 * @param allowedTypes - Optional per-request callback for every allowed-type list, including lists in previously analyzed components and the root field.
 * Receives the original evaluated sequence, preserving duplicates for configuration validation.
 * @returns The normalized root field.
 * @remarks
 * Publishes component data through {@link getTreeNodeSchemaPrivateData} only after each unfiltered component's dependencies are complete.
 * Root-field staging is not attributed to the referenced node components.
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

/**
 * Detects a staged optional field without applying a policy.
 * Both omitted staging data and explicit `false` mean no staged optionality.
 */
function isStagedOptional(field: { readonly isStagedOptional?: unknown }): boolean {
	return field.isStagedOptional !== undefined && field.isStagedOptional !== false;
}

/**
 * Retrieves completed unfiltered analysis; callers must first discover the schema's component.
 */
function getComponent(schema: TreeNodeSchema): SchemaComponent {
	const component = getTreeNodeSchemaPrivateData(schema).component;
	assert(component !== undefined, "Expected completed schema component");
	return component;
}

/**
 * Visits each reachable component once, avoiding repeated unions along diamonds.
 * Work is linear in reachable nodes and component edges, retaining one entry per reachable node for this requested closure.
 * Checks identifier uniqueness without materializing descendant maps or initializing contexts.
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

/**
 * Adds a schema to an identity-deduplicated graph, rejecting identifier collisions.
 */
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
