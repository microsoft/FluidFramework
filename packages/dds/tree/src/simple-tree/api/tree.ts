/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidLoadable, IDisposable, Listenable } from "@fluidframework/core-interfaces";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type {
	CommitMetadata,
	RevertibleAlphaFactory,
	RevertibleFactory,
} from "../../core/index.js";

import type {
	// This is referenced by doc comments.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports
	TreeAlpha,
} from "../../shared-tree/index.js";

import {
	type ImplicitFieldSchema,
	type InsertableField,
	type InsertableTreeFieldFromImplicitField,
	type ReadableField,
	type ReadSchema,
	type TreeFieldFromImplicitField,
	type UnsafeUnknownSchema,
	FieldKind,
	markSchemaMostDerived,
} from "../schemaTypes.js";
import { NodeKind, type TreeNodeSchema } from "../core/index.js";
import { toStoredSchema } from "../toStoredSchema.js";
import { LeafNodeSchema } from "../leafNodeSchema.js";
import { assert } from "@fluidframework/core-utils/internal";
import { isObjectNodeSchema, type ObjectNodeSchema } from "../objectNodeTypes.js";
import { fail, getOrCreate } from "../../util/index.js";
import type { MakeNominal } from "../../util/index.js";
import { walkFieldSchema } from "../walkFieldSchema.js";
import type { VerboseTree } from "./verboseTree.js";
import type { SimpleTreeSchema } from "./simpleSchema.js";
import type {
	RunTransactionParams,
	TransactionCallbackStatus,
	TransactionResult,
	TransactionResultExt,
	VoidTransactionCallbackStatus,
} from "./transactionTypes.js";
/**
 * A tree from which a {@link TreeView} can be created.
 *
 * @privateRemarks
 * TODO:
 * Add stored key versions of {@link TreeAlpha.(exportVerbose:2)}, {@link TreeAlpha.(exportConcise:2)} and {@link TreeAlpha.exportCompressed} here so tree content can be accessed without a view schema.
 * Add exportSimpleSchema and exportJsonSchema methods (which should exactly match the concise format, and match the free functions for exporting view schema).
 * Maybe rename "exportJsonSchema" to align on "concise" terminology.
 * Ensure schema exporting APIs here align and reference APIs for exporting view schema to the same formats (which should include stored vs property key choice).
 * Make sure users of independentView can use these export APIs (maybe provide a reference back to the ViewableTree from the TreeView to accomplish that).
 * @system @sealed @public
 */
export interface ViewableTree {
	/**
	 * Returns a {@link TreeView} using the provided schema.
	 * If the stored schema is compatible with the view schema specified by `config`,
	 * the returned {@link TreeView} will expose the root with a schema-aware API based on the provided view schema.
	 * If the provided schema is incompatible with the stored schema, the view will instead expose a status indicating the incompatibility.
	 *
	 * @remarks
	 * If the tree is uninitialized (has no schema and no content), use {@link TreeView.initialize} on the returned view to set the schema and content together.
	 * Using `viewWith` followed by {@link TreeView.upgradeSchema} to initialize only the schema for a document is technically valid when the schema
	 * permits trees with no content.
	 *
	 * Note that other clients can modify the document at any time, causing the view to change its compatibility status: see {@link TreeView.events} for how to handle invalidation in these cases.
	 *
	 * Only one schematized view may exist for a given ITree at a time.
	 * If creating a second, the first must be disposed before calling `viewWith` again.
	 *
	 *
	 * TODO: Provide a way to make a generic view schema for any document.
	 * TODO: Support adapters for handling out-of-schema data.
	 *
	 * Doing initialization here allows a small API that is hard to use incorrectly.
	 * Other approaches tend to have easy-to-make mistakes.
	 * For example, having a separate initialization function means apps can forget to call it, making an app that can only open existing documents,
	 * or call it unconditionally leaving an app that can only create new documents.
	 * It also would require the schema to be passed into separate places and could cause issues if they didn't match.
	 * Since the initialization function couldn't return a typed tree, the type checking wouldn't help catch that.
	 * Also, if an app manages to create a document, but the initialization fails to get persisted, an app that only calls the initialization function
	 * on the create code-path (for example how a schematized factory might do it),
	 * would leave the document in an unusable state which could not be repaired when it is reopened (by the same or other clients).
	 * Additionally, once out of schema content adapters are properly supported (with lazy document updates),
	 * this initialization could become just another out of schema content adapter and this initialization is no longer a special case.
	 */
	viewWith<TRoot extends ImplicitFieldSchema>(
		config: TreeViewConfiguration<TRoot>,
	): TreeView<TRoot>;
}

/**
 * Channel for a Fluid Tree DDS.
 * @remarks
 * Allows storing and collaboratively editing schema-aware hierarchial data.
 * @sealed @public
 */
