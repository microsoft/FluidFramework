/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISharedObject } from "@fluidframework/shared-object-base/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
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
	 *
	 * @remarks
	 * The fact that a single view schema is provided here (on the data object) makes it impossible to try and apply multiple different schema.
	 * Since the view schema currently does not provide any adapters for handling differences between view and stored schema,
	 * it's also impossible for this single view schema to handle multiple different stored schema.
	 * Therefore, with this current API, two different applications (or different versions of the same application)
	 * with differing stored schema requirements (as implied by their view schema) can not collaborate on the same tree.
	 * The only schema evolution that's currently possible is upgrading the schema to one that supports a superset of what the old schema allowed,
	 * and collaborating between clients which have view schema that exactly correspond to that stored schema.
	 * Future work on tree as well as these utilities should address this limitation.
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
			throw new UsageError(getUninitializedErrorString("root"));
		}

		return this.#tree;
	}

	/**
	 * Gets the view of the underlying {@link @fluidframework/tree#ITree}.
	 * @throws If the tree has not yet been initialized, this will throw an error.
	 */
	public get tree(): TreeView<TSchema> {
		if (this.#treeView === undefined) {
			throw new UsageError(getUninitializedErrorString("tree"));
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
			throw new Error(getUninitializedErrorString("tree"));
		}
	}

	/**
	 * Create initial tree content for the data object when it initializes for the first time.
	 * @virtual
	 */
	protected abstract createInitialTree(): InsertableTreeFieldFromImplicitField<TSchema>;
}

/**
 * Generates an error string indicating an item is uninitialized.
 * @param item - The name of the item that was uninitialized.
 */
function getUninitializedErrorString(item: string): string {
	return `${item} must be initialized before being accessed.`;
}
