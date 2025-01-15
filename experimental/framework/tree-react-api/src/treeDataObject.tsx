/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PureDataObject } from "@fluidframework/aqueduct/internal";
import type { ISharedObject } from "@fluidframework/shared-object-base/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type {
	ITree,
	TreeViewConfiguration,
	TreeView,
	ImplicitFieldSchema,
	InsertableTreeFieldFromImplicitField,
} from "@fluidframework/tree";
import { configuredSharedTree, typeboxValidator } from "@fluidframework/tree/internal";

/**
 * Opt into extra validation to detect encoding bugs and data corruption.
 * As long as this is an experimental package, opting into extra validation (at a small perf and bundle size cost) seems reasonable.
 */
export const SharedTree = configuredSharedTree({
	jsonValidator: typeboxValidator,
});

/**
 * A schema-aware Tree DataObject.
 * @remarks
 * Allows for the Tree's schema to be baked into the container schema.
 * @public
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
 * Generic DataObject for shared trees.
 * @internal
 */
export abstract class TreeDataObject<
	TSchema extends ImplicitFieldSchema = ImplicitFieldSchema,
> extends PureDataObject {
	private internalRoot: ITree | undefined;
	private readonly rootTreeId = "root";

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
	 * Caller is responsible for ensuring this is only invoked once.
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

	#tree?: TreeView<TSchema>;

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
