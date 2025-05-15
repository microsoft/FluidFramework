/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISharedObject } from "@fluidframework/shared-object-base/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { type ITree, SharedTree } from "@fluidframework/tree/internal";

import { PureDataObject } from "./pureDataObject.js";

/**
 * Channel ID of {@link TreeDataObject}'s root {@link @fluidframework/tree#SharedTree}.
 */
const treeChannelId = "tree-data-object";

const uninitializedErrorString =
	"The tree has not yet been initialized. The data object must be initialized before accessing.";

/**
 * {@link @fluidframework/tree#SharedTree}-backed {@link PureDataObject | data object}.
 *
 * @remarks
 *
 * Note: to initialize the tree's data for initial creation, implementers of this class will need to override {@link PureDataObject.initializingFirstTime} and set the data in {@link TreeDataObject.treeView}.
 *
 * @typeParam TTreeView - View derived from the underlying tree.
 * Can be used to derive schema-aware views of the tree.
 * See {@link TreeDataObject.generateView}.
 *
 * @example Implementing `initializingFirstTime`
 *
 * ```typescript
 * protected override async initializingFirstTime(): Promise<void> {
 * 	this.tree.initialize(...);
 * }
 * ```
 *
 * @privateRemarks
 * TODO: Before promoting this beyond internal, we should consider alternative API patterns that don't depend on
 * sub-classing and don't leak Fluid concepts that should ideally be internal.
 * See `tree-react-api` for an example of a pattern that avoids unnecessary leakage of implementation details.
 *
 * @internal
 */
export abstract class TreeDataObject<TTreeView> extends PureDataObject {
	/**
	 * Generates a view of the data object's {@link @fluidframework/tree#ITree | tree}.
	 * @remarks Called once during initialization.
	 */
	protected abstract generateView(tree: ITree): TTreeView;

	/**
	 * Implementation of SharedTree which is used to generate the view.
	 * @remarks Created once during initialization.
	 */
	#sharedTree: ITree | undefined;

	/**
	 * Gets the underlying {@link @fluidframework/tree#ITree | tree}.
	 */
	public get sharedTree(): ITree {
		if (this.#sharedTree === undefined) {
			throw new UsageError(uninitializedErrorString);
		}
		return this.#sharedTree;
	}

	/**
	 * View derived from the underlying tree.
	 * @remarks Populated via {@link TreeDataObject.generateView}.
	 */
	#view: TTreeView | undefined;

	/**
	 * Gets the derived view of the underlying tree.
	 *
	 * @throws
	 * If the tree has not yet been initialized, this will throw an error.
	 */
	public get treeView(): TTreeView {
		if (this.#view === undefined) {
			throw new UsageError(uninitializedErrorString);
		}
		return this.#view;
	}

	public override async initializeInternal(existing: boolean): Promise<void> {
		if (existing) {
			// data store has a root tree so we just need to set it before calling initializingFromExisting
			const channel = await this.runtime.getChannel(treeChannelId);

			// TODO: Support using a Directory to Tree migration shim and DataObject's root channel ID
			// to allow migrating from DataObject to TreeDataObject instead of just erroring in that case.
			if (!SharedTree.is(channel)) {
				throw new Error(
					`Content with id ${channel.id} is not a SharedTree and cannot be loaded with treeDataObject.`,
				);
			}
			const sharedTree: ITree = channel;

			this.#sharedTree = sharedTree;
			this.#view = this.generateView(sharedTree);
		} else {
			const sharedTree = SharedTree.create(this.runtime, treeChannelId);
			(sharedTree as unknown as ISharedObject).bindToContext();

			this.#sharedTree = sharedTree;
			this.#view = this.generateView(sharedTree);

			// Note, the implementer is responsible for initializing the tree with initial data.
			// Generally, this can be done via `initializingFirstTime`.
		}

		await super.initializeInternal(existing);
	}
}