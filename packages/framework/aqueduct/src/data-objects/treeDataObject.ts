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
 * A {@link PureDataObject | data object} backed by a {@link @fluidframework/tree#ITree}.
 *
 * @remarks
 *
 * In order to view the tree's data, consumers of this type will need to apply the appropriate view schema to the {@link TreeDataObject.tree}.
 * This will generally be done via {@link PureDataObject.initializingFromExisting} and {@link PureDataObject.initializingFirstTime} methods.
 *
 * To initialize the tree's data for initial creation, implementers of this class will need to override {@link PureDataObject.initializingFirstTime} and set the data in the schema-aware view.
 *
 * @typeParam TDataObjectTypes - The optional input types used to strongly type the data object.
 *
 * @example Implementing `initializingFromExisting`
 *
 * ```typescript
 * protected override async initializingFromExisting(): Promise<void> {
 * 	TODO
 * }
 * ```
 *
 * @example Implementing `initializingFirstTime`
 *
 * ```typescript
 * protected override async initializingFirstTime(): Promise<void> {
 * 	TODO
 * }
 * ```
 *
 * @legacy @alpha
 */
export abstract class TreeDataObject<
	TDataObjectTypes extends DataObjectTypes = DataObjectTypes,
> extends PureDataObject<TDataObjectTypes> {
	/**
	 * The underlying {@link @fluidframework/tree#ITree | tree}.
	 * @remarks Created once during initialization.
	 */
	#tree: ITree | undefined;

	/**
	 * The underlying {@link @fluidframework/tree#ITree | tree}.
	 * @remarks Created once during initialization.
	 */
	protected get tree(): ITree {
		if (this.#tree === undefined) {
			throw new UsageError(uninitializedErrorString);
		}
		return this.#tree;
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

			this.#tree = sharedTree;
		} else {
			// const sharedTree = treeFactory.create(this.runtime, treeChannelId);
			const sharedTree = this.runtime.createChannel(
				treeChannelId,
				SharedTree.getFactory().type,
			) as unknown as ITree;
			(sharedTree as unknown as ISharedObject).bindToContext();

			this.#tree = sharedTree;

			// Note, the implementer is responsible for initializing the tree with initial data.
			// Generally, this can be done via `initializingFirstTime`.
		}

		await super.initializeInternal(existing);
	}
}
