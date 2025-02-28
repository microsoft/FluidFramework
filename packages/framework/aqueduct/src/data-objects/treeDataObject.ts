/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISharedObject } from "@fluidframework/shared-object-base/internal";
import {
	type ImplicitFieldSchema,
	type InsertableTreeFieldFromImplicitField,
	type ITree,
	SharedTree,
	type TreeView,
	type TreeViewConfiguration,
} from "@fluidframework/tree/internal";

import { PureDataObject } from "./pureDataObject.js";

/**
 * Channel ID of {@link TreeDataObject}'s root {@link @fluidframework/tree#SharedTree}.
 */
const treeChannelId = "root";

/**
 * {@link @fluidframework/tree#SharedTree}-backed {@link PureDataObject | data object}.
 *
 * @internal
 */
export abstract class TreeDataObject<
	TSchema extends ImplicitFieldSchema = ImplicitFieldSchema,
> extends PureDataObject {
	/**
	 * The configuration used to initialize new documents, as well as to interpret (schematize) existing ones.
	 */
	public abstract readonly config: TreeViewConfiguration<TSchema>;

	/**
	 * The underlying tree.
	 */
	#tree: ITree | undefined;

	/**
	 * View of the underlying tree.
	 */
	#treeView: TreeView<TSchema> | undefined;

	/**
	 * Gets the underlying {@link @fluidframework/tree#ITree}.
	 * @throws If the tree has not yet been initialized, this will throw an error.
	 */
	private get initializedTree(): ITree {
		if (!this.#tree) {
			// Note: Can't use `UsageError` because adding dependency on `telemetry-utils` would create a cycle.
			// TODO: would probably be useful to move our shared error types in a more accessible location.
			throw new Error(this.getUninitializedErrorString("root"));
		}

		return this.#tree;
	}

	/**
	 * Gets the view of the underlying {@link @fluidframework/tree#ITree}.
	 * @throws If the tree has not yet been initialized, this will throw an error.
	 */
	public get tree(): TreeView<TSchema> {
		if (this.#treeView === undefined) {
			throw new Error(this.getUninitializedErrorString("tree"));
		}
		return this.#treeView;
	}

	public override async initializeInternal(existing: boolean): Promise<void> {
		if (existing) {
			// data store has a root tree so we just need to set it before calling initializingFromExisting
			const channel = await this.runtime.getChannel(treeChannelId);
			if (SharedTree.is(channel)) {
				this.#tree = channel;
			} else {
				throw new Error(
					`Content with id ${channel.id} is not a SharedTree and cannot be loaded with treeDataObject.`,
				);
			}
		} else {
			this.#tree = SharedTree.create(this.runtime, treeChannelId);
			(this.#tree as unknown as ISharedObject).bindToContext();
		}

		await super.initializeInternal(existing);
	}

	protected override async initializingFirstTime(): Promise<void> {
		this.#treeView = this.initializedTree.viewWith(this.config);

		// Initialize the tree content and schema.
		this.#treeView.initialize(this.createInitialTree());
	}

	protected override async initializingFromExisting(): Promise<void> {
		this.#treeView = this.initializedTree.viewWith(this.config);
	}

	protected override async hasInitialized(): Promise<void> {
		if (this.#treeView === undefined) {
			throw new Error(this.getUninitializedErrorString("tree"));
		}
	}

	/**
	 * Generates an error string indicating an item is uninitialized.
	 * @param item - The name of the item that was uninitialized.
	 * @virtual
	 */
	protected getUninitializedErrorString(item: string): string {
		return `${item} must be initialized before being accessed.`;
	}

	/**
	 * Create initial tree content for the data object when it initializes for the first time.
	 * @virtual
	 */
	protected abstract createInitialTree(): InsertableTreeFieldFromImplicitField<TSchema>;
}
