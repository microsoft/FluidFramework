/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannel } from "@fluidframework/datastore-definitions";

import { CommitMetadata } from "../core/index.js";
import { ISubscribable } from "../events/index.js";
import { RevertibleFactory } from "../shared-tree/index.js";
import { IDisposable } from "../util/index.js";

import {
	ImplicitFieldSchema,
	InsertableTreeFieldFromImplicitField,
	TreeFieldFromImplicitField,
} from "./schemaTypes.js";
import type { NodeIncompatibility } from "./treeDiscrepancies.js";

/**
 * Channel for a Fluid Tree DDS.
 * @remarks
 * Allows storing and collaboratively editing schema-aware hierarchial data.
 * @public
 */
export interface ITree extends IChannel {
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
		config: TreeConfiguration<TRoot>,
	): Promise<TreeView<TRoot>>;

	/**
	 * Returns a {@link TreeView} using the provided schema.
	 * If the stored schema is compatible with the view schema specified by `config`,
	 * the returned {@link TreeView} will expose the root with a schema-aware API based on the provided view schema.
	 * If the provided schema is incompatible with the stored schema, the view will instead expose a status indicating the incompatibility.
	 *
	 * @remarks
	 * If the tree is uninitialized, it will be implicitly initialized by this function.
	 *
	 * Note that other clients can modify the document at any time, causing the view to change its compatibility status: see {@link TreeView.events} for how to handle invalidation in these cases.
	 *
	 * Only one schematized view may exist for a given ITree at a time.
	 * If creating a second, the first must be disposed before calling `schematize` again.
	 * @deprecated - Replaced by {@link ITree.viewWith}. Use that method instead. Note that `viewWith` does not implicitly initialize the tree:
	 * to initialize it, call {@link TreeView.initialize} on the returned view.
	 */
	schematize<TRoot extends ImplicitFieldSchema>(
		config: TreeConfiguration<TRoot>,
	): TreeView<TRoot>;
}

/**
 * Configuration for {@link ITree.viewWith}.
 * @public
 */
export class TreeConfiguration<TSchema extends ImplicitFieldSchema = ImplicitFieldSchema> {
	/**
	 * @param schema - The schema which the application wants to view the tree with.
	 * @param initialTree - A function that returns the default tree content to initialize the tree with iff the tree is uninitialized
	 * (meaning it does not even have any schema set at all).
	 * If `initialTree` returns any actual node instances, they should be recreated each time `initialTree` runs.
	 * This is because if the config is used a second time any nodes that were not recreated could error since nodes cannot be inserted into the tree multiple times.
	 * @param metadata - Application-defined metadata to associate with the schema.
	 * This metadata is intended to help the application reason about compatibility between `schema` (the view schema) and the stored schema.
	 * It is not used by SharedTree, but is stored alongside the schema and provided to the application as part of {@link TreeView.compatibility}.
	 * For example, this could be used to store a schema version number, a location to dynamically load the schema from, or a hash of the schema.
	 * Passing `undefined` will store no metadata.
	 * Contents must be JSON-serializable.
	 */
	public constructor(
		public readonly schema: TSchema,
		public readonly initialTree: () => InsertableTreeFieldFromImplicitField<TSchema>,
		public readonly metadata?: unknown,
	) {}
}

/**
 * An editable view of a branch of a shared tree based on some schema.
 *
 * This schema--known as the view schema--may or may not align the stored schema of the document.
 * Information about discrepancies between the two schemas is available via {@link TreeView.compatibility|compatibility}.
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
 * @public
 */
export interface TreeView<TSchema extends ImplicitFieldSchema> extends IDisposable {
	/**
	 * The current root of the tree.
	 *
	 * If in the out of schema state, accessing this will throw.
	 * To handle this case, check {@link TreeView.compatibility|compatibility}'s {@link SchemaCompatibilityStatus.canView|canView} before using.
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
	 * Description of the current compatibility status between the view schema and stord schema.
	 *
	 * {@link TreeViewEvents.schemaChanged} is fired when the compatibility status changes.
	 */
	readonly compatibility: SchemaCompatibilityStatus;

