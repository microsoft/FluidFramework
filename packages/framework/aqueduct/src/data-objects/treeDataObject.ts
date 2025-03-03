/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISharedObject } from "@fluidframework/shared-object-base/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	type ImplicitFieldSchema,
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

const uninitializedErrorString =
	"The tree has not yet been initialized. The data object must be initialized before accessing.";

/**
 * {@link @fluidframework/tree#SharedTree}-backed {@link PureDataObject | data object}.
 *
 * @remarks
 *
 * Note: to initialize the tree's data for initial creation, implementers of this class will need to override {@link PureDataObject.initializingFirstTime} and set the data in {@link TreeDataObject.tree}.
 *
 * @example Implementing `initializingFirstTime`
 *
 * ```typescript
 * protected override async initializingFirstTime(): Promise<void> {
 * 	this.tree.initialize(...);
 * }
 * ```
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
	 *
	 * @virtual
	 */
	public abstract readonly config: TreeViewConfiguration<TSchema>;

	/**
	 * View of the underlying tree.
	 */
	#treeView: TreeView<TSchema> | undefined;

	/**
	 * Gets the view of the underlying {@link @fluidframework/tree#ITree}.
	 * @throws If the tree has not yet been initialized, this will throw an error.
	 */
	public get tree(): TreeView<TSchema> {
		if (this.#treeView === undefined) {
			throw new UsageError(uninitializedErrorString);
		}
		return this.#treeView;
	}

	public override async initializeInternal(existing: boolean): Promise<void> {
		if (existing) {
			// data store has a root tree so we just need to set it before calling initializingFromExisting
			const channel = await this.runtime.getChannel(treeChannelId);
			if (!SharedTree.is(channel)) {
				throw new Error(
					`Content with id ${channel.id} is not a SharedTree and cannot be loaded with treeDataObject.`,
				);
			}
			const sharedTree = channel as ITree;
			this.#treeView = sharedTree.viewWith(this.config);
		} else {
			const sharedTree = SharedTree.create(this.runtime, treeChannelId);
			(sharedTree as unknown as ISharedObject).bindToContext();

			this.#treeView = sharedTree.viewWith(this.config);

			// Note, the implementer is responsible for initializing the tree with initial data.
			// Generally, this can be done via `initializingFirstTime`.
		}

		await super.initializeInternal(existing);
	}
}
