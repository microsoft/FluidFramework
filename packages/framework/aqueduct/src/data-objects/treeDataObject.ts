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
 * Generic DataObject for shared trees.
 * @alpha
 */
export abstract class TreeDataObject<
	TSchema extends ImplicitFieldSchema = ImplicitFieldSchema,
> extends PureDataObject {
	private internalRoot: ITree | undefined;
	private readonly rootTreeId = "root";

	#tree?: TreeView<TSchema>;

	/**
	 * The root tree will either be ready or will return an error. If an error is thrown
	 * the root has not been correctly created/set.
	 */
	protected get root(): ITree {
		if (!this.internalRoot) {
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
				throw new UsageError(
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
		if (this.#tree === undefined) throw new Error(this.getUninitializedErrorString("tree"));
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
		if (this.#tree === undefined) throw new Error(this.getUninitializedErrorString("tree"));
	}

	public abstract readonly key: string;

	public abstract readonly config: TreeViewConfiguration<TSchema>;

	protected abstract createInitialTree(): InsertableTreeFieldFromImplicitField<TSchema>;
}
