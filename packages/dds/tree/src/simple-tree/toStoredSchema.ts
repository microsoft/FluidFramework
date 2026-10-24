/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	unreachableCase,
	fail,
	transformMapValues,
	assert,
} from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	EmptyKey,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	type FieldKey,
	type FieldKindIdentifier,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	type TreeTypeSet,
} from "../core/index.js";
import { FieldKinds, type FlexFieldKind } from "../feature-libraries/index.js";
import {
	brand,
	filterIterable,
	getOrCreate,
	mapIterable,
	type JsonCompatibleReadOnlyObject,
} from "../util/index.js";

import {
	ExpectStored,
	NodeKind,
	SchemaUpgrade,
	StagedSchemaUpgradePolicy,
	Unchanged,
	getTreeNodeSchemaPrivateData,
	walkSchema,
	type TreeNodeSchema,
	type AnnotatedAllowedType,
	type SimpleSchemaTransformationOptions,
	type StoredSchemaGenerationOptions,
} from "./core/index.js";
import { FieldKind, type ImplicitFieldSchema } from "./fieldSchema.js";
import type {
	SchemaType,
	SimpleAllowedTypeAttributes,
	SimpleAllowedTypes,
	SimpleArrayNodeSchema,
	SimpleFieldSchema,
	SimpleLeafNodeSchema,
	SimpleMapNodeSchema,
	SimpleNodeSchema,
	SimpleObjectNodeSchema,
	SimpleRecordNodeSchema,
	SimpleTreeSchema,
} from "./simpleSchema.js";
import { getSchemaDerivedData } from "./treeSchema.js";

// TODO: this file, src/simple-tree/api/storedSchema.ts and src/simple-tree/core/toStored.ts should be refactored to group the logic more logically.
// The content of src/simple-tree/api/storedSchema.ts should probably removed from the API surface, replaced by simple schema snapshotting APIs.
// The logic from this file for converting stored-simple-schema to the persisted format can be moved to its own file.
// The simple-schema related logic from this file and src/simple-tree/core/toStored.ts can be unified and `toStoredSchema` and its other ImplicitFieldSchema consuming variants should probably be removed in favor of acting on TreeSchema and SimpleTreeSchema directly.

/**
 * Owns {@link StoredSchemaCache} entries by {@link (StagedSchemaUpgradePolicy:interface) | policy} identity.
 * @remarks
 * {@link getSchemaDerivedData} separately shares the unfiltered graph, staging analysis, and optional unhydrated context.
 * Policy keys are weak to avoid retaining short-lived effective upgrade policies.
 * Schema definitions and policy decisions must remain unchanged while their cached results are reused.
 */
const viewToStoredCache = new WeakMap<StagedSchemaUpgradePolicy, StoredSchemaCache>();

/**
 * Completed stored-schema conversions associated with one policy in {@link viewToStoredCache}.
 * @remarks
 * Roots and components without transitively reachable staging use the {@link toUnhydratedSchema} entry across policies.
 * Root normalization also accounts for root-field staging; component normalization excludes root-field annotations.
 * Both decisions use unfiltered staging analysis, not the absence of staging after policy filtering.
 * This cache does not own contexts or replace the identifier validation performed by {@link getSchemaDerivedData}.
 */
interface StoredSchemaCache {
	/**
	 * Successful whole-root conversions, keyed by the original node, field, or union identity.
	 * Root fields and result wrappers are root-specific; their node-definition maps may be shared.
	 * Published only after root conversion and reachable-map construction succeed.
	 */
	readonly roots: WeakMap<ImplicitFieldSchema, TreeStoredSchema>;
	/**
	 * Maps every member schema identity to its shared {@link StoredSchemaComponent}.
	 * An entry certifies that the whole filtered component and its outgoing dependencies converted successfully.
	 * This is the caller-owned knowledge supplied to the incremental walk's `wasComponentVisited` predicate.
	 * Completed dependencies remain reusable if a later component or root conversion fails.
	 */
	readonly components: WeakMap<TreeNodeSchema, StoredSchemaComponent>;
}

