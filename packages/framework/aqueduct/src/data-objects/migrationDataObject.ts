/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IChannel } from "@fluidframework/datastore-definitions/internal";
import { SharedDirectory, type ISharedDirectory } from "@fluidframework/map/internal";
import type { ISharedObject } from "@fluidframework/shared-object-base/internal";
import { SharedTree, type ITree } from "@fluidframework/tree/internal";

import type { IDelayLoadChannelFactory } from "../channel-factories/index.js";

import { dataObjectRootDirectoryId } from "./dataObject.js";
import { PureDataObject } from "./pureDataObject.js";
import { treeChannelId } from "./treeDataObject.js";
import type { DataObjectTypes } from "./types.js";

/**
 * ! TODO
 * @experimental
 * @legacy
 * @alpha
 */
export abstract class MigrationDataObject<
	I extends DataObjectTypes = DataObjectTypes,
> extends PureDataObject<I> {
	#tree: ITree | undefined;
	#directory: ISharedDirectory | undefined;

	public getRoot():
		| {
				isDirectory: true;
				root: ISharedDirectory;
		  }
		| {
				isDirectory: false;
				root: ITree;
		  } {
		assert(
			this.#directory !== undefined && this.#tree !== undefined,
			"Expected either directory or tree to be defined",
		);
		return this.#directory === undefined
			? {
					isDirectory: false,
					root: this.#tree,
				}
			: {
					isDirectory: true,
					root: this.#directory,
				};
	}

	private async refreshRoot(): Promise<void> {
		this.#tree = undefined;
		this.#directory = undefined;
		let channel: IChannel;
		try {
			// data store has a root tree so we just need to set it before calling initializingFromExisting
			channel = await this.runtime.getChannel(treeChannelId);
			// eslint-disable-next-line unicorn/prefer-optional-catch-binding
		} catch (_) {
			channel = await this.runtime.getChannel(dataObjectRootDirectoryId);
		}

		if (SharedTree.is(channel)) {
			this.#tree = channel;
		} else {
			this.#directory = channel as ISharedDirectory;
		}
	}

	public override async initializeInternal(existing: boolean): Promise<void> {
		if (existing) {
			await this.refreshRoot();
		} else {
			if (this.createUsingSharedTree) {
				const sharedTree = await this.treeDelayLoadFactory.createAsync(
					this.runtime,
					treeChannelId,
				);
				(sharedTree as unknown as ISharedObject).bindToContext();

				this.#tree = sharedTree;

				// Note, the implementer is responsible for initializing the tree with initial data.
				// Generally, this can be done via `initializingFirstTime`.
			} else {
				this.#directory = SharedDirectory.create(this.runtime, dataObjectRootDirectoryId);
				this.#directory.bindToContext();
			}
		}

		await super.initializeInternal(existing);
	}

	protected abstract get createUsingSharedTree(): boolean;

	// ! Should we try and pass this from factory to not double up on downloading the package? Or would it reuse the firwsst download?
	protected abstract get treeDelayLoadFactory(): IDelayLoadChannelFactory<ITree>;
}