export interface ITree extends ViewableTree, IFluidLoadable {}

/**
 * {@link ITree} extended with some alpha APIs.
 * @privateRemarks
 * TODO: Promote this to alpha.
 * @internal
 */
export interface ITreeAlpha extends ITree {
	/**
	 * Exports root in the same format as {@link TreeAlpha.(exportVerbose:1)} using stored keys.
	 * @remarks
	 * This is `undefined` if and only if the root field is empty (this can only happen if the root field is optional).
	 */
	exportVerbose(): VerboseTree | undefined;

	/**
	 * Exports the SimpleTreeSchema that is stored in the tree, using stored keys for object fields.
	 * @remarks
	 * To get the schema using property keys, use {@link getSimpleSchema} on the view schema.
	 */
	exportSimpleSchema(): SimpleTreeSchema;
}

/**
 * Options when constructing a tree view.
 * @public
 */
export interface ITreeConfigurationOptions {
	/**
	 * If `true`, the tree will validate new content against its stored schema at insertion time
	 * and throw an error if the new content doesn't match the expected schema.
	 *
	 * @defaultValue `false`.
	 *
	 * @remarks Enabling schema validation has a performance penalty when inserting new content into the tree because
	 * additional checks are done. Enable this option only in scenarios where you are ok with that operation being a
	 * bit slower.
	 */
	enableSchemaValidation?: boolean;

	/**
	 * A flag used to opt into strict rules ensuring that the schema avoids cases which can make the type of nodes ambiguous when importing or exporting data.
	 * @defaultValue `false`.
	 *
	 * @remarks
	 * When this is true, it ensures that the compile time type safety for data when constructing nodes is sufficient to ensure that the runtime behavior will not give node data ambiguity errors.
	 *
	 * This ensures that the canonical JSON-like representation of all unions in the tree are lossless and unambiguous.
	 * This canonical JSON-like representation consists of arrays, plain old JavaScript objects with string keys, booleans, numbers (excluding NaN, -0 and infinities), strings, null and {@link @fluidframework/core-interfaces#IFluidHandle}s.
	 * It is compatible with the node creation APIs (such as schema class constructors) and is also compatible with JSON assuming any IFluidHandles get special handling (since they are not JSON compatible).
	 * Currently these cases can cause ambiguity in a union:
	 *
	 * - More than one ArrayNode type: it's impossible to tell which array type is intended in the case of empty arrays (`[]`).
	 *
	 * - More than one MapNode type: it's impossible to tell which map type is intended in the case of an empty map (`{}`).
	 *
	 * - Both a MapNode and an ArrayNode: this case is not a problem for the canonical JSON representation, but is an issue when constructing from an Iterable, which is supported for both MapNode and ArrayNode.
	 *
	 * - Both a MapNode and an ObjectNode: when the input is valid for the ObjectNode, the current parser always considers it ambiguous with being a MapNode.
	 *
	 * - ObjectNodes which have fields (required or optional) which include all required fields of another ObjectNode: currently each ObjectNode is differentiated by the presence of its required fields.
	 *
	 * This check is conservative: some complex cases may error if the current simple algorithm cannot show no ambiguity is possible.
	 * This check may become more permissive over time.
	 *
	 * @example Ambiguous schema (with `preventAmbiguity: false`), and how to disambiguate it using {@link Unhydrated} nodes:
	 * ```typescript
	 * const schemaFactory = new SchemaFactory("com.example");
	 * class Feet extends schemaFactory.object("Feet", { length: schemaFactory.number }) {}
	 * class Meters extends schemaFactory.object("Meters", { length: schemaFactory.number }) {}
	 * const config = new TreeViewConfiguration({
	 * 	// This combination of schema can lead to ambiguous cases and will error if `preventAmbiguity` is true.
	 * 	schema: [Feet, Meters],
	 * 	preventAmbiguity: false,
	 * });
	 * const view = tree.viewWith(config);
	 * // This is invalid since it is ambiguous which type of node is being constructed:
	 * // view.initialize({ length: 5 });
	 * // To work, an explicit type can be provided by using an {@link Unhydrated} Node:
	 * view.initialize(new Meters({ length: 5 }));
	 * ```
	 *
	 * @example Schema disambiguated by adjusting field names, validated with `preventAmbiguity: true:`
	 * ```typescript
	 * const schemaFactory = new SchemaFactory("com.example");
	 * class Feet extends schemaFactory.object("Feet", { length: schemaFactory.number }) {}
	 * class Meters extends schemaFactory.object("Meters", {
	 * 	// To avoid ambiguity when parsing unions of Feet and Meters, this renames the length field to "meters".
	 * 	// To preserve compatibility with existing data from the ambiguous case,
	 * 	// `{ key: "length" }` is set, so when persisted in the tree "length" is used as the field name.
	 * 	meters: schemaFactory.required(schemaFactory.number, { key: "length" }),
	 * }) {}
	 * const config = new TreeViewConfiguration({
	 * 	// This combination of schema is not ambiguous because `Feet` and `Meters` have different required keys.
	 * 	schema: [Feet, Meters],
	 * 	preventAmbiguity: true,
	 * });
	 * const view = tree.viewWith(config);
	 * // This now works, since the field is sufficient to determine this is a `Meters` node.
	 * view.initialize({ meters: 5 });
	 * ```
	 *
	 * @privateRemarks
	 * In the future, we can support lossless round tripping via the canonical JSON-like representation above when unambiguous.
	 * This could be done via methods added to `Tree` to export and import such objects, which would give us a place to explicitly define the type of this representation.
	 *
	 * To make this more permissive in the future we can:
	 *
	 * - Make toMapTree more permissive (ex: allow disambiguation based on leaf type)
	 * - Update this check to more tightly match toMapTree
	 * - Add options to help schema authors disambiguate their types, such as "constant fields" which are not persisted, and always have a constant value.
	 *
	 * The above examples exist in executable form in this files tests, and should be updated there then copied back here.
	 */
	readonly preventAmbiguity?: boolean;
}

