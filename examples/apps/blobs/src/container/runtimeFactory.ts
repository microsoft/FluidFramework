/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IContainerContext,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/legacy";
// eslint-disable-next-line import-x/no-deprecated -- only the minVersionForCollab overload is deprecated.
import { loadContainerRuntime } from "@fluidframework/container-runtime/legacy";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/legacy";
import type { FluidObject } from "@fluidframework/core-interfaces";

import { BlobCollectionFactory } from "./blobCollection/index.js";

const blobCollectionId = "blob-collection";
const blobCollectionRegistryKey = "blob-collection";
const blobCollectionFactory = new BlobCollectionFactory();

export class BlobCollectionContainerRuntimeFactory implements IRuntimeFactory {
	public get IRuntimeFactory(): IRuntimeFactory {
		return this;
	}

	public async instantiateRuntime(
		context: IContainerContext,
		existing: boolean,
	): Promise<IRuntime> {
		const provideEntryPoint = async (
			entryPointRuntime: IContainerRuntime,
		): Promise<FluidObject> => {
			const blobCollectionHandle =
				await entryPointRuntime.getAliasedDataStoreEntryPoint(blobCollectionId);
			if (blobCollectionHandle === undefined) {
				throw new Error("Blob collection missing!");
			}
			return blobCollectionHandle.get();
		};

		// eslint-disable-next-line import-x/no-deprecated -- using the canonical overload.
		const runtime = await loadContainerRuntime({
			context,
			registryEntries: new Map([
				[blobCollectionRegistryKey, Promise.resolve(blobCollectionFactory)],
			]),
			provideEntryPoint,
			existing,
			oldestSupportedClient: "3.0.0",
		});

		if (!existing) {
			const blobCollection = await runtime.createDataStore(blobCollectionRegistryKey);
			await blobCollection.trySetAlias(blobCollectionId);
		}

		return runtime;
	}
}
