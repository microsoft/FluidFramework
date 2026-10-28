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
 * Shared derived data for a schema component.
 * Real components contain mutually reachable schemas; synthetic components contain no members and reference other components.
 * @remarks
 * Does not certify identifier uniqueness or configuration-specific union validity.
 * Retains only members and outgoing dependencies, never parents or configurations.
 * Reachable definitions are materialized only for requested components, not eagerly for every descendant.
 */
export class SchemaComponent {
	#definitions: TreeSchema["definitions"] | undefined;
	#storedComponent: StoredSchemaComponent | undefined;
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
		 * Root-field annotations are excluded; `false` permits policy-independent stored conversion.
		 */
		public readonly hasStagedSchema: boolean,
	) {}

	/**
	 * Returns the cached component for a root schema, creating it if needed.
	 * @remarks
	 * Resolves lazy schema references and validates reachable identifiers without constructing a context.
	 * Roots referencing exactly one component reuse it.
	 * Empty roots and roots referencing multiple components use a synthetic component with no members.
	 * Root-field kind, annotations, and metadata do not affect the component.
	 * @throws A {@link UsageError} if distinct reachable schemas have the same identifier.
	 */
	public static fromSchema(schema: ImplicitFieldSchema): SchemaComponent {
		assert(
			!isResolvingComponentData,
			"Schema component resolution and context creation must not be reentrant",
		);
		isResolvingComponentData = true;
		try {
			return getRootSchemaDerivedData(schema).component;
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

// Schema callbacks must not reenter component lookup or context creation.
let isResolvingComponentData = false;

/**
 * Data derived from an {@link ImplicitFieldSchema} root, shared by {@link toStoredSchema} and {@link SchemaComponent.fromSchema}.
 * Root field kind, annotations and metadata remain distinct even when definitions are shared.
 */
export class RootSchemaDerivedData {
	#root: FieldSchemaAlpha | undefined;
	#treeSchema: TreeSchema | undefined;
	#hasStagedSchema: boolean | undefined;
	#storedSchemas: WeakMap<StagedSchemaUpgradePolicy, TreeStoredSchema> | undefined;
	#storedComponents: WeakMap<StagedSchemaUpgradePolicy, StoredSchemaComponent> | undefined;
	/**
	 * Creates root-derived data without initializing an unhydrated context.
	 */
	public constructor(
		/**
		 * Root schema, normalized lazily so dependency-only entries do not allocate field wrappers.
		 */
		private readonly rootSchema: ImplicitFieldSchema,
		/**
		 * Shared component data, including synthetic components for roots spanning zero or multiple components.
		 */
		public readonly component: SchemaComponent,
	) {}

	/**
	 * Normalized root field, including root-specific annotations and metadata.
	 */
	public get root(): FieldSchemaAlpha {
		return (this.#root ??= normalizeFieldSchema(this.rootSchema));
	}

	/**
	 * Root field and identifier-validated definitions, with a root-specific wrapper around the component's shared map.
	 */
	public get treeSchema(): TreeSchema {
		return (this.#treeSchema ??= { root: this.root, definitions: this.component.definitions });
	}

	/**
	 * Whether staging on the root field or any reachable node prevents policy-independent root conversion.
	 */
	public get hasStagedSchema(): boolean {
		return (this.#hasStagedSchema ??=
			isStagedOptional(this.root) ||
			this.root.allowedTypesFull
				.evaluate()
				.types.some((type) => type.metadata.stagedSchemaUpgrade !== undefined) ||
			this.component.hasStagedSchema);
	}

	/**
	 * Converts and caches this root under the supplied policy, sharing component-level converted definitions.
	 * Failed conversions do not publish results; completed dependencies remain reusable.
	 */
	public getStoredSchema(options: StagedSchemaUpgradePolicy): TreeStoredSchema {
		const definitions = this.component.definitions;
		const policy = this.hasStagedSchema ? options : StagedSchemaUpgradePolicy.permissive;
		return getOrCreate((this.#storedSchemas ??= new WeakMap()), policy, () => {
			const rootFieldSchema = convertField(filterFieldAllowedTypes(this.root, policy));
			if (policy === StagedSchemaUpgradePolicy.permissive) {
				return {
					rootFieldSchema,
					nodeSchema: this.component.storedComponent.definitions,
				};
			}
			function entry(schema: TreeNodeSchema): RootSchemaDerivedData {
				const data = rootSchemaDerivedDataCache.get(schema);
				assert(data !== undefined, "Expected completed unfiltered schema analysis");
				return data;
			}
			function getStoredComponent(schema: TreeNodeSchema): StoredSchemaComponent {
				const data = entry(schema);
				const component = data.component.hasStagedSchema
					? data.#storedComponents?.get(policy)
					: data.component.storedComponent;
				assert(component !== undefined, "Expected a completed stored schema component");
				return component;
			}
			const roots = [...rootFieldSchema.types].map((identifier) => {
				const schema = definitions.get(identifier);
				assert(schema !== undefined, "Root type must belong to the validated graph");
				return schema;
			});
			walkSchema(roots, {
				allowedTypeFilter: (type: AnnotatedAllowedType<TreeNodeSchema>) =>
					type.metadata.stagedSchemaUpgrade === undefined ||
					policy.includeStaged(type.metadata.stagedSchemaUpgrade),
				wasComponentVisited: (schema) => {
					const data = entry(schema);
					return (
						!data.component.hasStagedSchema || data.#storedComponents?.has(policy) === true
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
								dependencies.add(getStoredComponent(dependency));
							}
						}
					}
					const component = new StoredSchemaComponent(nodes, dependencies);
					for (const schema of members) {
						(entry(schema).#storedComponents ??= new WeakMap()).set(policy, component);
					}
				},
			});
			const components = new Set(roots.map(getStoredComponent));
			const rootComponent =
				oneFromIterable(components) ?? new StoredSchemaComponent(new Map(), components);
			return { rootFieldSchema, nodeSchema: rootComponent.definitions };
		});
	}
}

/**
 * Caches successful {@link RootSchemaDerivedData} records by original root identity.
 * Root identity owns validated graphs; components own topology and shared definitions.
 * Completed analysis can remain cached after root validation fails.
 * Retrieving root-derived data always validates reachable identifiers before returning.
 * Combining reachable components validates identifier uniqueness, even when those components are cached.
 * Policy-specific converted results remain owned by {@link toStoredSchema}.
 */
const rootSchemaDerivedDataCache = new WeakMap<ImplicitFieldSchema, RootSchemaDerivedData>();

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
	const data = getOrCreate(rootSchemaDerivedDataCache, rootSchema, () => {
		const root = analyzeSchema(rootSchema);
		const existing = rootSchemaDerivedDataCache.get(rootSchema);
		if (existing !== undefined) {
			return existing;
		}
		const types = root.allowedTypesFull.evaluate().types;
		const components = new Set(types.map((type) => getComponent(type.type)));
		return new RootSchemaDerivedData(
			root,
			oneFromIterable(components) ??
				new SchemaComponent(
					[],
					components,
					[...components].some((component) => component.hasStagedSchema),
				),
		);
	});
	// Component completion can precede root validation, including after a failed parent request.
	assert(data.treeSchema !== undefined, "Expected a validated root graph");
	return data;
}

/**
 * Returns completed analysis without discovering schemas or validating a root.
 */
export function getCachedRootSchemaDerivedData(
	schema: ImplicitFieldSchema,
): RootSchemaDerivedData | undefined {
	return rootSchemaDerivedDataCache.get(schema);
}

/**
 * Completes topology and staging analysis without constructing reachable maps or contexts.
 * @param rootSchema - Schema whose lazy references are ready to be evaluated.
 * @param allowedTypes - Optional per-request callback for every allowed-type list, including lists in previously analyzed components and the root field.
 * Receives the original evaluated sequence, preserving duplicates for configuration validation.
 * @returns The normalized root field.
 * @remarks
 * Publishes root entries referencing each component only after that component's dependencies are complete.
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
			wasComponentVisited: (schema) => rootSchemaDerivedDataCache.has(schema),
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
					rootSchemaDerivedDataCache.set(
						schema,
						new RootSchemaDerivedData(schema === rootSchema ? root : schema, component),
					);
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
	const component = rootSchemaDerivedDataCache.get(schema)?.component;
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