const defaultTreeConfigurationOptions: Required<ITreeConfigurationOptions> = {
	enableSchemaValidation: false,
	preventAmbiguity: false,
};

/**
 * Property-bag configuration for {@link TreeViewConfiguration} construction.
 * @public
 */
export interface ITreeViewConfiguration<
	TSchema extends ImplicitFieldSchema = ImplicitFieldSchema,
> extends ITreeConfigurationOptions {
	/**
	 * The schema which the application wants to view the tree with.
	 */
	readonly schema: TSchema;
}

/**
 * Configuration for {@link ViewableTree.viewWith}.
 * @sealed @public
 */
export class TreeViewConfiguration<
	const TSchema extends ImplicitFieldSchema = ImplicitFieldSchema,
> implements Required<ITreeViewConfiguration<TSchema>>
{
	protected _typeCheck!: MakeNominal;

	/**
	 * {@inheritDoc ITreeViewConfiguration.schema}
	 */
	public readonly schema: TSchema;

	/**
	 * {@inheritDoc ITreeConfigurationOptions.enableSchemaValidation}
	 */
	public readonly enableSchemaValidation: boolean;

	/**
	 * {@inheritDoc ITreeConfigurationOptions.preventAmbiguity}
	 */
	public readonly preventAmbiguity: boolean;

	/**
	 * Construct a new {@link TreeViewConfiguration}.
	 *
	 * @param props - Property bag of configuration options.
	 *
	 * @remarks
	 * Performing this construction deeply validates the provided schema.
	 * This means that when this constructor is called, all {@link LazyItem} {@link TreeNodeSchema} references will be evaluated (using {@link evaluateLazySchema}).
	 * This means that the declarations for all transitively reachable {@link TreeNodeSchema} must be available at this time.
	 *
	 * For example, a schema reachable from this configuration cannot reference this configuration during its declaration,
	 * since this would be a cyclic dependency that will cause an error when constructing this configuration.
	 */
	public constructor(props: ITreeViewConfiguration<TSchema>) {
		const config = { ...defaultTreeConfigurationOptions, ...props };
		this.schema = config.schema;
		this.enableSchemaValidation = config.enableSchemaValidation;
		this.preventAmbiguity = config.preventAmbiguity;

		// Ambiguity errors are lower priority to report than invalid schema errors, so collect these in an array and report them all at once.
		const ambiguityErrors: string[] = [];

		walkFieldSchema(config.schema, {
			// Ensure all reachable schema are marked as most derived.
			// This ensures if multiple schema extending the same schema factory generated class are present (or have been constructed, or get constructed in the future),
			// an error is reported.

			node: (schema) => markSchemaMostDerived(schema, true),
			allowedTypes(types): void {
				if (config.preventAmbiguity) {
					checkUnion(types, ambiguityErrors);
				}
			},
		});

		if (ambiguityErrors.length !== 0) {
			// Duplicate errors are common since when two types conflict, both orders error:
			const deduplicated = new Set(ambiguityErrors);
			throw new UsageError(`Ambiguous schema found:\n${[...deduplicated].join("\n")}`);
		}

		// Eagerly perform this conversion to surface errors sooner.
		toStoredSchema(config.schema);
	}
}

/**
 * Pretty print a set of types for use in error messages.
 */
