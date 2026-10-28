/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type {
	TreeNodeSchemaIdentifier,
	TreeNodeStoredSchema,
	TreeStoredSchema,
} from "../core/index.js";
import { defaultSchemaPolicy } from "../feature-libraries/index.js";
import { brand, getOrCreate, oneFromIterable } from "../util/index.js";

import {
	Context,
	NodeKind,
	StagedSchemaUpgradePolicy,
	UnhydratedContext,
	getTreeNodeSchemaPrivateData,
	walkSchema,
	type AllowedTypesFullEvaluated,
	type AnnotatedAllowedType,
	type TreeNodeSchema,
} from "./core/index.js";
import {
	type FieldSchemaAlpha,
	type ImplicitFieldSchema,
	normalizeFieldSchema,
} from "./fieldSchema.js";
import type { SchemaType, SimpleNodeSchema, SimpleTreeSchema } from "./simpleSchema.js";
import {
	convertField,
	filterFieldAllowedTypes,
	getStoredSchema,
	referencedTypes,
	transformSimpleNodeSchema,
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
	 * Permissive conversion, shared with the default context.
	 */
	#storedComponent: StoredSchemaComponent | undefined;
	/**
	 * Completed policy-filtered components, indexed by policy and original member identity.
	 * Filtering can split this component, so different members can map to different stored components.
	 * Allocated only for policy-dependent conversions; completed entries survive later conversion failures.
	 */
	#storedComponents:
		| WeakMap<StagedSchemaUpgradePolicy, Map<TreeNodeSchema, StoredSchemaComponent>>
		| undefined;
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
	 * @throws A {@link UsageError} if distinct reachable schemas have the same identifier.
	 */
	public static fromSchema(schema: TreeNodeSchema): SchemaComponent {
		assert(
			!isResolvingComponentData,
			"Schema component resolution and context creation must not be reentrant",
		);
		isResolvingComponentData = true;
		try {
			if (!schemaComponentCache.has(schema)) {
				analyzeSchema(schema);
			}
			const component = getComponent(schema);
			assert(component.definitions !== undefined, "Expected a validated schema component");
			return component;
		} finally {
			isResolvingComponentData = false;
		}
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
	 * Permissive stored conversion shared by this component's roots and default unhydrated context.
	 * Completes dependencies iteratively without materializing their reachable definition maps.
	 */
	public get storedComponent(): StoredSchemaComponent {
		if (this.#storedComponent !== undefined) {
			return this.#storedComponent;
		}
		const completing: SchemaComponent[] = [this];
		while (completing.length > 0) {
			const component = completing.at(-1);
			assert(component !== undefined, "Expected a schema component to complete");
			if (component.#storedComponent !== undefined) {
				completing.pop();
				continue;
			}
			const incomplete = [...component.dependencies].filter(
				(dependency) => dependency.#storedComponent === undefined,
			);
			if (incomplete.length > 0) {
				for (const dependency of incomplete) {
					completing.push(dependency);
				}
				continue;
			}
			const nodes = new Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>();
			for (const schema of component.members) {
				nodes.set(
					brand(schema.identifier),
					getStoredSchema(
						transformSimpleNodeSchema(
							schema as SimpleNodeSchema<SchemaType.View> & TreeNodeSchema,
							StagedSchemaUpgradePolicy.permissive,
						),
					),
				);
			}
			component.#storedComponent = new StoredSchemaComponent(
				nodes,
				new Set(
					[...component.dependencies].map((dependency) => {
						const converted = dependency.#storedComponent;
						assert(converted !== undefined, "Expected a converted dependency");
						return converted;
					}),
				),
			);
			completing.pop();
		}
		const stored = this.#storedComponent;
		assert(stored !== undefined, "Expected a converted schema component");
		return stored;
	}

	/**
	 * Converts the policy-filtered graph reachable from a member of this component.
	 * Reuses completed conversions from this component and its dependencies without retaining requesting roots.
	 * Failed conversions do not publish partial components; completed dependencies remain reusable.
	 * @param member - A member of this component, after reachable identifiers have been validated.
	 * @param policy - Policy used to filter staged schema.
	 * @param definitions - Validated definitions from the requesting root, avoiding materialization of descendant maps.
	 */
	public getStoredComponent(
		member: TreeNodeSchema,
		policy: StagedSchemaUpgradePolicy,
		definitions: TreeSchema["definitions"],
	): StoredSchemaComponent {
		if (!this.hasStagedSchema || policy === StagedSchemaUpgradePolicy.permissive) {
			return this.storedComponent;
		}
		function cached(schema: TreeNodeSchema): StoredSchemaComponent | undefined {
			const component = getComponent(schema);
			return component.hasStagedSchema
				? component.#storedComponents?.get(policy)?.get(schema)
				: component.storedComponent;
		}
		function completed(schema: TreeNodeSchema): StoredSchemaComponent {
			const stored = cached(schema);
			assert(stored !== undefined, "Expected a completed stored schema component");
			return stored;
		}
		const existing = cached(member);
		if (existing !== undefined) {
			return existing;
		}
		walkSchema([member], {
			allowedTypeFilter: (type: AnnotatedAllowedType<TreeNodeSchema>) =>
				type.metadata.stagedSchemaUpgrade === undefined ||
				policy.includeStaged(type.metadata.stagedSchemaUpgrade),
			wasComponentVisited: (schema) => {
				const component = getComponent(schema);
				return (
					!component.hasStagedSchema ||
					component.#storedComponents?.get(policy)?.has(schema) === true
				);
			},
			stronglyConnectedComponent: (members) => {
				const identities = new Set(members);
				const nodes = new Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>();
				const dependencies = new Set<StoredSchemaComponent>();
				for (const schema of members) {
					const view = definitions.get(schema.identifier);
					assert(view !== undefined, "Component member must belong to the validated graph");
					const transformed = transformSimpleNodeSchema(view, policy);
					nodes.set(brand(schema.identifier), getStoredSchema(transformed));
					for (const identifier of referencedTypes(transformed)) {
						const dependency = definitions.get(identifier);
						assert(
							dependency !== undefined,
							"Stored reference must belong to the validated graph",
						);
						if (!identities.has(dependency)) {
							dependencies.add(completed(dependency));
						}
					}
				}
				const stored = new StoredSchemaComponent(nodes, dependencies);
				for (const schema of members) {
					const component = getComponent(schema);
					getOrCreate(
						(component.#storedComponents ??= new WeakMap()),
						policy,
						() => new Map(),
					).set(schema, stored);
				}
			},
		});
		return completed(member);
	}

	/**
	 * Default context shared by all roots referencing this component.
	 * Root-field annotations are not part of an unhydrated node's context.
	 * @remarks
	 * Created on first access and cached only after construction succeeds.
	 * Does not allow unknown optional fields.
	 */
	public get context(): Context {
		assert(
			!isResolvingComponentData,
			"Schema component resolution and context creation must not be reentrant",
		);
		if (this.#context !== undefined) {
			return this.#context;
		}
		isResolvingComponentData = true;
		try {
			const definitions = this.definitions;
			return (this.#context = new Context(
				new UnhydratedContext(defaultSchemaPolicy, this.storedComponent.definitions),
				definitions,
			));
		} finally {
			isResolvingComponentData = false;
		}
	}
}

