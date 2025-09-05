/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISharedObject } from "@fluidframework/shared-object-base/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { SharedTree, type ITree } from "@fluidframework/tree/internal";

import {
	MigrationDataObject,
	type IDelayLoadChannelFactory,
	type ModelDescriptor,
} from "../index.js";

import type { DataObjectTypes } from "./types.js";

/**
 * Channel ID of {@link TreeDataObject}'s root {@link @fluidframework/tree#SharedTree}.
 * @privateRemarks This key is persisted and should not be changed without a migration strategy.
 */
export const treeChannelId = "root-tree";

/**
 * How to access the root Shared Tree maintained by this DataObject.
 */
export interface RootTreeView {
	tree: ITree;
}

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
 * @example Implementing `initializingFirstTime`
 *
 * ```typescript
 * protected override async initializingFirstTime(): Promise<void> {
 * 	// Generate the schema-aware view of the tree.
 * 	this.treeView = this.tree.viewWith(treeViewConfiguration);
 *
 * 	// Initialize the tree with initial data.
 * 	this.treeView.initialize(initialTree);
 * }
 * ```
 *
 * @example Implementing `initializingFromExisting`
 *
 * ```typescript
 * protected override async initializingFromExisting(): Promise<void> {
 * 	// Generate the schema-aware view of the tree.
 * 	this.treeView = this.tree.viewWith(treeViewConfiguration);
 *
 *  // Ensure the loaded tree is compatible with the view schema.
 * 	if (!this.treeView.compatibility.canView) {
 * 		// Handle out-of-schema data as appropriate.
 * 	}
 * }
 * ```
 *
 * @legacy @alpha
 */
export abstract class TreeDataObject<
	TDataObjectTypes extends DataObjectTypes = DataObjectTypes,
> extends MigrationDataObject<RootTreeView, TDataObjectTypes> {
	/**
	 * The underlying {@link @fluidframework/tree#ITree | tree}.
	 * @remarks Created once during initialization.
	 */
	protected get tree(): ITree {
		const tree = this.dataModel?.view.tree;
		if (!tree) {
			throw new UsageError(uninitializedErrorString);
		}

		return tree;
	}
}

/**
 * Model Descriptor for the new root SharedTree model.
 * Note that it leverages a delay-load factory for the tree's factory.
 */
export function rootSharedTreeDescriptor(
	treeFactory: IDelayLoadChannelFactory<ITree>,
): ModelDescriptor<{ tree: ITree }> {
	return {
		sharedObjects: {
			// Tree is provided via a delay-load factory
			delayLoaded: [treeFactory],
		},
		probe: async (runtime) => {
			try {
				const tree = await runtime.getChannel(treeChannelId);
				if (SharedTree.is(tree)) {
					return { tree: tree as ITree };
				}
			} catch {
				return undefined;
			}
		},
		ensureFactoriesLoaded: async () => {
			await treeFactory.loadObjectKindAsync();
		},
		create: (runtime) => {
			const tree = runtime.createChannel(
				treeChannelId,
				SharedTree.getFactory().type,
			) as unknown as ITree & ISharedObject; //* Bummer casting here. The factory knows what it returns (although that doesn't help with ISharedObject)
			tree.bindToContext();
			return { tree };
		},
		is: (m): m is { tree: ITree } => !!(m && (m as unknown as Record<string, unknown>).tree),
	};
}