function formatTypes(allowed: Iterable<TreeNodeSchema>): string {
	// Use JSON.stringify to quote and escape identifiers.
	// Don't just use a single array JSON.stringify since that omits spaces between items
	return `[${Array.from(allowed, (s) => JSON.stringify(s.identifier)).join(", ")}]`;
}

/**
 * Detect cases documented in {@link ITreeConfigurationOptions.preventAmbiguity}.
 */
export function checkUnion(union: Iterable<TreeNodeSchema>, errors: string[]): void {
	const checked: Set<TreeNodeSchema> = new Set();
	const maps: TreeNodeSchema[] = [];
	const arrays: TreeNodeSchema[] = [];

	const objects: ObjectNodeSchema[] = [];
	// Map from key to schema using that key
	const allObjectKeys: Map<string, Set<TreeNodeSchema>> = new Map();

	for (const schema of union) {
		if (checked.has(schema)) {
			throw new UsageError(`Duplicate schema in allowed types: ${schema.identifier}`);
		}
		checked.add(schema);

		if (schema instanceof LeafNodeSchema) {
			// nothing to do
		} else if (isObjectNodeSchema(schema)) {
			objects.push(schema);
			for (const key of schema.fields.keys()) {
				getOrCreate(allObjectKeys, key, () => new Set()).add(schema);
			}
		} else if (schema.kind === NodeKind.Array) {
			arrays.push(schema);
		} else {
			assert(schema.kind === NodeKind.Map, 0x9e7 /* invalid schema */);
			maps.push(schema);
		}
	}

	if (arrays.length > 1) {
		errors.push(
			`More than one kind of array allowed within union (${formatTypes(arrays)}). This would require type disambiguation which is not supported by arrays during import or export.`,
		);
	}

	if (maps.length > 1) {
		errors.push(
			`More than one kind of map allowed within union (${formatTypes(maps)}). This would require type disambiguation which is not supported by maps during import or export.`,
		);
	}

	if (maps.length > 0 && arrays.length > 0) {
		errors.push(
			`Both a map and an array allowed within union (${formatTypes([...arrays, ...maps])}). Both can be implicitly constructed from iterables like arrays, which are ambiguous when the array is empty.`,
		);
	}

	if (objects.length > 0 && maps.length > 0) {
		errors.push(
			`Both a object and a map allowed within union (${formatTypes([...objects, ...maps])}). Both can be constructed from objects and can be ambiguous.`,
		);
	}

	// Check for objects which fully overlap:
	for (const schema of objects) {
		// All objects which might be ambiguous relative to `schema`.
		const possiblyAmbiguous = new Set(objects);

		// A schema can't be ambiguous with itself
		possiblyAmbiguous.delete(schema);

		// For each field of schema, remove schema from possiblyAmbiguous that do not have that field
		for (const [key, field] of schema.fields) {
			if (field.kind === FieldKind.Required) {
				const withKey = allObjectKeys.get(key) ?? fail(0xb35 /* missing schema */);
				for (const candidate of possiblyAmbiguous) {
					if (!withKey.has(candidate)) {
						possiblyAmbiguous.delete(candidate);
					}
				}
			}
		}

		if (possiblyAmbiguous.size > 0) {
			// TODO: make this check more permissive.
			// Allow using the type of the field to disambiguate, at least for leaf types.
			// Add "constant" fields which can be used to disambiguate even more cases without adding persisted data: maybe make them optional in constructor?
			// Consider separating unambiguous implicit construction format from constructor arguments at type level, allowing constructor to superset the implicit construction options (ex: optional constant fields).
			// The policy here however must remain at least as conservative as shallowCompatibilityTest in src/simple-tree/toMapTree.ts.

			errors.push(
				`The required fields of ${JSON.stringify(schema.identifier)} are insufficient to differentiate it from the following types: ${formatTypes(possiblyAmbiguous)}. For objects to be considered unambiguous, each must have required fields that do not all occur on any other object in the union.`,
			);
		}
	}
}

/**
 * A collection of functionality associated with a (version-control-style) branch of a SharedTree.
 * @remarks A `TreeBranch` allows for the {@link TreeBranch.fork | creation of branches} and for those branches to later be {@link TreeBranch.merge | merged}.
 *
 * The `TreeBranch` for a specific {@link TreeNode} may be acquired by calling `TreeAlpha.branch`.
 *
 * A branch does not necessarily know the schema of its SharedTree - to convert a branch to a {@link TreeViewAlpha | view with a schema}, use {@link TreeBranch.hasRootSchema | hasRootSchema()}.
 *
 * The branch associated directly with the {@link ITree | SharedTree} is the "main" branch, and all other branches fork (directly or transitively) from that main branch.
 * @sealed @alpha
 */