/**
 * A successfully converted strongly connected component of the policy-filtered schema graph.
 * @remarks
 * All members have the same reachable stored definitions and can share {@link StoredSchemaComponent.definitions}.
 * Retains only converted nodes and outgoing dependencies, not requesting roots, contexts, or view-schema graphs.
 * A record is published for all members only after their conversions and dependency resolution succeed.
 */
interface StoredSchemaComponent {
	/**
	 * Immutable converted definitions for this component's members only, excluding other components.
	 */
	readonly nodes: TreeStoredSchema["nodeSchema"];
	/**
	 * Completed components directly referenced by {@link StoredSchemaComponent.nodes}, excluding this component.
	 * References are read from transformed schema so edges removed by the policy are absent.
	 * Staging-free dependencies may belong to the common {@link toUnhydratedSchema} cache.
	 */
	readonly dependencies: ReadonlySet<StoredSchemaComponent>;
	/**
	 * Immutable definitions for this component and all its transitive dependencies.
	 * Aliases {@link StoredSchemaComponent.nodes} when there are no dependencies.
	 * Otherwise populated by {@link toStoredSchema} only when a requested root needs this component's reachable map.
	 * Leaving descendant maps lazy avoids eagerly retaining quadratic entries for an acyclic chain.
	 */
	definitions?: TreeStoredSchema["nodeSchema"];
}

/**
 * Returns the {@link StoredSchemaCache} for exactly the supplied policy identity, creating an empty cache if absent.
 * Does not normalize the policy, traverse schema, or perform conversions.
 * {@link toStoredSchema} selects the appropriate cache separately for each root and component.
 */
function getStoredSchemaCache(policy: StagedSchemaUpgradePolicy): StoredSchemaCache {
	return getOrCreate(viewToStoredCache, policy, () => ({
		roots: new WeakMap(),
		components: new WeakMap(),
	}));
}

/**
 * Reports whether a root field or any transitively reachable schema contains staging.
 * @remarks
 * Includes {@link SimpleAllowedTypeAttributes.isStaged | staged allowed types} and {@link SimpleFieldSchema.isStagedOptional | staged optional fields},
 * including those reachable only through other staged references.
 * A `false` result permits {@link toStoredSchema} to share stored schema across all {@link (StagedSchemaUpgradePolicy:interface)} instances.
 * A `true` result does not guarantee that different policies produce different stored schemas, since staging can be redundant.
 *
 * Resolves lazy schema references, so all referenced schemas must already be declared.
 * Does not initialize unhydrated contexts, whose construction itself depends on stored-schema generation.
 *
 * @throws Throws a `UsageError` if reachable node schemas have conflicting identifiers.
 */
export function hasStagedSchema(root: ImplicitFieldSchema): boolean {
	return getSchemaDerivedData(root).hasStagedSchema;
}

function isStagedSchemaUpgradePolicy(
	stagedSchemaUpgrades: Iterable<SchemaUpgrade> | StagedSchemaUpgradePolicy,
): stagedSchemaUpgrades is StagedSchemaUpgradePolicy {
	return (
		typeof stagedSchemaUpgrades === "object" &&
		"includeStaged" in stagedSchemaUpgrades &&
		"includeStagedOptional" in stagedSchemaUpgrades
	);
}

/**
 * Resolves a collection of staged schema upgrades into stored-schema generation options.
 * @remarks
 * If `stagedSchemaUpgrades` is omitted, returns restrictive options.
 */
export function resolveStoredSchemaGenerationOptions(
	stagedSchemaUpgrades?: Iterable<SchemaUpgrade> | StagedSchemaUpgradePolicy,
): StagedSchemaUpgradePolicy {
	if (stagedSchemaUpgrades === undefined) {
		return StagedSchemaUpgradePolicy.restrictive;
	}

	if (isStagedSchemaUpgradePolicy(stagedSchemaUpgrades)) {
		return stagedSchemaUpgrades;
	}

	return StagedSchemaUpgradePolicy.enabledStagedUpgrades(...stagedSchemaUpgrades);
}

/**
 * Converts a {@link ImplicitFieldSchema} into a {@link TreeStoredSchema} for use in schema upgrades.
 */
