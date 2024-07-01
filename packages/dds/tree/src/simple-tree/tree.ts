/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidLoadable, IDisposable } from "@fluidframework/core-interfaces";

import type { CommitMetadata } from "../core/index.js";
import type { Listenable } from "../events/index.js";
import type { RevertibleFactory } from "../shared-tree/index.js";

import type {
	ImplicitFieldSchema,
	InsertableTreeFieldFromImplicitField,
	TreeFieldFromImplicitField,
} from "./schemaTypes.js";

/**
 * Channel for a Fluid Tree DDS.
 * @remarks
 * Allows storing and collaboratively editing schema-aware hierarchial data.
 * @sealed @public
 */
export interface ITree extends IFluidLoadable {
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
	 * @privateRemarks
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
}

const defaultTreeConfigurationOptions: Required<ITreeConfigurationOptions> = {
	enableSchemaValidation: false,
};

/**
 * Property-bag configuration for {@link TreeViewConfiguration} construction.
 * @public
 */
export interface ITreeViewConfiguration<
	TSchema extends ImplicitFieldSchema = ImplicitFieldSchema,
> {
	/**
	 * The schema which the application wants to view the tree with.
	 */
	readonly schema: TSchema;

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
	readonly enableSchemaValidation?: boolean;
}

/**
 * Configuration for {@link ITree.viewWith}.
 * @sealed @public
 */
export class TreeViewConfiguration<TSchema extends ImplicitFieldSchema = ImplicitFieldSchema>
	implements Required<ITreeViewConfiguration<TSchema>>
{
	/**
	 * {@inheritDoc ITreeViewConfiguration.schema}
	 */
	public readonly schema: TSchema;

	/**
	 * {@inheritDoc ITreeViewConfiguration.enableSchemaValidation}
	 */
	public readonly enableSchemaValidation: boolean;

	/**
	 * @param props - Property bag of configuration options.
	 */
	public constructor(props: ITreeViewConfiguration<TSchema>) {
		const config = { ...defaultTreeConfigurationOptions, ...props };
		this.schema = config.schema;
		this.enableSchemaValidation = config.enableSchemaValidation;
	}
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
 * @sealed @public
 */
export interface TreeView<TSchema extends ImplicitFieldSchema> extends IDisposable {
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
	 * context that they're in a flow which creates a new `SharedTree` and would like to initialize it.
	 */
	readonly canInitialize: boolean;

	// TODO: Consider extending this status to include:
	// - application-defined metadata about the stored schema
	// - details about the differences between the stored and view schema sufficient for implementing "safe mismatch" policies
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