export interface TreeBranch extends IDisposable {
	/**
	 * Events for the branch
	 */
	readonly events: Listenable<TreeBranchEvents>;

	/**
	 * Returns true if this branch has the given schema as its root schema.
	 * @remarks This is a type guard which allows this branch to become strongly typed as a {@link TreeViewAlpha | view} of the given schema.
	 *
	 * To succeed, the given schema must be invariant to the schema of the view - it must include exactly the same allowed types.
	 * For example, a schema of `Foo | Bar` will not match a view schema of `Foo`, and likewise a schema of `Foo` will not match a view schema of `Foo | Bar`.
	 * @example
	 * ```typescript
	 * if (branch.hasRootSchema(MySchema)) {
	 *   const { root } = branch; // `branch` is now a TreeViewAlpha<MySchema>
	 *   // ...
	 * }
	 * ```
	 */
	hasRootSchema<TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
	): this is TreeViewAlpha<TSchema>;

	/**
	 * Fork a new branch off of this branch which is based off of this branch's current state.
	 * @remarks Any changes to the tree on the new branch will not apply to this branch until the new branch is e.g. {@link TreeBranch.merge | merged} back into this branch.
	 * The branch should be disposed when no longer needed, either {@link TreeBranch.dispose | explicitly} or {@link TreeBranch.merge | implicitly when merging} into another branch.
	 */
	fork(): TreeBranch;

	/**
	 * Apply all the new changes on the given branch to this branch.
	 * @param branch - a branch which was created by a call to `branch()`.
	 * @param disposeMerged - whether or not to dispose `branch` after the merge completes.
	 * Defaults to true.
	 * The {@link TreeBranch | main branch} cannot be disposed - attempting to do so will have no effect.
	 * @remarks All ongoing transactions (if any) in `branch` will be committed before the merge.
	 */
	merge(branch: TreeBranch, disposeMerged?: boolean): void;

	/**
	 * Advance this branch forward such that all new changes on the target branch become part of this branch.
	 * @param branch - The branch to rebase onto.
	 * @remarks After rebasing, this branch will be "ahead" of the target branch, that is, its unique changes will have been recreated as if they happened after all changes on the target branch.
	 * This method may only be called on branches produced via {@link TreeBranch.fork | branch} - attempting to rebase the main branch will throw.
	 *
	 * Rebasing long-lived branches is important to avoid consuming memory unnecessarily.
	 * In particular, the SharedTree retains all sequenced changes made to the tree since the "most-behind" branch was created or last rebased.
	 *
	 * The {@link TreeBranch | main branch} cannot be rebased onto another branch - attempting to do so will throw an error.
	 */
	rebaseOnto(branch: TreeBranch): void;

	/**
	 * Dispose of this branch, cleaning up any resources associated with it.
	 * @param error - Optional error indicating the reason for the disposal, if the object was disposed as the result of an error.
	 * @remarks Branches can also be automatically disposed when {@link TreeBranch.merge | they are merged} into another branch.
	 *
	 * Disposing branches is important to avoid consuming memory unnecessarily.
	 * In particular, the SharedTree retains all sequenced changes made to the tree since the "most-behind" branch was created or last {@link TreeBranch.rebaseOnto | rebased}.
	 *
	 * The {@link TreeBranch | main branch} cannot be disposed - attempting to do so will have no effect.
	 */
	dispose(error?: Error): void;
}

/**
 * An editable view of a (version control style) branch of a shared tree based on some schema.
 *
 * This schema--known as the view schema--may or may not align the stored schema of the document.
 * Information about discrepancies between the two schemas is available via {@link TreeView.compatibility | compatibility}.
 *
 * Application authors are encouraged to read [schema-evolution.md](../../docs/user-facing/schema-evolution.md) and
 * choose a schema compatibility policy that aligns with their application's needs.
 *
 * @privateRemarks
 * From an API design perspective, `upgradeSchema` could be merged into `viewWith` and/or `viewWith` could return errors explicitly on incompatible documents.
 * Such approaches would make it discoverable that out of schema handling may need to be done.
 * Doing that would however complicate trivial "hello world" style example slightly, as well as be a breaking API change.
 * It also seems more complex to handle invalidation with that pattern.
 * Thus this design was chosen at the risk of apps blindly accessing `root` then breaking unexpectedly when the document is incompatible.
 *
 * @see {@link TreeViewAlpha}
 * @see {@link asTreeViewAlpha}
 *
 * @sealed @public
 */
