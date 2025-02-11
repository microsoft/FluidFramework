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
 * A schema-aware Tree DataObject.
 *
 * @remarks
 * Allows for the Tree's schema to be baked into the container schema.
 *
 * @internal
 */
export interface ITreeDataObject<TSchema extends ImplicitFieldSchema> {
	/**
	 * The key under the root DataObject in which the {@link @fluidframework/tree#SharedTree} is stored.
	 */
	readonly key: string;

	/**
	 * TreeViewConfiguration used to initialize new documents, as well as to interpret (schematize) existing ones.
	 *
	 * @remarks
	 * The fact that a single view schema is provided here (on the data object) makes it impossible to try and apply multiple different schema.
	 * Since the view schema currently does not provide any adapters for handling differences between view and stored schema,
	 * its also impossible for this single view schema to handle multiple different stored schema.
	 * Therefor, with this current API, two different applications (or different versions of the same application)
	 * with differing stored schema requirements (as implied by their view schema) can not collaborate on the same tree.
	 * The only schema evolution thats currently possible is upgrading the schema to one that supports a superset of what the old schema allowed,
	 * and collaborating between clients which have view schema that exactly correspond to that stored schema.
	 * Future work on tree as well as these utilities should address this limitation.
	 */
	readonly config: TreeViewConfiguration<TSchema>;

	/**
	 * The TreeView.
	 */
	readonly tree: TreeView<TSchema>;
}

/**
 * {@link @fluidframework/tree#SharedTree}-backed {@link PureDataObject | data object}.
 * @internal
 */
export abstract class TreeDataObject<TSchema extends ImplicitFieldSchema = ImplicitFieldSchema>
	extends PureDataObject
	implements ITreeDataObject<TSchema>
{
	private internalRoot: ITree | undefined;
	private readonly rootTreeId = "root";

	#tree?: TreeView<TSchema>;

	/**
	 * Gets the root of the underlying tree
	 *
	 * @throws If the root has not yet been initialized, this will throw an error.
	 */
	protected get root(): ITree {
		if (!this.internalRoot) {
			// Note: Can't use `UsageError` because adding dependency on `telemetry-utils` would create a cycle.
			// TODO: would probably be useful to move our shared error types in a more accessible location.
			throw new Error(this.getUninitializedErrorString(`root`));
		}

		return this.internalRoot;
	}

	/**
	 * Initializes internal objects and calls initialization overrides.
	 * @remarks The caller is responsible for ensuring this is only invoked once.
	 */
	public async initializeInternal(existing: boolean): Promise<void> {
		if (existing) {
			// data store has a root tree so we just need to set it before calling initializingFromExisting
			const channel = await this.runtime.getChannel(this.rootTreeId);
			if (SharedTree.is(channel)) {
				this.internalRoot = channel;
			} else {
				throw new Error(
					`Content with id ${channel.id} is not a SharedTree and cannot be loaded with treeDataObject.`,
				);
			}
		} else {
			this.internalRoot = SharedTree.create(this.runtime, this.rootTreeId);
			(this.internalRoot as unknown as ISharedObject).bindToContext();
		}

		await super.initializeInternal(existing);
	}

	/**
	 * Generates an error string indicating an item is uninitialized.
	 * @param item - The name of the item that was uninitialized.
	 */
	protected getUninitializedErrorString(item: string): string {
		return `${item} must be initialized before being accessed.`;
	}

	public get tree(): TreeView<TSchema> {
		if (this.#tree === undefined) {
			throw new Error(this.getUninitializedErrorString("tree"));
		}
		return this.#tree;
	}

	protected override async initializingFirstTime(): Promise<void> {
		const tree = SharedTree.create(this.runtime);
		this.#tree = tree.viewWith(this.config);
		// Initialize the tree content and schema.
		this.#tree.initialize(this.createInitialTree());
	}

	protected override async initializingFromExisting(): Promise<void> {
		this.#tree = this.root.viewWith(this.config);
	}

	protected override async hasInitialized(): Promise<void> {
		if (this.#tree === undefined) {
			throw new Error(this.getUninitializedErrorString("tree"));
		}
	}

	public abstract readonly key: string;

	public abstract readonly config: TreeViewConfiguration<TSchema>;

	protected abstract createInitialTree(): InsertableTreeFieldFromImplicitField<TSchema>;
}