export function toUpgradeSchema(
	root: ImplicitFieldSchema,
	stagedSchemaUpgrades?: Iterable<SchemaUpgrade> | StagedSchemaUpgradePolicy,
): TreeStoredSchema {
	return toStoredSchema(root, resolveStoredSchemaGenerationOptions(stagedSchemaUpgrades));
}

/**
 * Converts a {@link ImplicitFieldSchema} into a {@link TreeStoredSchema} for use as initial document schema.
 */
export function toInitialSchema(
	root: ImplicitFieldSchema,
	stagedSchemaUpgrades?: Iterable<SchemaUpgrade> | StagedSchemaUpgradePolicy,
): TreeStoredSchema {
	return toStoredSchema(root, resolveStoredSchemaGenerationOptions(stagedSchemaUpgrades));
}

/**
 * Permissive staged schema upgrade policy used for unhydrated node schema generation.
 * @remarks
 * This allows as much as possible, relying on further validation when inserting the content.
 *
 * TODO: this should get additional options to enable support for unknown optional fields.
 */
export const toUnhydratedSchema: StagedSchemaUpgradePolicy =
	StagedSchemaUpgradePolicy.permissive;

/**
 * Converts a {@link ImplicitFieldSchema} into a {@link TreeStoredSchema}.
 *
 * @remarks
 * Results are shared by root and {@link (StagedSchemaUpgradePolicy:interface)} identity.
 * Roots without {@link hasStagedSchema | reachable staging} share one result across all staged-upgrade policies,
 * including {@link toUnhydratedSchema} for unhydrated contexts.
 * Different roots can share converted nodes; roots in the same policy-filtered component also share a node-definition map.
 * Root fields remain separate because their allowed types, kind, and metadata can differ.
 * Treat the returned schema as immutable.
 *
 * @privateRemarks
 * TODO:#38722 When runtime schema upgrades are implemented, this will need to be updated to check if
 * a staged allowed type has been upgraded and if so, include it in the conversion.
 *
 * Even if this took in a SimpleTreeSchema,
 * it would still need to walk the schema to avoid including schemas that become unreachable due to filtered out staged schema.
 *
 * @throws
 * Throws a `UsageError` if multiple schemas are encountered with the same identifier.
 */
