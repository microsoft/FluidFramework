/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannel } from "@fluidframework/datastore-definitions";
import { ISubscribable } from "../events/index.js";
import { IDisposable } from "../util/index.js";
import {
	ImplicitFieldSchema,
	InsertableTreeFieldFromImplicitField,
	TreeFieldFromImplicitField,
} from "./schemaTypes.js";

/**
 * Channel for a Fluid Tree DDS.
 * @remarks
 * Allows storing and collaboratively editing schema-aware hierarchial data.
 * @public
 */
export interface ITree extends IChannel {
	/**
	 * Returns a {@link TreeView} using the provided schema.
	 * If the tree's stored schema is compatible, this will provide a schema-aware API for accessing the tree's content.
	 * If the provided schema is incompatible with the stored data, the view will instead expose an error indicating the incompatibility.
	 *
	 * @remarks
	 * If the tree is uninitialized (has no schema and no content), the tree is initialized with the `initialTree` and
	 * view `schema` in the provided `config`.
	 *
	 * The tree (now known to have been initialized) has its stored schema checked against the provided view schema.
	 *
	 * If the schemas are compatible, the returned {@link TreeView} will expose the root with a schema-aware API based on the provided view schema.
	 *
	 * If the schemas are not compatible, the view will indicate the error.
	 *
	 * Note that other clients can modify the document at any time, causing the view to enter or leave this error state: see {@link TreeView.events} for how to handle invalidation in these cases.
	 *
	 * Only one schematized view may exist for a given ITree at a time.
	 * If creating a second, the first must be disposed before calling `schematize` again.
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
	schematize<TRoot extends ImplicitFieldSchema>(
		config: TreeConfiguration<TRoot>,
	): TreeView<TreeFieldFromImplicitField<TRoot>>;
}

/**
 * Configuration for how to {@link ITree.schematize|schematize} a tree.
 * @public
 */
export class TreeConfiguration<TSchema extends ImplicitFieldSchema = ImplicitFieldSchema> {
	/**
	 * @param schema - The schema which the application wants to view the tree with.
	 * @param initialTree - A function that returns the default tree content to initialize the tree with iff the tree is uninitialized
	 * (meaning it does not even have any schema set at all).
	 * If `initialTree` returns any actual node instances, they should be recreated each time `initialTree` runs.
	 * This is because if the config is used a second time any nodes that were not recreated could error since nodes cannot be inserted into the tree multiple times.
	 */
	public constructor(
		public readonly schema: TSchema,
		public readonly initialTree: () => InsertableTreeFieldFromImplicitField<TSchema>,
	) {}
}

/**
 * An editable view of a (version control style) branch of a shared tree.
 *
 * This view is always in one of two states:
 * 1. In schema: the stored schema is compatible with the provided view schema. There is no error, and root can be used.
 * 2. Out of schema: the stored schema is incompatible with the provided view schema. There is an error, and root cannot be used.
 *
 * @privateRemarks
 * From an API design perspective, `upgradeSchema` could be merged into `schematize` anb/or `schematize` could return errors explicitly.
 * Such approaches would make it discoverable that out of schema handling may need to be done.
 * Doing that would however complicate trivial "hello world" style example slightly, as well as be a breaking API change.
 * It also seems more complex to handle invalidation with that pattern.
 * Thus this design was chosen at the risk of apps blindly accessing `root` then breaking unexpectedly when the document is incompatible.
 * If this does become a problem,
 * it could be mitigated by adding a `rootOrError` member and deprecating `root` to give users a warning if they might be missing the error checking.
 * @public
 */
export interface TreeView<in out TRoot> extends IDisposable {
	/**
	 * The current root of the tree.
	 *
	 * If in the out of schema state, accessing this will throw.
	 * To handle this case, check `error` before using.
	 *
	 * To get notified about changes to this field (including to it being in an `error` state),
	 * use {@link TreeViewEvents.rootChanged} via `view.events.on("rootChanged", callback)`.
	 */
	readonly root: TRoot;

	/**
	 * Description of the error state, if any.
	 * When this is undefined, the view schema and stored schema are compatible, and `root` can be used.
	 */
	readonly error?: SchemaIncompatible;

	/**
	 * When there is an `error` and {@link SchemaIncompatible.canUpgrade} is true,
	 * this can be used to modify the stored schema to make it match the view schema.
	 * This will clear the error state, and allow access to `root`.
	 * @remarks
	 * It is an error to call this when {@link SchemaIncompatible.canUpgrade} is false, and a no-op when not in an `error` state.
	 * When this changes the stored schema, any existing or future clients which were compatible with the old stored schema will get an `error` state when trying to schematize the document.
	 * @privateRemarks
	 * In the future, more upgrade options could be provided here.
	 * Some options that could be added:
	 * - check the actual document contents (not just the schema) and attempt an atomic document update if the data is compatible.
	 * - apply converters and upgrade the document.
	 * - apply converters to lazily to adapt the document to the requested view schema (with optional lazy schema updates or transparent conversions on write).
	 */
	upgradeSchema(): void;

	/**
	 * Events for the tree.
	 */
	readonly events: ISubscribable<TreeViewEvents>;
}

/**
 * Information about how a view schema was incompatible.
 * @public
 */
export interface SchemaIncompatible {
	/**
	 * True iff the view schema supports all possible documents permitted by the stored schema.
	 *
	 * @remarks
	 * When true, this is still an error because the view schema supports more documents than the stored schema.
	 * This means that writes to the document using the view schema could make the document violate its stored schema.
	 * In this case, the stored schema could be updated to match the provided view schema, allowing read write access to the tree.
	 *
	 * Future version of SharedTree may provide readonly access to the document in this case because that would be safe:
	 * but this is not currently supported.
	 */
	readonly canUpgrade: boolean;
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
	 * This includes going into or out of an `error` state where the root is unavailable due to stored schema changes.
	 * It also includes changes to the field containing the root such as setting or clearing an optional root or changing which node is the root.
	 * This does NOT include changes to the content (fields/children) of the root node: for that case subscribe to events on the root node.
	 */
	rootChanged(): void;
}
