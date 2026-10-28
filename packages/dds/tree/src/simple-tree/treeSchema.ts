/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { TreeStoredSchema } from "../core/index.js";
import { defaultSchemaPolicy } from "../feature-libraries/index.js";
import { getOrCreate, oneFromIterable } from "../util/index.js";

import {
	Context,
	NodeKind,
	StagedSchemaUpgradePolicy,
	UnhydratedContext,
	getTreeNodeSchemaPrivateData,
	walkSchema,
	type TreeNodeSchema,
} from "./core/index.js";
import {
	type FieldSchemaAlpha,
	type ImplicitFieldSchema,
	normalizeFieldSchema,
} from "./fieldSchema.js";
import type { SchemaType, SimpleNodeSchema, SimpleTreeSchema } from "./simpleSchema.js";
import {
	simpleStoredSchemaToStoredSchema,
	transformSimpleSchema,
} from "./schemaConversion.js";
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
 * Transitive schema information shared by node components and root fields.
 * @remarks
 * Includes references with staged upgrades, regardless of the policy used for stored conversion.
 * Definitions and contexts are computed on demand; staging reachability is computed during schema analysis.
 */
export interface TransitiveSchemaInfo {
	/**
	 * All reachable node definitions, validated for identifier uniqueness.
	 * Treat the map as immutable. Iteration order is unspecified.
	 */
	readonly definitions: TreeSchema["definitions"];

	/**
	 * Whether this schema or anything reachable from it contains staged allowed types or staged optional fields.
	 * `false` permits policy-independent stored conversion.
	 */
	readonly hasStagedSchema: boolean;

	/**
	 * Default unhydrated context for the reachable nodes, excluding root-field annotations.
	 * Does not allow unknown optional fields.
	 */
	readonly context: Context;
}

/**
 * Shared derived data for a {@link SchemaVisitor.stronglyConnectedComponent}).
 * @remarks
 * Does not certify identifier uniqueness or configuration-specific union validity.
 * Retains only members and outgoing dependencies, never parents or configurations.
 * Reachable definitions are materialized only for requested components, not eagerly for every descendant.
 *
 * Get using {@link fromSchema}.
 */
export class SchemaComponent implements TransitiveSchemaInfo {
	/**
	 * Validated reachable definitions, materialized on first access.
	 */
	#definitions: TreeSchema["definitions"] | undefined;
	/**
	 * Default unhydrated context, cached only after successful construction.
	 */
	#context: Context | undefined;

	/**
	 * Creates a completed component without materializing its reachable definitions.
	 */
	public constructor(
		/**
		 * Every schema identity in this unfiltered component, including non-class leaf schemas.
		 * Member order is unspecified.
		 */
		public readonly members: readonly TreeNodeSchema[],
		/**
		 * Completed components directly referenced by members, excluding this component.
		 * Includes staged references and retains no reverse dependents.
		 */
		public readonly dependencies: ReadonlySet<SchemaComponent>,
		/**
		 * Whether any member or transitively reachable schema contains staged allowed types or staged optional fields.
		 * Staging on a reference belongs to the referencing schema, not its target.
		 * Root-field staging is not part of a node component.
		 * `false` permits policy-independent stored conversion.
		 */
		public readonly hasStagedSchema: boolean,
	) {
		assert(members.length > 0, "A schema component must contain at least one node");
	}

	/**
	 * Returns the cached component containing a node schema, creating it if needed.
	 * @remarks
	 * Resolves lazy schema references and validates reachable identifiers without constructing a context.
	 * Does not create root-derived data.
	 * Use {@link getRootSchemaDerivedData} for field schemas.
	 * Subject to the callback and failure constraints of {@link runSchemaInitialization}.
	 * @throws A {@link UsageError} if distinct reachable schemas have the same identifier.
	 * @throws A {@link UsageError} if a callback starts nested schema initialization.
	 */
	public static fromSchema(schema: TreeNodeSchema): SchemaComponent {
		const component = getOrCreateSchemaComponent(schema);
		assert(component.definitions !== undefined, "Expected a validated schema component");
		return component;
	}

