/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannel } from "@fluidframework/datastore-definitions";
import { ISubscribable } from "../events";
import { IDisposable, disposeSymbol } from "../util";
import { FlexTreeView, type CheckoutEvents } from "../shared-tree";
import { getProxyForField } from "../simple-tree";
import { TreeFieldSchema as FlexTreeFieldSchema } from "../feature-libraries";
import {
	ImplicitFieldSchema,
	InsertableTreeFieldFromImplicitField,
	TreeFieldFromImplicitField,
} from "./schemaTypes";

/**
 * Channel for a Fluid Tree DDS.
 * @remarks
 * Allows storing and collaboratively editing schema-aware hierarchial data.
 * @beta
 */
export interface ITree extends IChannel {
	/**
	 * Returns a tree that is known to be compatible with the provided schema. The returned tree exposes an API that is schema-aware.
	 *
	 * @remarks
	 * If the tree is uninitialized (has no schema and no content), the tree is initialized with the `initialTree` and
	 * view `schema` in the provided `config`.
	 *
	 * The tree (now known to have been initialized) has its stored schema checked against the provided view schema.
	 *
	 * If the schemas are compatible (including updating the stored schema if permitted via `allowedSchemaModifications`),
	 * a {@link TreeView} is returned, with a schema-aware API based on the provided view schema.
	 *
	 * If the schemas are not compatible, an exception is thrown.
	 *
	 * @privateRemarks
	 * TODO: make the mismatch case recoverable.
	 * - Provide a way to make a generic view schema for any document.
	 * - Produce/throw the error in a document-recoverable way (ex: specific exception type or return value).
	 * TODO: Document and handle what happens when the stored schema changes after schematize has returned. Is some invalidation contract needed? How does editable tree behave?
	 * TODO: Clarify lifetimes. Ensure calling schematize multiple times does not leak.
	 * TODO: Support adapters for handling out-of-schema data.
	 *
	 * Doing initialization here, regardless of `AllowedUpdateType`, allows a small API that is hard to use incorrectly.
	 * Other approaches tend to have easy-to-make mistakes.
	 * For example, having a separate initialization function means apps can forget to call it, making an app that can only open existing documents,
	 * or call it unconditionally leaving an app that can only create new documents.
	 * It also would require the schema to be passed into separate places and could cause issues if they didn't match.
	 * Since the initialization function couldn't return a typed tree, the type checking wouldn't help catch that.
	 * Also, if an app manages to create a document, but the initialization fails to get persisted, an app that only calls the initialization function
	 * on the create code-path (for example how a schematized factory might do it),
	 * would leave the document in an unusable state which could not be repaired when it is reopened (by the same or other clients).
	 * Additionally, once out of schema content adapters are properly supported (with lazy document updates),
	 * this initialization could become just another out of schema content adapter: at that point it clearly belongs here in schematize.
	 */
	schematize<TRoot extends ImplicitFieldSchema>(
		config: TreeConfiguration<TRoot>,
	): TreeView<TreeFieldFromImplicitField<TRoot>>;
}

/**
 * Configuration for how to {@link ITree.schematize|schematize} a tree.
 * @beta
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
 * @privateRemarks
 * This is a wrapper around ITreeView that adjusted it for the public package API.
 * TODO:
 * Establish a naming conversion between these internal and wrapper types.
 * @beta
 */
export interface TreeView<in out TRoot> extends IDisposable {
	/**
	 * The current root of the tree.
	 */
	readonly root: TRoot;

	/**
	 * Events for the tree.
	 */
	readonly events: ISubscribable<CheckoutEvents>;
}

/**
 * Implementation of TreeView wrapping a FlexTreeView.
 */
export class WrapperTreeView<
	in out TSchema extends ImplicitFieldSchema,
	TView extends FlexTreeView<FlexTreeFieldSchema>,
> implements TreeView<TreeFieldFromImplicitField<TSchema>>
{
	public constructor(public readonly view: TView) {}

	public [disposeSymbol](): void {
		this.view[disposeSymbol]();
	}

	public get events(): ISubscribable<CheckoutEvents> {
		return this.view.checkout.events;
	}

	public get root(): TreeFieldFromImplicitField<TSchema> {
		return getProxyForField(this.view.editableTree) as TreeFieldFromImplicitField<TSchema>;
	}
}