/**
 * Guards against synchronous reentry into schema lookup or default-context creation.
 * @remarks
 * Resolving schema references and converting stored schema can invoke user code, such as lazy references and metadata getters.
 * If that code requests data whose computation is still in progress, it can trigger recursive computation before a completed result is cached.
 *
 * This module-wide guard conservatively rejects nested component and root lookups and context requests,
 * including requests for unrelated components or already-cached contexts.
 * It does not guard ordinary recursive schema graphs, which are handled by the graph walker.
 * Guarded operations reset this flag in a `finally` block so failures do not block subsequent requests.
 */
let isResolvingComponentData = false;

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
	 * Permissive node definitions, shared by stored-schema conversion and the default context.
	 * Combined on demand without materializing descendant components' definition maps.
	 */
	#storedDefinitions: TreeStoredSchema["nodeSchema"] | undefined;
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
	 * Permissive node definitions, excluding the root field.
	 */
	private get storedDefinitions(): TreeStoredSchema["nodeSchema"] {
		return (this.#storedDefinitions ??= combineStoredDefinitions(
			new Set([...this.components].map((component) => component.storedComponent)),
		));
	}

	/**
	 * Default context for this root's reachable nodes, independent of root-field annotations.
	 * Single-component roots share the component's context even when the root field is staged.
	 * Empty and multi-component roots create and cache their own contexts after construction succeeds.
	 */
	public get context(): Context {
		assert(
			!isResolvingComponentData,
			"Schema component resolution and context creation must not be reentrant",
		);
		const component = oneFromIterable(this.components);
		if (component !== undefined) {
			return component.context;
		}
		if (this.#context !== undefined) {
			return this.#context;
		}
		isResolvingComponentData = true;
		try {
			const definitions = this.definitions;
			return (this.#context = new Context(
				new UnhydratedContext(defaultSchemaPolicy, this.storedDefinitions),
				definitions,
			));
		} finally {
			isResolvingComponentData = false;
		}
	}

	/**
	 * Converts and caches this root under the supplied policy, sharing component-level converted definitions.
	 * Failed conversions do not publish results; completed dependencies remain reusable.
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
	 * Combines the converted root field with component-owned stored definitions.
	 */
	private convertStoredSchema(policy: StagedSchemaUpgradePolicy): TreeStoredSchema {
		const definitions = this.definitions;
		const rootFieldSchema = convertField(filterFieldAllowedTypes(this.root, policy));
		if (policy === StagedSchemaUpgradePolicy.permissive) {
			return { rootFieldSchema, nodeSchema: this.storedDefinitions };
		}
		const components = new Set(
			[...rootFieldSchema.types].map((identifier) => {
				const schema = definitions.get(identifier);
				assert(schema !== undefined, "Root type must belong to the validated graph");
				return getComponent(schema).getStoredComponent(schema, policy, definitions);
			}),
		);
		return { rootFieldSchema, nodeSchema: combineStoredDefinitions(components) };
	}
}