	/**
	 * Complete unfiltered definitions reachable from any member, shared by roots within this component.
	 * Computed on first access and cached only after reachable identifier uniqueness is validated.
	 * Discovering a component does not materialize its map.
	 * Iteration order is unspecified; serializers that require stable ordering must canonicalize it.
	 * @throws A {@link UsageError} if distinct reachable schemas have the same identifier.
	 * @remarks
	 * The first access traverses reachable components; later accesses return the cached map.
	 * Does not populate descendant components' definition caches.
	 */
	public get definitions(): TreeSchema["definitions"] {
		return (this.#definitions ??= materializeDefinitions([this]));
	}

	/**
	 * Default context shared by all roots referencing this component.
	 * Root-field annotations are not part of an unhydrated node's context.
	 * @remarks
	 * Created on first access.
	 * Reuses the permissive root conversion of one member, since every member reaches the same unfiltered nodes.
	 * Does not allow unknown optional fields.
	 */
	public get context(): Context {
		if (this.#context !== undefined) {
			return this.#context;
		}
		const member = this.members[0];
		assert(member !== undefined, "A schema component must contain at least one node");
		const data = getRootSchemaDerivedData(member);
		return (this.#context = new Context(
			new UnhydratedContext(
				defaultSchemaPolicy,
				data.getStoredSchema(StagedSchemaUpgradePolicy.permissive).nodeSchema,
			),
			data.definitions,
		));
	}
}

/**
 * Whether a derived-schema initialization or stored-schema conversion is in progress.
 */
let isInitializingSchema = false;

/**
 * Runs a derived-schema initialization or stored-schema conversion without allowing nested initialization.
 * @remarks
 * Lazy references, metadata getters, and upgrade policies can invoke user code before the result is cached.
 * Such callbacks may reuse completed cached data, but must not start another initialization, even for unrelated schemas.
 * Callers check for completed cached data before entering this helper.
 * Internal graph traversal stays within this boundary; ordinary recursive schema references are supported.
 *
 * If initialization or conversion throws, continued use of the affected schemas is unsupported.
 * Cache changes are not rolled back, and retry and fault isolation are not guaranteed.
 * Resetting the guard avoids disabling all schema initialization after an exception; it does not restore failed schemas.
 * @throws A {@link UsageError} if a callback starts nested schema initialization.
 */
function runSchemaInitialization<T>(initialize: () => T): T {
	if (isInitializingSchema) {
		throw new UsageError(
			"Schema initialization must not be reentrant. Do not start another schema initialization from a lazy schema reference, metadata getter, or schema upgrade policy.",
		);
	}
	isInitializingSchema = true;
	try {
		return initialize();
	} finally {
		isInitializingSchema = false;
	}
}

/**
 * Data derived from an {@link ImplicitFieldSchema} root, obtained via {@link getRootSchemaDerivedData}.
 * Owns root-specific conversion results for {@link toStoredSchema}.
 * Root field kind, annotations and metadata remain distinct even when definitions are shared.
 */
export class RootSchemaDerivedData implements TransitiveSchemaInfo {
	/**
	 * Validated reachable definitions, shared with the sole referenced component or combined lazily.
	 */
	#definitions: TreeSchema["definitions"] | undefined;
	/**
	 * Root-specific wrapper around the validated definitions, created on first access.
	 */
	#treeSchema: TreeSchema | undefined;
	/**
	 * Successful root conversions, allocated on demand.
	 * Roots without staging store one policy-independent result directly; other roots cache by policy identity.
	 */
	#storedSchemas:
		| TreeStoredSchema
		| WeakMap<StagedSchemaUpgradePolicy, TreeStoredSchema>
		| undefined;
	/**
	 * Default unhydrated context, cached after successful construction for empty and multi-component roots.
	 * Single-component roots reuse the component's context instead.
	 */
	#context: Context | undefined;
	/**
	 * Whether staging on the root field or any reachable node prevents policy-independent root conversion.
	 * Includes references that are themselves staged.
	 * A `true` result does not guarantee different results for different policies, since staging can be redundant.
	 */
	public readonly hasStagedSchema: boolean;