export function toStoredSchema(
	root: ImplicitFieldSchema,
	options: StagedSchemaUpgradePolicy,
): TreeStoredSchema {
	const data = getSchemaDerivedData(root);

	// Root staging includes root-field annotations as well as transitively reachable node staging.
	const policy = data.hasStagedSchema ? options : toUnhydratedSchema;

	const cache = getStoredSchemaCache(policy);
	return getOrCreate(cache.roots, root, () => {
		const rootFieldSchema = convertField(
			filterFieldAllowedTypes(data.treeSchema.root, policy),
		);
		const commonCache = getStoredSchemaCache(toUnhydratedSchema);
		/**
		 * Selects storage for this node's conversion using its completed unfiltered staging analysis.
		 * A staging-free descendant uses the common cache even when the requesting root contains staging.
		 * Never infer policy equivalence from the filtered result, since filtering can remove staged edges.
		 */
		function componentCache(schema: TreeNodeSchema): StoredSchemaCache {
			if (cache === commonCache) {
				return cache;
			}
			const component = getTreeNodeSchemaPrivateData(schema).component;
			assert(
				component !== undefined,
				"Stored conversion requires completed unfiltered analysis",
			);
			return component.hasStagedSchema ? cache : commonCache;
		}
		/**
		 * Retrieves a completed conversion from the cache selected by {@link componentCache}.
		 * Used only after dependency completion or after the filtered walk has finished.
		 */
		function getComponent(schema: TreeNodeSchema): StoredSchemaComponent {
			const component = componentCache(schema).components.get(schema);
			assert(component !== undefined, "Expected a completed stored schema component");
			return component;
		}
		/**
		 * Selects reference edges for component discovery using the same policy as node conversion.
		 * Root-field filtering is handled separately before choosing the walk's roots.
		 */
		const includes = (type: AnnotatedAllowedType<TreeNodeSchema>): boolean =>
			type.metadata.stagedSchemaUpgrade === undefined ||
			policy.includeStaged(type.metadata.stagedSchemaUpgrade);
		const roots = [...rootFieldSchema.types].map((identifier) => {
			const schema = data.treeSchema.definitions.get(identifier);
			assert(schema !== undefined, "Root type must belong to the validated graph");
			return schema;
		});
		walkSchema(roots, {
			allowedTypeFilter: includes,
			wasComponentVisited: (schema) => componentCache(schema).components.has(schema),
			stronglyConnectedComponent: (members) => {
				const identities = new Set(members);
				const nodes = new Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>();
				const dependencies = new Set<StoredSchemaComponent>();
				for (const schema of members) {
					const view = data.treeSchema.definitions.get(schema.identifier);
					assert(view !== undefined, "Component member must belong to the validated graph");
					const transformed = transformSimpleNodeSchema(view, policy);
					nodes.set(brand(schema.identifier), getStoredSchema(transformed));
					for (const identifier of referencedTypes(transformed)) {
						const dependency = data.treeSchema.definitions.get(identifier);
						assert(
							dependency !== undefined,
							"Stored reference must belong to the validated graph",
						);
						if (!identities.has(dependency)) {
							dependencies.add(getComponent(dependency));
						}
					}
				}
				const component: StoredSchemaComponent = { nodes, dependencies };
				if (dependencies.size === 0) {
					component.definitions = nodes;
				}
				// Do not let a partially converted cycle satisfy wasComponentVisited on a later request.
				for (const schema of members) {
					componentCache(schema).components.set(schema, component);
				}
			},
		});
		const components = new Set(roots.map(getComponent));
		const [only] = components;
		const nodeSchema =
			components.size === 1 && only !== undefined
				? (only.definitions ??= collectStoredDefinitions(components))
				: collectStoredDefinitions(components);
		return { rootFieldSchema, nodeSchema };
	});
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

/**
 * Converts a {@link SimpleTreeSchema} from `SchemaType.View` to `SchemaType.Stored`.
 */
export function transformSimpleSchema(
	schema: SimpleTreeSchema<SchemaType.View>,
	options: StagedSchemaUpgradePolicy,
): SimpleTreeSchema<SchemaType.Stored>;

/**
 * Copies a `SchemaType.Stored` {@link SimpleTreeSchema}.
 */
export function transformSimpleSchema(
	schema: SimpleTreeSchema<SchemaType.Stored>,
	options: ExpectStored,
): SimpleTreeSchema<SchemaType.Stored>;

/**
 * Copies a {@link SimpleTreeSchema}.
 */
export function transformSimpleSchema<T extends SchemaType>(
	schema: SimpleTreeSchema<T>,
	options: Unchanged,
): SimpleTreeSchema<T>;

/**
 * Converts a {@link SimpleTreeSchema}.
 */
export function transformSimpleSchema(
	schema: SimpleTreeSchema,
	options: SimpleSchemaTransformationOptions,
): SimpleTreeSchema;

/**
 * TODO:#38722 When runtime schema upgrades are implemented, this will need to be updated to check if
 * a staged allowed type has been upgraded and if so, include it in the conversion.
 */
export function transformSimpleSchema(
	schema: SimpleTreeSchema,
	options: SimpleSchemaTransformationOptions,
): SimpleTreeSchema {
	const simpleNodeSchema = new Map<string, SimpleNodeSchema>();
	const root = filterFieldAllowedTypes(schema.root, options);
	const queue = [...root.simpleAllowedTypes.keys()];
	for (const identifier of queue) {
		getOrCreate(simpleNodeSchema, identifier, (id) => {
			const nodeSchema = schema.definitions.get(id) ?? fail(0xca8 /* missing schema */);
			const transformed = transformSimpleNodeSchema(nodeSchema, options);
			for (const type of referencedTypes(transformed)) {
				queue.push(type);
			}
			return transformed;
		});
	}
	// Copy simpleNodeSchema, but in the order from the original schema.definitions
	// Currently we do not specify anything about the order of definitions, but it is nicer to have a stable order and some tests rely on it.
	const definitions = new Map<string, SimpleNodeSchema>(
		mapIterable(
			filterIterable(schema.definitions.keys(), (id) => simpleNodeSchema.has(id)),
			(id) => [id, simpleNodeSchema.get(id) ?? fail(0xca9 /* missing schema */)],
		),
	);
	assert(
		definitions.size === simpleNodeSchema.size,
		0xcaa /* Reachable schema missing from input TreeSchema */,
	);
	return { root, definitions };
}

/**
 * Enumerates direct child type identifiers from a simple node schema without traversing or filtering them.
 * Object fields are visited in map order and can yield the same identifier more than once.
 * Callers use transformed schema to enumerate only references retained by their policy.
 */
function* referencedTypes(schema: SimpleNodeSchema): IterableIterator<string> {
	switch (schema.kind) {
		case NodeKind.Leaf: {
			break;
		}
		case NodeKind.Array:
		case NodeKind.Map:
		case NodeKind.Record: {
			yield* schema.simpleAllowedTypes.keys();
			break;
		}
		case NodeKind.Object: {
			for (const field of schema.fields.values()) {
				yield* field.simpleAllowedTypes.keys();
			}
			break;
		}
		default: {
			unreachableCase(schema);
		}
	}
}

/**
 * Convert a {@link SimpleTreeSchema} for a stored schema into a {@link TreeStoredSchema}.
 * @remarks
 * This only supports simple schemas that are already logically stored schemas.
 * @privateRemarks
 * To correctly support view schema here, this would need to filter out unreferenced schema after excluding staged schema.
 * @see {@link ExpectStored}.
 */
export function simpleStoredSchemaToStoredSchema(
	treeSchema: SimpleTreeSchema<SchemaType.Stored>,
): TreeStoredSchema {
	const result: TreeStoredSchema = {
		nodeSchema: transformMapValues(treeSchema.definitions, (schema) =>
			getStoredSchema(schema),
		) as Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>,
		rootFieldSchema: convertField(treeSchema.root),
	};
	return result;
}

/**
 * Convert a {@link SimpleFieldSchema} into a {@link TreeFieldStoredSchema}.
 */
export function convertField(
	schema: SimpleFieldSchema<SchemaType.Stored>,
): TreeFieldStoredSchema {
	const kind: FieldKindIdentifier =
		convertFieldKind.get(schema.kind)?.identifier ?? fail(0xae3 /* Invalid field kind */);
	const types = convertAllowedTypes(schema.simpleAllowedTypes);
	return { kind, types, persistedMetadata: schema.persistedMetadata };
}

/**
 * A map that converts {@link FieldKind} to {@link FlexFieldKind}.
 */
export const convertFieldKind: ReadonlyMap<FieldKind, FlexFieldKind> = new Map<
	FieldKind,
	FlexFieldKind
>([
	[FieldKind.Optional, FieldKinds.optional],
	[FieldKind.Required, FieldKinds.required],
	[FieldKind.Identifier, FieldKinds.identifier],
]);

/**
 * Converts a {@link TreeNodeSchema} into a {@link TreeNodeStoredSchema}.
 * @privateRemarks
 * TODO: Persist node metadata once schema FormatV2 is supported.
 */
export function getStoredSchema(
	schema: SimpleNodeSchema<SchemaType.Stored>,
): TreeNodeStoredSchema {
	const kind = schema.kind;
	switch (kind) {
		case NodeKind.Leaf: {
			return new LeafNodeStoredSchema(schema.leafKind);
		}
		case NodeKind.Map:
		case NodeKind.Record: {
			const types = convertAllowedTypes(schema.simpleAllowedTypes);
			return new MapNodeStoredSchema(
				{
					kind: FieldKinds.optional.identifier,
					types,
					persistedMetadata: schema.persistedMetadata,
				},
				// TODO: Find a way to avoid injecting persistedMetadata twice in these constructor calls.
				schema.persistedMetadata,
			);
		}
		case NodeKind.Array: {
			return arrayNodeStoredSchema(schema.simpleAllowedTypes, schema.persistedMetadata);
		}
		case NodeKind.Object: {
			const fields: Map<FieldKey, TreeFieldStoredSchema> = new Map();
			for (const fieldSchema of schema.fields.values()) {
				fields.set(brand(fieldSchema.storedKey), convertField(fieldSchema));
			}
			return new ObjectNodeStoredSchema(fields, schema.persistedMetadata);
		}
		default: {
			unreachableCase(kind);
		}
	}
}

/**
 * Converts a {@link SimpleNodeSchema} from view to stored.
 */
export function transformSimpleNodeSchema(
	schema: SimpleNodeSchema<SchemaType.View>,
	options: StagedSchemaUpgradePolicy,
): SimpleNodeSchema<SchemaType.Stored>;

/**
 * Converts a {@link SimpleNodeSchema}.
 */
export function transformSimpleNodeSchema(
	schema: SimpleNodeSchema,
	options: SimpleSchemaTransformationOptions,
): SimpleNodeSchema;

/**
 * Copies a node's fields and metadata according to the transformation options.
 * @remarks
 * Performs a shallow transformation: child types remain identifiers and referenced node definitions are not converted.
 * Persisted metadata values are retained by reference; view-only metadata follows the selected transformation options.
 * Used by both whole-schema transformation and component-based stored conversion.
 */
export function transformSimpleNodeSchema(
	schema: SimpleNodeSchema,
	options: SimpleSchemaTransformationOptions,
): SimpleNodeSchema {
	const metadata = {
		persistedMetadata: schema.persistedMetadata,
		metadata: preservesViewData(options)
			? {
					custom: schema.metadata.custom,
					description: schema.metadata.description,
				}
			: {},
	};
	const kind = schema.kind;
	switch (kind) {
		case NodeKind.Leaf: {
			return {
				kind,
				leafKind: schema.leafKind,
				...metadata,
			} satisfies SimpleLeafNodeSchema;
		}
		case NodeKind.Array:
		case NodeKind.Map:
		case NodeKind.Record: {
			return {
				kind,
				...metadata,
				simpleAllowedTypes: filterAllowedTypes(schema.simpleAllowedTypes, options),
			} satisfies SimpleMapNodeSchema | SimpleRecordNodeSchema | SimpleArrayNodeSchema;
		}
		case NodeKind.Object: {
			return {
				kind,
				...metadata,
				fields: transformMapValues(schema.fields, (f) => ({
					...filterFieldAllowedTypes(f, options),
					storedKey: f.storedKey,
				})),
				allowUnknownOptionalFields: filterViewData(options, schema.allowUnknownOptionalFields),
			} satisfies SimpleObjectNodeSchema;
		}
		default: {
			unreachableCase(kind);
		}
	}
}

function arrayNodeStoredSchema(
	schema: SimpleAllowedTypes<SchemaType.Stored>,
	persistedMetadata: JsonCompatibleReadOnlyObject | undefined,
): ObjectNodeStoredSchema {
	const field = {
		kind: FieldKinds.sequence.identifier,
		types: convertAllowedTypes(schema),
		persistedMetadata,
	};
	const fields = new Map([[EmptyKey, field]]);
	return new ObjectNodeStoredSchema(fields, persistedMetadata);
}

/**
 * Converts a {@link SimpleAllowedTypes} to a stored schema.
 * @param schema - The schema to convert.
 * @param options - The options to use for filtering.
 * @returns The converted stored schema.
 */
export function filterAllowedTypes(
	schema: SimpleAllowedTypes,
	options: SimpleSchemaTransformationOptions,
): SimpleAllowedTypes {
	const filtered: Map<string, SimpleAllowedTypeAttributes> = new Map();
	for (const [type, data] of schema) {
		if (options === Unchanged) {
			filtered.set(type, { isStaged: data.isStaged });
		} else if (allowedTypeFilter(data, options)) {
			filtered.set(type, { isStaged: undefined });
		}
	}
	return filtered;
}

/**
 * Copies a view field into stored form, applying the policy to allowed types and staged optionality.
 */
function filterFieldAllowedTypes(
	f: SimpleFieldSchema<SchemaType.View>,
	options: StagedSchemaUpgradePolicy,
): SimpleFieldSchema<SchemaType.Stored>;
/**
 * Copies and transforms a field's annotations and allowed types without traversing referenced schemas.
 * View-only data is retained or removed according to the transformation options.
 */
function filterFieldAllowedTypes(
	f: SimpleFieldSchema,
	options: SimpleSchemaTransformationOptions,
): SimpleFieldSchema;
function filterFieldAllowedTypes(
	f: SimpleFieldSchema,
	options: SimpleSchemaTransformationOptions,
): SimpleFieldSchema {
	const isStagedOptional =
		preservesViewData(options) && f.isStagedOptional instanceof SchemaUpgrade
			? f.isStagedOptional
			: undefined;
	return {
		kind: getStoredFieldKind(f, options),
		persistedMetadata: f.persistedMetadata,
		metadata: preservesViewData(options)
			? {
					custom: f.metadata.custom,
					description: f.metadata.description,
				}
			: {},
		simpleAllowedTypes: filterAllowedTypes(f.simpleAllowedTypes, options),
		...(isStagedOptional === undefined ? {} : { isStagedOptional }),
	};
}

/**
 * Returns the field kind to use in the stored schema for the given view field schema.
 * @remarks
 * For {@link SchemaFactoryAlpha.stagedOptional | staged optional} fields, the stored field kind is Required
 * when the staged optional is not being included (i.e., restrictive options).
 */
function getStoredFieldKind(
	f: SimpleFieldSchema,
	options: SimpleSchemaTransformationOptions,
): FieldKind {
	if (!isStoredFromView(options)) {
		return f.kind;
	}
	const { isStagedOptional } = f;
	if (isStagedOptional === undefined || isStagedOptional === false) return f.kind;
	// isStagedOptional is a SchemaUpgrade — use includeStagedOptional to decide the stored kind.
	return options.includeStagedOptional(isStagedOptional) ? f.kind : FieldKind.Required;
}

/**
 * Converts a stored {@link SimpleAllowedTypes} to a {@link TreeTypeSet}.
 */
function convertAllowedTypes(schema: SimpleAllowedTypes<SchemaType.Stored>): TreeTypeSet {
	return new Set(schema.keys() as Iterable<TreeNodeSchemaIdentifier>);
}

/**
 * Filters an allowed type based on the provided options.
 * @param allowedType - The allowed type to filter.
 * @param options - The options to use for filtering.
 * @returns Whether the allowed type passes the filter.
 */
function allowedTypeFilter(
	data: SimpleAllowedTypeAttributes,
	options: StoredSchemaGenerationOptions,
): boolean {
	if (options === ExpectStored) {
		if (data.isStaged !== undefined) {
			throw new UsageError(
				"Failed to covert view schema to stored schema. The simple schema provided was indicated to be a stored schema by the use of `ExpectStored`, but view schema specific content was encountered which requires a `StagedSchemaUpgradePolicy` to process.",
			);
		}
		return true;
	}

	if (data.isStaged === undefined) {
		throw new UsageError(
			"Failed to covert view schema to stored schema. The simple schema provided as the view schema was actually a stored schema. If this was intended, use `ExpectStored` for the `StoredSchemaGenerationOptions` to indicate the input is already a stored schema and only a format conversion is required.",
		);
	}

	// If the allowed type is staged, only include it if the options allow it.
	if (data.isStaged === false) {
		return true;
	}

	return options.includeStaged(data.isStaged);
}

function isStoredFromView(
	options: SimpleSchemaTransformationOptions,
): options is StagedSchemaUpgradePolicy {
	return typeof options === "object" && "includeStaged" in options;
}

function filterViewData<T>(
	options: SimpleSchemaTransformationOptions,
	data: T,
): T | undefined {
	return preservesViewData(options) ? data : undefined;
}

/**
 * Determines if the provided options indicate that view specific data should be preserved.
 * @remarks
 * This assumes that stored simple schema should not contain view specific data.
 * Therefore the only case where what this returns should matter is when the input schema is view schema
 * (and thus there might be view specific data).
 */
function preservesViewData(options: SimpleSchemaTransformationOptions): boolean {
	// As noted above in the doc comment, the only case we care about the return value is when the input is a view schema.
	// There are two such cases: isStoredFromView where we return false, and Unchanged when applied to a view schema, where we return true.
	// It does not matter what we return in other cases, so for simplicity they just end up as "true".
	return isStoredFromView(options) ? false : true;
}