/**
 * Caches {@link RootSchemaDerivedData} records by requested root identity.
 * Retrieving root-derived data always validates reachable identifiers before returning.
 * Combining reachable components validates identifier uniqueness, even when those components are cached.
 * Root entries own root-field conversion results; components own converted node definitions.
 */
const rootSchemaDerivedDataCache = new WeakMap<ImplicitFieldSchema, RootSchemaDerivedData>();

/**
 * Completed node components, indexed by member identity without retaining requesting roots.
 * Analysis populates this cache without allocating root-derived data or validating reachable identifiers.
 * Completed components remain reusable after a requesting root fails analysis or validation.
 */
const schemaComponentCache = new WeakMap<TreeNodeSchema, SchemaComponent>();

/**
 * Derives the complete, unfiltered schema graph and staging reachability from a root schema.
 * @param rootSchema - The root schema to analyze.
 * Lazy schema references must be ready to evaluate, and schema definitions must remain unchanged after evaluation.
 * @returns Data derived from the schema, memoized by the original root identity.
 * @throws A {@link UsageError} if distinct reachable schemas have the same identifier.
 * @remarks
 * Graph and staging analysis are logically pure: they depend only on the supplied schema, not on cache state.
 * Evaluation of lazy schema references and internal cache population are implementation effects.
 * This function does not initialize contexts or perform configuration-specific validation; the latter remains the responsibility of {@link TreeViewConfiguration}.
 * Treat the returned graph as immutable; definitions may be shared across roots, and their iteration order is unspecified.
 */
export function getRootSchemaDerivedData(
	rootSchema: ImplicitFieldSchema,
): RootSchemaDerivedData {
	assert(
		!isResolvingComponentData,
		"Schema component resolution and context creation must not be reentrant",
	);
	isResolvingComponentData = true;
	try {
		const data = getOrCreate(rootSchemaDerivedDataCache, rootSchema, () => {
			const root = analyzeSchema(rootSchema);
			const components = new Set(
				root.allowedTypesFull.evaluate().types.map((type) => getComponent(type.type)),
			);
			return new RootSchemaDerivedData(root, components);
		});
		// Component completion can precede root validation, including after a failed parent request.
		assert(data.treeSchema !== undefined, "Expected a validated root graph");
		return data;
	} finally {
		isResolvingComponentData = false;
	}
}