	/**
	 * Creates root-derived data without initializing an unhydrated context.
	 */
	public constructor(
		/**
		 * Normalized root field, including root-specific annotations and metadata.
		 */
		public readonly root: FieldSchemaAlpha,
		/**
		 * Components directly referenced by the root field, including staged references.
		 * Empty roots have no components; different allowed types can share one component.
		 */
		public readonly components: ReadonlySet<SchemaComponent>,
	) {
		this.hasStagedSchema =
			isStagedOptional(root) ||
			root.allowedTypesFull
				.evaluate()
				.types.some((type) => type.metadata.stagedSchemaUpgrade !== undefined) ||
			[...components].some((component) => component.hasStagedSchema);
	}

	/**
	 * All reachable node definitions, validated and cached on first access.
	 * Reuses a single referenced component's map; otherwise traverses components without materializing their maps.
	 * @throws A {@link UsageError} if distinct reachable schemas have the same identifier.
	 */
	public get definitions(): TreeSchema["definitions"] {
		return (this.#definitions ??=
			oneFromIterable(this.components)?.definitions ??
			materializeDefinitions(this.components));
	}

	/**
	 * Root field and identifier-validated definitions, with a root-specific wrapper around the shared map.
	 */
	public get treeSchema(): TreeSchema {
		return (this.#treeSchema ??= { root: this.root, definitions: this.definitions });
	}

	/**
	 * Default context for this root's reachable nodes, independent of root-field annotations.
	 * Single-component roots share the component's context even when the root field is staged.
	 * Empty and multi-component roots create and cache their own contexts.
	 */
	public get context(): Context {
		const component = oneFromIterable(this.components);
		if (component !== undefined) {
			return component.context;
		}
		if (this.#context !== undefined) {
			return this.#context;
		}
		const definitions = this.definitions;
		return (this.#context = new Context(
			new UnhydratedContext(
				defaultSchemaPolicy,
				this.getStoredSchema(StagedSchemaUpgradePolicy.permissive).nodeSchema,
			),
			definitions,
		));
	}

