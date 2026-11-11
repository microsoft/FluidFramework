/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	type FieldKey,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeStoredSchema,
} from "../core/index.js";
import { defaultSchemaPolicy, FieldKinds } from "../feature-libraries/index.js";
import { getOrCreate, oneFromIterable } from "../util/index.js";

import {
	Context,
	StagedSchemaUpgradePolicy,
	UnhydratedContext,
	getTreeNodeSchemaPrivateData,
	normalizeAllowedTypesInternal,
	normalizeAndEvaluateAnnotatedAllowedTypes,
	walkSchema,
	type SchemaUpgrade,
	type TreeNodeSchema,
} from "./core/index.js";
import {
	FieldKind,
	type FieldSchemaAlpha,
	type ImplicitFieldSchema,
	normalizeFieldSchema,
} from "./fieldSchema.js";
import { isObjectNodeSchema, type ObjectNodeSchemaPrivate } from "./node-kinds/index.js";
import type {
	SchemaType,
	SimpleFieldSchema,
	SimpleNodeSchema,
	SimpleTreeSchema,
} from "./simpleSchema.js";
import {
	getStoredSchema,
	resolveStoredSchemaGenerationOptions,
	simpleStoredSchemaToStoredSchema,
	transformSimpleNodeSchema,
	transformSimpleSchema,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used by TSDoc links.
	type toUnhydratedSchema,
} from "./toStoredSchema.js";
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
	 * Whether this schema or anything reachable from it contains staging controlled by {@link (StagedSchemaUpgradePolicy:interface)}.
	 * @remarks
	 * This includes {@link SchemaStaticsBeta.staged | staged allowed types} and {@link SchemaStaticsAlpha.stagedOptional | staged optional fields}.
	 * Any additional kind of staging controlled by the policy must also be included.
	 * When this is `false`, conversion into {@link TreeStoredSchema | stored schema}
	 * is independent of the policy passed to {@link toStoredSchema}.
	 * A `true` result does not guarantee different results for different policies, since staging can be redundant.
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
 * Staging on a reference belongs to the referencing component, not its target.
 * Root-field staging is not part of a node component.
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
		public readonly hasStagedSchema: boolean,
	) {
		assert(members.length > 0, 0xd9e /* A schema component must contain at least one node */);
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
		assert(
			component.definitions !== undefined,
			0xd9f /* Expected a validated schema component */,
		);
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
		assert(
			member !== undefined,
			0xda0 /* A schema component must contain at least one node */,
		);
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
 * Staging includes the root field as well as reachable nodes.
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
			root.isStagedOptional !== false ||
			normalizeAllowedTypesInternal(root.allowedTypesFull).hasStagedTypes ||
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
	 * Converts this root using {@link toStoredSchema}'s caching semantics.
	 * @remarks
	 * Subject to the callback and failure constraints of {@link runSchemaInitialization}.
	 * @throws A {@link UsageError} if a callback starts nested schema initialization.
	 */
	public getStoredSchema(options: StagedSchemaUpgradePolicy): TreeStoredSchema {
		if (!this.hasStagedSchema) {
			// Cache one canonical result when conversion is policy-independent.
			assert(
				!(this.#storedSchemas instanceof WeakMap),
				0xda1 /* Expected a policy-independent cache */,
			);
			this.#storedSchemas ??= this.#convertStoredSchema(options);
			return this.#storedSchemas;
		}
		this.#storedSchemas ??= new WeakMap();
		assert(
			this.#storedSchemas instanceof WeakMap,
			0xda2 /* Expected a policy-dependent cache */,
		);
		return getOrCreate(this.#storedSchemas, options, () => this.#convertStoredSchema(options));
	}

	/**
	 * Converts the cached view schema, following only references retained by the policy.
	 */
	#convertStoredSchema(policy: StagedSchemaUpgradePolicy): TreeStoredSchema {
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
			assert(data.treeSchema !== undefined, 0xda3 /* Expected a validated root graph */);
			return data;
		});
	});
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
 * Composes a candidate upgrade target from the view schema, existing stored schema, and configured staged-upgrade policy.
 *
 * @remarks
 * Start with the stored schema selected by the view and its policy, then combine it with existing permissions at corresponding fields.
 * This separates the policy's decision to introduce a permission from the need to preserve it once enabled.
 * Construction follows these rules:
 *
 * - Matching fields retain their stored allowed types and add types selected by the view and supplied policy.
 * - Already-optional fields stay optional when the corresponding view field supports missing content, including through staged optionality.
 * - Shared tokens do not make preservation global: an enabled change remains at its stored field, while other fields gain it only if the policy enables the token.
 * - For each included object type whose view allows unknown optional fields, omitted stored optional fields are retained with their allowed types and metadata.
 * - Existing node definitions referenced by retained fields are included, along with the definitions they reference.
 * Types known to the view use their current declarations with field permissions composed as above; types unknown to the view retain their stored definitions.
 *
 * The result is a proposal, not an approved upgrade.
 * Retaining an allowed type can still leave a candidate that the view cannot read, and other schema differences can still violate upgrade rules.
 * Before applying the candidate, callers must use {@link isSchemaUpgradeAllowed} to check both preservation of stored permissions and read/write compatibility with the view.
 * They remain responsible for deciding whether that permitted upgrade would make any change.
 *
 * @param viewSchema - The view schema for which the upgrade target is being constructed.
 * @param storedSchema - The existing stored schema from which to construct the upgrade target.
 * @param policy - The policy that selects new staged permissions. Existing permissions are preserved independently at each location.
 *
 * @returns The complete candidate stored schema.
 */