export interface TreeView<in out TSchema extends ImplicitFieldSchema> extends IDisposable {
	/**
	 * The current root of the tree.
	 *
	 * If the view schema not sufficiently compatible with the stored schema, accessing this will throw.
	 * To handle this case, check {@link TreeView.compatibility | compatibility}'s {@link SchemaCompatibilityStatus.canView | canView} before using.
	 *
	 * To get notified about changes to this field,
	 * use {@link TreeViewEvents.rootChanged} via `view.events.on("rootChanged", callback)`.
	 *
	 * To get notified about changes to stored schema (which may affect compatibility between this view's schema and
	 * the stored schema), use {@link TreeViewEvents.schemaChanged} via `view.events.on("schemaChanged", callback)`.
	 */
	get root(): TreeFieldFromImplicitField<TSchema>;

	set root(newRoot: InsertableTreeFieldFromImplicitField<TSchema>);

	/**
	 * Description of the current compatibility status between the view schema and stored schema.
	 *
	 * {@link TreeViewEvents.schemaChanged} is fired when the compatibility status changes.
	 */
	readonly compatibility: SchemaCompatibilityStatus;

	/**
	 * When the schemas are not an exact match and {@link SchemaCompatibilityStatus.canUpgrade} is true,
	 * this can be used to modify the stored schema to make it match the view schema.
	 * This will update the compatibility state, and allow access to `root`.
	 * Beware that this may impact other clients' ability to view the document depending on the application's schema compatibility policy!
	 * @remarks
	 * It is an error to call this when {@link SchemaCompatibilityStatus.canUpgrade} is false, and a no-op when the stored and view schema are already an exact match.
	 * @privateRemarks
	 * In the future, more upgrade options could be provided here.
	 * Some options that could be added:
	 * - check the actual document contents (not just the schema) and attempt an atomic document update if the data is compatible.
	 * - apply converters and upgrade the document.
	 * - apply converters to lazily to adapt the document to the requested view schema (with optional lazy schema updates or transparent conversions on write).
	 */
	upgradeSchema(): void;

	/**
	 * Initialize the tree, setting the stored schema to match this view's schema and setting the tree content.
	 *
	 * Only valid to call when this view's {@link SchemaCompatibilityStatus.canInitialize} is true.
	 *
	 * Applications should typically call this function before attaching a `SharedTree`.
	 * @param content - The content to initialize the tree with.
	 */
	initialize(content: InsertableTreeFieldFromImplicitField<TSchema>): void;

	/**
	 * Events for the tree.
	 */
	readonly events: Listenable<TreeViewEvents>;

	/**
	 * The view schema used by this TreeView.
	 */
	readonly schema: TSchema;
}

/**
 * {@link TreeView} with proposed changes to the schema aware typing to allow use with `UnsafeUnknownSchema`.
 * @sealed @alpha
 */
export interface TreeViewAlpha<
	in out TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema,
