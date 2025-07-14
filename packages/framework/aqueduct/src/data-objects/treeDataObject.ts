/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISharedObject } from "@fluidframework/shared-object-base/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { SharedTree, type ITree } from "@fluidframework/tree/internal";

import { PureDataObject } from "./pureDataObject.js";
import type { DataObjectTypes } from "./types.js";

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
 * @typeParam TTreeView - State derived from the underlying {@link @fluidframework/tree#ITree | tree} managed by the {@link TreeDataObject} and exposed via {@link TreeDataObject.treeView}.
 * @typeParam TDataObjectTypes - The optional input types used to strongly type the data object.
 *
 * @example Implementing `initializingFirstTime`
 *
 * ```typescript
 * protected override async initializingFirstTime(): Promise<void> {
 * 	this.tree.initialize(...);
 * }
 * ```
 *
 * @legacy @alpha
 */
export abstract class TreeDataObject<
	TTreeView,
	TDataObjectTypes extends DataObjectTypes = DataObjectTypes,
> extends PureDataObject<TDataObjectTypes> {
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
	 * @remarks
	 * Note: in most cases, you will want to use {@link TreeDataObject.treeView} instead.
	 * Created once during initialization.
	 */
	protected get sharedTree(): ITree {
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
			const sharedTree: ITree = channel as unknown as ITree;

			this.#sharedTree = sharedTree;
			this.#view = this.generateView(sharedTree);
		} else {
			// const sharedTree = treeFactory.create(this.runtime, treeChannelId);
			const sharedTree = this.runtime.createChannel(
				treeChannelId,
				SharedTree.getFactory().type,
			) as unknown as ITree;
			(sharedTree as unknown as ISharedObject).bindToContext();

			this.#sharedTree = sharedTree;
			this.#view = this.generateView(sharedTree);

			// Note, the implementer is responsible for initializing the tree with initial data.
			// Generally, this can be done via `initializingFirstTime`.
		}

		await super.initializeInternal(existing);
	}
}