export function getSchemaUpgradeCandidate(
	viewSchema: TreeSchema,
	storedSchema: TreeStoredSchema,
	policy: StagedSchemaUpgradePolicy,
): TreeStoredSchema {
	const initial = toStoredSchema(viewSchema.root, policy);

	return runSchemaInitialization(() => {
		const rootFieldSchema = composeFieldSchema(
			initial.rootFieldSchema,
			storedSchema.rootFieldSchema,
			viewSchema.root,
		);
		const nodeSchema = new Map(initial.nodeSchema);
		const pending = new Set([...nodeSchema.keys(), ...rootFieldSchema.types]);

		// Iterate over all reachable node types, including those added while processing fields.
		// Iteration visits newly added identifiers; duplicates are ignored, so recursive references do not repeat work.
		for (const identifier of pending) {
			// The node definition as it appears in the view schema.
			// This will be `undefined` if the node is not declared in the view schema.
			const viewNode = viewSchema.definitions.get(identifier);

			// The node definition as it appears in the stored schema.
			// This will be `undefined` if the node is not declared in the stored schema.
			const storedNode = storedSchema.nodeSchema.get(identifier);

			let candidate = nodeSchema.get(identifier);

			if (candidate === undefined) {
				// A retained field can require a type omitted from the initial conversion because all view references to it are disabled by staging.
				// Use the view's current declaration when available, so upgrade validation can detect incompatible changes instead of hiding them with the stored definition.
				candidate =
					viewNode === undefined
						? storedNode
						: getStoredSchema(transformSimpleNodeSchema(viewNode, policy));
				if (candidate === undefined) {
					// Without a definition, this identifier permits no nodes.
					// Leave references to it intact rather than creating a definition that could allow new content.
					continue;
				}
			}

			// For each field, combine its existing stored permissions with the additions requested by the view and policy.
			// Preserving an already-enabled change in one field must not enable it in other fields that share the same token.
			//
			// Arrays also use stored object fields; their element types follow the same composition rule.
			if (
				storedNode instanceof ObjectNodeStoredSchema &&
				candidate instanceof ObjectNodeStoredSchema
			) {
				const viewObject =
					viewNode !== undefined && isObjectNodeSchema(viewNode) ? viewNode : undefined;
				candidate = composeObjectNodeSchema(candidate, storedNode, viewObject);
			} else if (
				storedNode instanceof MapNodeStoredSchema &&
				candidate instanceof MapNodeStoredSchema
			) {
				candidate = composeMapNodeSchema(candidate, storedNode);
			}

			nodeSchema.set(identifier, candidate);

			// Queue every type referenced by this node's fields, even if the node itself is unknown to the view.
			if (candidate instanceof MapNodeStoredSchema) {
				for (const type of candidate.mapFields.types) {
					pending.add(type);
				}
			} else if (candidate instanceof ObjectNodeStoredSchema) {
				for (const field of candidate.objectNodeFields.values()) {
					for (const type of field.types) {
						pending.add(type);
					}
				}
			} else {
				assert(candidate instanceof LeafNodeStoredSchema, "Unsupported stored node schema");
			}
		}

		return { rootFieldSchema, nodeSchema };
	});
}