> extends Omit<TreeView<ReadSchema<TSchema>>, "root" | "initialize">,
		TreeBranch {
	get root(): ReadableField<TSchema>;

	set root(newRoot: InsertableField<TSchema>);

	readonly events: Listenable<TreeViewEvents & TreeBranchEvents>;

	initialize(content: InsertableField<TSchema>): void;

	// Override the base branch method to return a typed view rather than merely a branch.
	fork(): ReturnType<TreeBranch["fork"]> & TreeViewAlpha<TSchema>;

	/**
	 * Run a transaction which applies one or more edits to the tree as a single atomic unit.
	 * @param transaction - The function to run as the body of the transaction.
	 * It should return a status object of {@link TransactionCallbackStatus | TransactionCallbackStatus } type.
	 * It includes a "rollback" property which may be returned as true at any point during the transaction. This will
	 * abort the transaction and discard any changes it made so far.
	 * "rollback" can be set to false or left undefined to indicate that the body of the transaction has successfully run.
	 * @param params - The optional parameters for the transaction. It includes the constraints that will be checked before the transaction begins.
	 * @returns A result object of {@link TransactionResultExt | TransactionResultExt} type. It includes the following:
	 * - A "success" flag indicating whether the transaction was successful or not.
	 * - The success of failure value as returned by the transaction function.
	 * @remarks
	 * This API will throw an error if the constraints are not met or something unexpected happens.
	 * All of the changes in the transaction are applied synchronously and therefore no other changes (either from this client or from a remote client) can be interleaved with those changes.
	 * Note that this is guaranteed by Fluid for any sequence of changes that are submitted synchronously, whether in a transaction or not.
	 * However, using a transaction has the following additional consequences:
	 * - If reverted (e.g. via an "undo" operation), all the changes in the transaction are reverted together.
	 * - The internal data representation of a transaction with many changes is generally smaller and more efficient than that of the changes when separate.
	 *
	 * Local change events will be emitted for each change as the transaction is being applied.
	 * If the transaction is rolled back, a corresponding change event will also be emitted for the rollback.
	 *
	 * Nested transactions:
	 * This API can be called from within the transaction callback of another runTransaction call. That will have slightly different behavior:
	 * - If the inner transaction fails, only the inner transaction will be rolled back and the outer transaction will continue.
	 * - Constraints will apply to the outermost transaction. Constraints are applied per commit and there will be one commit generated
	 * for the outermost transaction which includes all inner transactions.
	 * - Undo will undo the outermost transaction and all inner transactions.
	 */
	runTransaction<TSuccessValue, TFailureValue>(
		transaction: () => TransactionCallbackStatus<TSuccessValue, TFailureValue>,
		params?: RunTransactionParams,
	): TransactionResultExt<TSuccessValue, TFailureValue>;
	/**
	 * Run a transaction which applies one or more edits to the tree as a single atomic unit.
	 * @param transaction - The function to run as the body of the transaction. It may return the following:
	 * - Nothing to indicate that the body of the transaction has successfully run.
	 * - A status object of {@link VoidTransactionCallbackStatus | VoidTransactionCallbackStatus } type. It includes a "rollback" property which
	 * may be returned as true at any point during the transaction. This will abort the transaction and discard any changes it made so
	 * far. "rollback" can be set to false or left undefined to indicate that the body of the transaction has successfully run.
	 * @param params - The optional parameters for the transaction. It includes the constraints that will be checked before the transaction begins.
	 * @returns A result object of {@link TransactionResult | TransactionResult} type. It includes a "success" flag indicating whether the
	 * transaction was successful or not.
	 * @remarks
	 * This API will throw an error if the constraints are not met or something unexpected happens.
	 * All of the changes in the transaction are applied synchronously and therefore no other changes (either from this client or from a remote client) can be interleaved with those changes.
	 * Note that this is guaranteed by Fluid for any sequence of changes that are submitted synchronously, whether in a transaction or not.
	 * However, using a transaction has the following additional consequences:
	 * - If reverted (e.g. via an "undo" operation), all the changes in the transaction are reverted together.
	 * - The internal data representation of a transaction with many changes is generally smaller and more efficient than that of the changes when separate.
	 *
	 * Local change events will be emitted for each change as the transaction is being applied.
	 * If the transaction is rolled back, a corresponding change event will also be emitted for the rollback.
	 *
	 * Nested transactions:
	 * This API can be called from within the transaction callback of another runTransaction call. That will have slightly different behavior:
	 * - If the inner transaction fails, only the inner transaction will be rolled back and the outer transaction will continue.
	 * - Constraints will apply to the outermost transaction. Constraints are applied per commit and there will be one commit generated
	 * for the outermost transaction which includes all inner transactions.
	 * - Undo will undo the outermost transaction and all inner transactions.
	 */
	runTransaction(
		transaction: () => VoidTransactionCallbackStatus | void,
		params?: RunTransactionParams,
	): TransactionResult;
}

/**
 * Information about a view schema's compatibility with the document's stored schema.
 *
 * See SharedTree's README for more information about choosing a compatibility policy.
 * @sealed @public
 */
export interface SchemaCompatibilityStatus {
	/**
	 * Whether the view schema allows exactly the same set of documents as the stored schema.
	 *
	 * @remarks
	 * Equivalence here is defined in terms of allowed documents because there are some degenerate cases where schemas are not
	 * exact matches in a strict (schema-based) sense but still allow the same documents, and the document notion is more useful to applications.
	 *
	 * Examples which are expressible where this may occur include:
	 * - schema repository `A` has extra schema which schema `B` doesn't have, but they are unused (i.e. not reachable from the root schema)
	 * - field in schema `A` has allowed field members which the corresponding field in schema `B` does not have, but those types are not constructible (ex: an object node type containing a required field with no allowed types)
	 *
	 * These cases are typically not interesting to applications.
	 */
	readonly isEquivalent: boolean;

