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
import { TempCollabSpaceRuntime } from "./collabSpaces";

/**
 *
 * Factory for collab spaces
 *
 */
/** @internal */
class TempCollabSpaceRuntimeFactory implements IFluidDataStoreFactory {
	public readonly type = "CollabSpace-DataStore";
	constructor(private readonly sharedObjects: readonly ICollabChannelFactory[]) {}

	public get IFluidDataStoreFactory() {
		return this;
	}

	public async instantiateDataStore(
		context: IFluidDataStoreContext,
		existing: boolean,
	): Promise<IFluidDataStoreChannel> {
		const runtime = new TempCollabSpaceRuntime(
			context,
			this.sharedObjects,
			existing,
			async (runtimeArg: IFluidDataStoreRuntime) => {
				return runtimeArg as TempCollabSpaceRuntime as IEfficientMatrix;
			},
		);

		await runtime.initialize(existing);
		return runtime;
	}
}

/** @internal */
export function createCollabSpace(
	sharedObjects: Readonly<ICollabChannelFactory[]>,
): IFluidDataStoreFactory {
	return new TempCollabSpaceRuntimeFactory(sharedObjects);
}
