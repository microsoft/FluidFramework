/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";

import { IEfficientMatrix, ICollabChannelFactory } from "./contracts";
import { CollabSpacesRuntime } from "./collabSpaces";

/**
 *
 * Factory for collab spaces
 *
 */
/** @internal */
class CollabSpacesRuntimeFactory implements IFluidDataStoreFactory {
	public readonly type = "CollabSpaces-DataStore";
	constructor(private readonly sharedObjects: readonly ICollabChannelFactory[]) {}

	public get IFluidDataStoreFactory() {
		return this;
	}

	public async instantiateDataStore(
		context: IFluidDataStoreContext,
		existing: boolean,
	): Promise<IFluidDataStoreChannel> {
		const runtime = new CollabSpacesRuntime(
			context,
			this.sharedObjects,
			existing,
			async (runtimeArg: IFluidDataStoreRuntime) => {
				return runtimeArg as CollabSpacesRuntime as IEfficientMatrix;
			},
		);

		await runtime.initialize(existing);
		return runtime;
	}
}

/** @internal */
export function createCollabSpaces(
	sharedObjects: Readonly<ICollabChannelFactory[]>,
): IFluidDataStoreFactory {
	return new CollabSpacesRuntimeFactory(sharedObjects);
}