	/**
	 * Converts and caches this root under the supplied policy, reusing its cached view schema.
	 * Roots without staging use the permissive policy for all requests.
	 * Subject to the callback and failure constraints of {@link runSchemaInitialization}.
	 * @throws A {@link UsageError} if a callback starts nested schema initialization.
	 */
	public getStoredSchema(options: StagedSchemaUpgradePolicy): TreeStoredSchema {
		if (!this.hasStagedSchema) {
			const stored = this.#storedSchemas;
			assert(!(stored instanceof WeakMap), "Expected a policy-independent cache");
			return (this.#storedSchemas =
				stored ?? this.convertStoredSchema(StagedSchemaUpgradePolicy.permissive));
		}
		this.#storedSchemas ??= new WeakMap();
		assert(this.#storedSchemas instanceof WeakMap, "Expected a policy-dependent cache");
		return getOrCreate(this.#storedSchemas, options, () => this.convertStoredSchema(options));
	}

	/**
	 * Converts the cached view schema, following only references retained by the policy.
	 */
	private convertStoredSchema(policy: StagedSchemaUpgradePolicy): TreeStoredSchema {
		return runSchemaInitialization(() =>
			simpleStoredSchemaToStoredSchema(transformSimpleSchema(this.treeSchema, policy)),
		);
	}
}

/**
 * Caches {@link RootSchemaDerivedData} records by requested root identity.
 * Root-derived data is cached after reachable identifiers have been validated.
 * Combining reachable components validates identifier uniqueness, even when those components are cached.
 * Root entries own complete stored-schema results; components own shared view-schema data.
 */
const rootSchemaDerivedDataCache = new WeakMap<ImplicitFieldSchema, RootSchemaDerivedData>();

/**
 * Completed node components, indexed by member identity without retaining requesting roots.
 * Analysis populates this cache without allocating root-derived data or validating reachable identifiers.
 */
const schemaComponentCache = new WeakMap<TreeNodeSchema, SchemaComponent>();

/**
 * Derives the complete, unfiltered schema graph and staging reachability from a root schema.
 * @param rootSchema - The root schema to analyze.
 * Lazy schema references must be ready to evaluate, and schema definitions must remain unchanged after evaluation.
 * @returns Data derived from the schema, memoized by the original root identity.
 * @throws A {@link UsageError} if distinct reachable schemas have the same identifier.
 * @throws A {@link UsageError} if a callback starts nested schema initialization.
 * @remarks
 * Graph and staging analysis are logically pure: they depend only on the supplied schema, not on cache state.
 * Evaluation of lazy schema references and internal cache population are implementation effects.
 * This function does not initialize contexts or perform configuration-specific validation; the latter remains the responsibility of {@link TreeViewConfiguration}.
 * Treat the returned graph as immutable; definitions may be shared across roots, and their iteration order is unspecified.
 * Subject to the callback and failure constraints of {@link runSchemaInitialization}.
 */
export function getRootSchemaDerivedData(
	rootSchema: ImplicitFieldSchema,
): RootSchemaDerivedData {
	return getOrCreate(rootSchemaDerivedDataCache, rootSchema, () => {
		const { root, types } = runSchemaInitialization(() => {
			const field = normalizeFieldSchema(rootSchema);
			return { root: field, types: field.allowedTypesFull.evaluate().types };
		});
		const components = new Set(types.map((type) => getOrCreateSchemaComponent(type.type)));
		// Root staging metadata can also invoke user code, independently of component discovery.
		return runSchemaInitialization(() => {
			const data = new RootSchemaDerivedData(root, components);
			assert(data.treeSchema !== undefined, "Expected a validated root graph");
			return data;
		});
	});
}

/**
 * Reports whether completed root-schema analysis is cached. For testing only.
 * @remarks
 * Does not discover schemas, validate identifiers, or materialize definitions.
 */
export function hasCachedRootSchemaDerivedDataForTesting(
	schema: ImplicitFieldSchema,
): boolean {
	return rootSchemaDerivedDataCache.has(schema);
}

/**
 * Reports whether completed node-component analysis is cached. For testing only.
 * Does not discover schemas, validate identifiers, or materialize definitions.
 */
export function hasCachedSchemaComponentForTesting(schema: TreeNodeSchema): boolean {
	return schemaComponentCache.has(schema);
}

/**
 * Returns the component containing a node schema, traversing its reachable graph only on a cache miss.
 * @param root - Node schema whose lazy references are ready to be evaluated.
 * @remarks
 * Skips completed components and their dependencies.
 * Publishes new components only after their dependencies are complete.
 * Does not create root-derived data, reachable definition maps, or contexts.
 * Configuration-specific validation and reachable identifier validation are separate operations.
 * Guards discovery with {@link runSchemaInitialization}, after checking for an existing component.
 * Cached components can be retrieved during initialization, even before their definitions have been materialized.
 * @throws A {@link UsageError} if a callback starts nested component discovery.
 */
function getOrCreateSchemaComponent(root: TreeNodeSchema): SchemaComponent {
	const cached = schemaComponentCache.get(root);
	if (cached !== undefined) {
		return cached;
	}
	return runSchemaInitialization(() => {
		walkSchema([root], {
			wasComponentVisited: (schema) => schemaComponentCache.has(schema),
			stronglyConnectedComponent: (members) => {
				const identities = new Set(members);
				const dependencies = new Set<SchemaComponent>();
				let hasStagedSchema = false;
				for (const schema of members) {
					for (const field of getTreeNodeSchemaPrivateData(schema).childAllowedTypes) {
						for (const type of field.evaluate().types) {
							hasStagedSchema ||= type.metadata.stagedSchemaUpgrade !== undefined;
							if (!identities.has(type.type)) {
								dependencies.add(getCompletedComponent(type.type));
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
				for (const dependency of dependencies) {
					hasStagedSchema ||= dependency.hasStagedSchema;
				}
				const component = new SchemaComponent(members, dependencies, hasStagedSchema);
				for (const schema of members) {
					schemaComponentCache.set(schema, component);
				}
			},
		});
		return getCompletedComponent(root);
	});
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
function getCompletedComponent(schema: TreeNodeSchema): SchemaComponent {
	const component = schemaComponentCache.get(schema);
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
