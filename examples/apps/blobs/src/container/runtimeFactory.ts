/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IContainerContext,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/legacy";
import { loadContainerRuntime } from "@fluidframework/container-runtime/legacy";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/legacy";
import type { FluidObject } from "@fluidframework/core-interfaces";

import { BlobMapFactory } from "./blobMap/index.js";

const blobMapId = "blob-map";
const blobMapRegistryKey = "blob-map";
const blobMapFactory = new BlobMapFactory();

export class BlobMapContainerRuntimeFactory implements IRuntimeFactory {
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
			const blobMapHandle = await entryPointRuntime.getAliasedDataStoreEntryPoint(blobMapId);
			if (blobMapHandle === undefined) {
				throw new Error("Blob map missing!");
			}
			return blobMapHandle.get();
		};

		const runtime = await loadContainerRuntime({
			context,
			registryEntries: new Map([[blobMapRegistryKey, Promise.resolve(blobMapFactory)]]),
			provideEntryPoint,
			existing,
		});

		if (!existing) {
			const blobMap = await runtime.createDataStore(blobMapRegistryKey);
			await blobMap.trySetAlias(blobMapId);
		}

		return runtime;
	}
}