	/**
	 * Whether the current view schema is sufficiently compatible with the stored schema to allow viewing tree data.
	 * If false, {@link TreeView.root} will throw upon access.
	 *
	 * Currently, this field is true iff `isEquivalent` is true.
	 * Do not rely on this:
	 * there are near-term plans to extend support for viewing documents when the stored schema contains additional optional fields not present in the view schema.
	 * The other two types of backward-compatible changes (field relaxations and addition of allowed field types) will eventually be supported as well,
	 * likely through out-of-schema content adapters that the application can provide alongside their view schema.
	 *
	 * Be aware that even with these SharedTree limitations fixed, application logic may not correctly tolerate the documents allowable by the stored schema!
	 * Application authors are encouraged to read docs/user-facing/schema-evolution.md and choose a schema compatibility policy that
	 * aligns with their application's needs.
	 *
	 * @remarks
	 * When the documents allowed by the view schema is a strict superset of those by the stored schema,
	 * this is false because writes to the document using the view schema could make the document violate its stored schema.
	 * In this case, the stored schema could be updated to match the provided view schema, allowing read-write access to the tree.
	 * See {@link SchemaCompatibilityStatus.canUpgrade}.
	 *
	 * Future version of SharedTree may provide readonly access to the document in this case because that would be safe,
	 * but this is not currently supported.
	 *
	 * @privateRemarks
	 * A necessary condition for this to be true is that the documents allowed by the view schema are a subset of those allowed by the stored schema.
	 * This is not sufficient: the simple-tree layer's read APIs do not tolerate out-of-schema data.
	 * For example, if the view schema for a node has a required `Point` field but the stored schema has an optional `Point` field,
	 * read APIs on the view schema do not work correctly when the document has a node with a missing `Point` field.
	 * Similar issues happen when the view schema has a field with less allowed types than the stored schema and the document actually leverages those types.
	 */
	readonly canView: boolean;

	/**
	 * True iff the view schema supports all possible documents permitted by the stored schema.
	 * When true, it is valid to call {@link TreeView.upgradeSchema} (though if the stored schema is already an exact match, this is a no-op).
	 */
	readonly canUpgrade: boolean;

	/**
	 * True iff the document is uninitialized (i.e. it has no schema and no content).
	 *
	 * To initialize the document, call {@link TreeView.initialize}.
	 *
	 * @remarks
	 * It's not necessary to check this field before calling {@link TreeView.initialize} in most scenarios; application authors typically know from
	 * branch that they're in a flow which creates a new `SharedTree` and would like to initialize it.
	 */
	readonly canInitialize: boolean;

	// TODO: Consider extending this status to include:
	// - application-defined metadata about the stored schema
	// - details about the differences between the stored and view schema sufficient for implementing "safe mismatch" policies
}

/**
 * Events for {@link TreeBranch}.
 * @sealed @alpha
 */
export interface TreeBranchEvents {
	/**
	 * The stored schema for the document has changed.
	 */
	schemaChanged(): void;

	/**
	 * Fired when a change is made to the branch. Includes data about the change that is made which listeners
	 * can use to filter on changes they care about (e.g. local vs. remote changes).
	 *
	 * @param data - information about the change
	 * @param getRevertible - a function that allows users to get a revertible for the change. If not provided,
	 * this change is not revertible.
	 */
	changed(data: CommitMetadata, getRevertible?: RevertibleAlphaFactory): void;

	/**
	 * Fired when:
	 * - a local commit is applied outside of a transaction
	 * - a local transaction is committed
	 *
	 * The event is not fired when:
	 * - a local commit is applied within a transaction
	 * - a remote commit is applied
	 *
	 * @param data - information about the commit that was applied
	 * @param getRevertible - a function provided that allows users to get a revertible for the commit that was applied. If not provided,
	 * this commit is not revertible.
	 */
	commitApplied(data: CommitMetadata, getRevertible?: RevertibleAlphaFactory): void;
}

/**
 * Events for {@link TreeView}.
 * @sealed @public
 */
export interface TreeViewEvents {
	/**
	 * Raised whenever {@link TreeView.root} is invalidated.
	 *
	 * This includes changes to the document schema.
	 * It also includes changes to the field containing the root such as setting or clearing an optional root or changing which node is the root.
	 * This does NOT include changes to the content (fields/children) of the root node: for that case subscribe to events on the root node.
	 */
	rootChanged(): void;

	/**
	 * The stored schema for the document has changed.
	 * This may affect the compatibility between the view schema and the stored schema, and thus the ability to use the view.
	 *
	 * @remarks
	 * This event implies that the old {@link TreeView.root} is no longer valid, but applications need not handle that separately:
	 * {@link TreeViewEvents.rootChanged} will be fired after this event.
	 */
	schemaChanged(): void;

	/**
	 * Fired when:
	 * - a local commit is applied outside of a transaction
	 * - a local transaction is committed
	 *
	 * The event is not fired when:
	 * - a local commit is applied within a transaction
	 * - a remote commit is applied
	 *
	 * @param data - information about the commit that was applied
	 * @param getRevertible - a function provided that allows users to get a revertible for the commit that was applied. If not provided,
	 * this commit is not revertible.
	 */
	commitApplied(data: CommitMetadata, getRevertible?: RevertibleFactory): void;
}

/**
 * Retrieve the {@link TreeViewAlpha | alpha API} for a {@link TreeView}.
 * @alpha
 */
export function asTreeViewAlpha<TSchema extends ImplicitFieldSchema>(
	view: TreeView<TSchema>,
): TreeViewAlpha<TSchema> {
	return view as TreeViewAlpha<TSchema>;
}