	/**
	 * When the schemas are not an exact match {@link SchemaCompatibilityStatus.canUpgrade} is true,
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
	readonly events: ISubscribable<TreeViewEvents>;
}

/**
 * Information about a view schema's compatibility with the document's stored schema.
 * @public
 */
export interface SchemaCompatibilityStatus {
	/**
	 * Whether the view schema is an exact match to the stored schema.
	 */
	readonly isExactMatch: boolean;

	/**
	 * Whether the current view schema is sufficiently compatible with the stored schema to allow viewing tree data.
	 * This is true when the documents allowed by the view schema are a subset of those allowed by the stored schema.
	 * If false, {@link TreeView.root} will throw upon access.
	 *
	 * Be aware that even when this is true, application logic may not correctly tolerate the documents allowable by the stored schema!
	 * For example, if the stored schema allows types that the view schema does not, and the application doesn't have fallback logic
	 * for unrecognized types as part of a field, it may throw when trying to read the document!
	 * Application authors are encouraged to read docs/user-facing/schema-evolution.md and choose a schema compatibility policy that
	 * aligns with their application's needs.
	 *
	 * @remarks
	 * When the view schema is a strict superset of the stored schema, this is false because writes to the document using the view
	 * schema could make the document violate its stored schema.
	 * In this case, the stored schema could be updated to match the provided view schema, allowing read write access to the tree.
	 * See {@link SchemaCompatibilityStatus.canUpgrade}.
	 *
	 * Future version of SharedTree may provide readonly access to the document in this case because that would be safe,
	 * but this is not currently supported.
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
	 * context that they're in a flow which creates a new `SharedTree` and would like to set up its initial content.
	 */
	readonly canInitialize: boolean;

	/**
	 * Contains details about incompatibilities between the view schema and the stored schema.
	 * Applications may find these details useful to implement policy around when it may be safe to proceed with a view schema that is not an exact match.
	 *
	 * @privateRemarks
	 * TODO: I'm imagining that the information here is enough that applications could construct their own compatibility policies after reading some high-level documentation,
	 * but it's also general enough that a few canned public APIs could be implemented for "strict" and "loose" policies.
	 *
	 * The "strict" API would prevent applications from opening documents unless the schema was an exact match.
	 * The "loose" API would allow applications to open documents when the stored schema aligned with the view schema EXCEPT:
	 * - The stored schema might have additional optional fields on object nodes
	 * - The stored schema might allow additional types on some explicitly provided fields (typically arrays)
	 * - The understanding here is that the application will have allow-listed a predefined set of fields which they know they have "forward-compatible" fallbacks for (ex: render placeholder for unknown types)
	 *
	 * Applications using strict/loose policies would have different expectations around what sort of code they must saturate before upgrading to a new schema version.
	 */
	readonly differences: NodeIncompatibility[];

	/**
	 * Application-defined metadata associated with the schema.
	 *
	 * This metadata reflects the metadata provided in the {@link TreeConfiguration} which last updated the schema
	 * (either via {@link TreeView.initialize} or {@link TreeView.upgradeSchema})
	 */
	readonly metadata: unknown;
}

/**
 * Events for {@link TreeView}.
 * @public
 */
export interface TreeViewEvents {
	/**
	 * A batch of changes has finished processing and the view has been updated.
	 */
	afterBatch(): void;

	/**
	 * {@link TreeView.root} has changed.
	 * This includes changes to the field containing the root such as setting or clearing an optional root or changing which node is the root.
	 * This does NOT include changes to the content (fields/children) of the root node: for that case subscribe to events on the root node.
	 */
	rootChanged(): void;

	/**
	 * The stored schema for the document has changed.
	 * This may affect the compatibility between the view schema and the stored schema, and thus the ability to use the view.
	 *
	 * This event implies that the old {@link TreeView.root} is no longer valid.
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