/**
 * Composes fields of a stored object node and retains omitted optional fields when the view allows unknown optional fields.
 *
 * @remarks
 * The stored representation is shared by objects and arrays, but their view rules differ.
 * Both compose permissions for declared fields; only object views that allow unknown optional fields can also retain omitted fields.
 *
 * Field maps may belong to cached schemas, so this helper copies only the parts it changes rather than modifying either input.
 * It handles this node's fields only; the caller must follow their type references and validate the complete candidate.
 *
 * @param candidate - The node produced by converting the view or retaining an unknown stored type.
 * @param storedNode - The existing stored definition of the same node type.
 * @param viewObject - The view's object declaration, or `undefined` if the type is unknown or is not an object.
 *
 * @returns The original candidate if unchanged, or a new node with the composed fields and candidate metadata.
 */
function composeObjectNodeSchema(
	candidate: ObjectNodeStoredSchema,
	storedNode: ObjectNodeStoredSchema,
	viewObject: ObjectNodeSchemaPrivate | undefined,
): ObjectNodeStoredSchema {
	let fields: Map<FieldKey, TreeFieldStoredSchema> | undefined;
	for (const [fieldKey, field] of storedNode.objectNodeFields) {
		const candidateField = candidate.objectNodeFields.get(fieldKey);
		const propertyKey = viewObject?.storedKeyToPropertyKey.get(fieldKey);

		// The candidate already declares this stored field.
		// Combine its requested permissions with the existing ones so disabled staging cannot narrow the field.
		if (candidateField !== undefined) {
			const composed = composeFieldSchema(
				candidateField,
				field,
				propertyKey === undefined ? undefined : viewObject?.fields.get(propertyKey),
			);

			// Composition returns the original field when nothing changes.
			// Otherwise, copy the field map before replacing the entry so cached conversion results remain unchanged.
			if (composed !== candidateField) {
				fields ??= new Map(candidate.objectNodeFields);
				fields.set(fieldKey, composed);
			}
		} else if (
			viewObject?.allowUnknownOptionalFields === true &&
			field.kind === FieldKinds.optional.identifier &&
			propertyKey === undefined
		) {
			// The view omits this optional field but permits unknown optional fields.
			// Retain the stored definition unchanged instead of composing a declared field.
			// `candidate` may still reference a node from `toStoredSchema`'s cached result.
			// Copy its fields before adding document-specific retained fields, so the cached conversion remains unchanged.
			fields ??= new Map(candidate.objectNodeFields);
			fields.set(fieldKey, field);
		}
	}

	// At least one field changed or was retained, so replace the node with the updated fields while keeping its metadata.
	// Otherwise, reuse the original candidate without modifying a potentially cached node.
	return fields === undefined
		? candidate
		: new ObjectNodeStoredSchema(fields, candidate.metadata);
}

/**
 * Composes the shared entry field of a stored map node with the candidate's requested permissions.
 *
 * @remarks
 * All map entries use the same field schema, so preserving its allowed types preserves them for every entry.
 * The field schema may belong to a cached conversion and must not be mutated.
 * As with object composition, the caller must follow the resulting type references and validate the complete candidate.
 *
 * @param candidate - The node produced by converting the view or retaining an unknown stored type.
 * @param storedNode - The existing stored definition of the same node type.
 *
 * @returns The original candidate if unchanged, or a new node with the composed field and candidate metadata.
 */