/**
 * Reports whether completed root-schema analysis is cached. For testing only.
 * @remarks
 * Does not discover schemas, validate identifiers, or materialize definitions.
 * A cached entry does not imply that root identifier validation has succeeded.
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
 * Completes topology and staging analysis without constructing reachable maps or contexts.
 * @param rootSchema - Schema whose lazy references are ready to be evaluated.
 * @param allowedTypes - Optional per-request callback for every allowed-type list, including lists in previously analyzed components and the root field.
 * Receives the original evaluated sequence, preserving duplicates for configuration validation.
 * @returns The normalized root field.
 * @remarks
 * Publishes components only after their dependencies are complete, without creating root-derived data.
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
			wasComponentVisited: (schema) => schemaComponentCache.has(schema),
			stronglyConnectedComponent: (members) => {
				const identities = new Set(members);
				const dependencies = new Set<SchemaComponent>();
				let hasStagedSchema = false;
				for (const schema of members) {
					for (const field of getTreeNodeSchemaPrivateData(schema).childAllowedTypes) {
						for (const type of field.evaluate().types) {
							if (type.metadata.stagedSchemaUpgrade !== undefined) {
								hasStagedSchema = true;
							}
							if (!identities.has(type.type)) {
								dependencies.add(getComponent(type.type));
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

/**
 * A successfully converted strongly connected component of the policy-filtered schema graph.
 * @remarks
 * All members have the same reachable stored definitions and can share {@link StoredSchemaComponent.definitions}.
 * Retains only converted nodes and outgoing dependencies, not requesting roots, contexts, or view-schema graphs.
 * A record is published for all members only after their conversions and dependency resolution succeed.
 */
class StoredSchemaComponent {
	#definitions: TreeStoredSchema["nodeSchema"] | undefined;

	/**
	 * Creates a converted component without materializing its reachable definitions.
	 */
	public constructor(
		/**
		 * Immutable converted definitions for this component's members only, excluding other components.
		 */
		public readonly nodes: TreeStoredSchema["nodeSchema"],
		/**
		 * Completed components directly referenced by {@link StoredSchemaComponent.nodes}, excluding this component.
		 * References are read from transformed schema so edges removed by the policy are absent.
		 * Staging-free dependencies may belong to the common {@link toUnhydratedSchema} cache.
		 */
		public readonly dependencies: ReadonlySet<StoredSchemaComponent>,
	) {}

	/**
	 * Immutable definitions for this component and all its transitive dependencies.
	 * Aliases {@link StoredSchemaComponent.nodes} when there are no dependencies.
	 * Otherwise computed on first access and cached only after construction succeeds.
	 * Leaving descendant maps lazy avoids eagerly retaining quadratic entries for an acyclic chain.
	 */
	public get definitions(): TreeStoredSchema["nodeSchema"] {
		return (this.#definitions ??=
			this.dependencies.size === 0 ? this.nodes : collectStoredDefinitions([this]));
	}
}

/**
 * Reuses the definition map for a single stored component, or collects a root's combined definitions.
 * Empty roots receive an empty map.
 */
function combineStoredDefinitions(
	components: ReadonlySet<StoredSchemaComponent>,
): TreeStoredSchema["nodeSchema"] {
	return oneFromIterable(components)?.definitions ?? collectStoredDefinitions(components);
}

/**
 * Builds a fresh map of all definitions reachable from the supplied completed components.
 * @remarks
 * Visits each reachable component once, avoiding repeated merging along diamond paths.
 * Shares the converted node objects; does not convert nodes, evaluate policies, or materialize descendant maps.
 * Input components must come from an identifier-validated root graph and compatible policy results.
 * Different acyclic roots still have overlapping maps, but share the converted node definitions.
 * Returns an empty map for empty roots. The caller owns publication and sharing of the returned map.
 */
function collectStoredDefinitions(
	roots: Iterable<StoredSchemaComponent>,
): TreeStoredSchema["nodeSchema"] {
	const components = new Set(roots);
	const definitions = new Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>();
	for (const component of components) {
		for (const [identifier, node] of component.nodes) {
			definitions.set(identifier, node);
		}
		for (const dependency of component.dependencies) {
			components.add(dependency);
		}
	}
	return definitions;
}