function composeMapNodeSchema(
	candidate: MapNodeStoredSchema,
	storedNode: MapNodeStoredSchema,
): MapNodeStoredSchema {
	// A map uses one field schema for all entries, rather than a separate declaration for each key.
	// Compose that shared schema so existing entry types remain allowed alongside the view's requested additions.
	const mapFields = composeFieldSchema(candidate.mapFields, storedNode.mapFields);

	// Replace the map node only if composition changed its field schema, leaving the original node untouched.
	return mapFields === candidate.mapFields
		? candidate
		: new MapNodeStoredSchema(mapFields, candidate.metadata);
}

/**
 * Preserves stored field permissions while adding those selected by the view's configured policy.
 *
 * @remarks
 * Keeping an existing type prevents the candidate from narrowing the field, but does not give the view support for that type.
 * Callers must therefore validate the complete candidate before applying it rather than treating field composition as approval.
 *
 * @param candidate - The field produced by converting the view with the configured policy.
 * @param stored - The existing field at the same stored location.
 * @param viewField - The root or object view field, used to determine whether it supports missing content.
 *
 * @returns The original candidate if unchanged, or a new field retaining the existing permissions and candidate metadata.
 */
function composeFieldSchema(
	candidate: TreeFieldStoredSchema,
	stored: TreeFieldStoredSchema,
	viewField?: SimpleFieldSchema<SchemaType.View>,
): TreeFieldStoredSchema {
	let types: Set<TreeNodeSchemaIdentifier> | undefined;
	for (const type of stored.types) {
		if (!candidate.types.has(type)) {
			types ??= new Set(candidate.types);
			types.add(type);
		}
	}

	// A staged-optional field is optional in the view even when its policy-generated candidate is required.
	// A strictly required view must still fail validation rather than silently accepting missing content.
	const kind =
		stored.kind === FieldKinds.optional.identifier && viewField?.kind === FieldKind.Optional
			? FieldKinds.optional.identifier
			: candidate.kind;
	return types === undefined && kind === candidate.kind
		? candidate
		: { ...candidate, kind, types: types ?? candidate.types };
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
 * Converts a {@link ImplicitFieldSchema} into a {@link TreeStoredSchema}.
 *
 * @remarks
 * Results are shared by root and {@link (StagedSchemaUpgradePolicy:interface)} identity.
 * Roots without {@link TransitiveSchemaInfo.hasStagedSchema | reachable staging} share one result across all staged-upgrade policies,
 * including {@link toUnhydratedSchema} for unhydrated contexts.
 * Conversion reuses cached view-schema analysis and follows only references retained by the policy.
 * Different root identities have separate result caches, even when they share view-schema definitions.
 * Treat the returned schema as immutable.
 * Callbacks may reuse completed cached schema data, but must not start nested derived-schema initialization or conversion.
 * If schema evaluation or conversion throws, continued use of the affected schemas is unsupported.
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
 * Throws a `UsageError` if a callback starts nested schema initialization.
 */
export function toStoredSchema(
	root: ImplicitFieldSchema,
	options: StagedSchemaUpgradePolicy,
): TreeStoredSchema {
	return getRootSchemaDerivedData(root).getStoredSchema(options);
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
					// Allowed type staging
					for (const field of getTreeNodeSchemaPrivateData(schema).childAllowedTypes) {
						const allowedTypes = normalizeAndEvaluateAnnotatedAllowedTypes(field);
						hasStagedSchema ||= allowedTypes.hasStagedTypes;
						for (const type of allowedTypes.types) {
							if (!identities.has(type.type)) {
								dependencies.add(getCompletedComponent(type.type));
							}
						}
					}

					// Optional-field staging
					if (isObjectNodeSchema(schema)) {
						for (const field of schema.fields.values()) {
							hasStagedSchema ||= field.isStagedOptional !== false;
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
 * Retrieves completed unfiltered analysis; callers must first discover the schema's component.
 */
function getCompletedComponent(schema: TreeNodeSchema): SchemaComponent {
	const component = schemaComponentCache.get(schema);
	assert(component !== undefined, 0xda4 /* Expected completed schema component */);
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
