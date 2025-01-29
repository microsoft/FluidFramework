/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Ink } from "@fluid-experimental/ink";
import {
	SharedNumberSequence,
	SharedObjectSequence,
	SparseMatrix,
} from "@fluid-experimental/sequence-deprecated";
import { SharedCell } from "@fluidframework/cell/internal";
import { IContainerContext } from "@fluidframework/container-definitions/internal";
import {
	ContainerRuntime,
	IContainerRuntimeOptions,
} from "@fluidframework/container-runtime/internal";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import { SharedDirectory, SharedMap } from "@fluidframework/map/internal";
import { SharedMatrix } from "@fluidframework/matrix/internal";
import { ConsensusQueue } from "@fluidframework/ordered-collection/internal";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection/internal";
import {
	FluidDataStoreRegistryEntry,
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
	IFluidDataStoreRegistry,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions/internal";
import { RuntimeFactoryHelper } from "@fluidframework/runtime-utils/internal";
import { SharedString } from "@fluidframework/sequence/internal";
import { SharedSummaryBlock } from "@fluidframework/shared-summary-block/internal";

import { ReplayToolContainerEntryPoint } from "./helpers.js";
import { UnknownChannelFactory } from "./unknownChannel.js";

/** Simple runtime factory that creates a container runtime */
export class ReplayRuntimeFactory extends RuntimeFactoryHelper {
	constructor(
		private readonly runtimeOptions: IContainerRuntimeOptions,
		private readonly registries: NamedFluidDataStoreRegistryEntries,
	) {
		super();
	}

	public async preInitialize(
		context: IContainerContext,
		existing: boolean,
	): Promise<ContainerRuntime> {
		return ContainerRuntime.loadRuntime({
			context,
			provideEntryPoint: async (containerRuntime: IContainerRuntime) => {
				// For the replay tool, the entryPoint exposes the containerRuntime itself so the helpers for the tool
				// can use it. This is an anti-pattern, and is *not* what an actual application should do (it should
				// expose an object with a defined API that allows hosts that consume the container to interact with it).
				// In our tests and internal tools it might sometimes be ok to use this anti-pattern for simplicity,
				// where we might need to use/validate internal bits. In this case the replay tool reaches into our
				// implementation of the container runtime to trigger summarization (see uploadSummary() in helpers.ts).
				const entryPoint: ReplayToolContainerEntryPoint = {
					containerRuntime: containerRuntime as ContainerRuntime,
					get ReplayToolContainerEntryPoint() {
						return this as ReplayToolContainerEntryPoint;
					},
				};
				return entryPoint;
			},
			existing,
			runtimeOptions: this.runtimeOptions,
			registryEntries: this.registries,
		});
	}
}
// these dds don't have deterministic content, or the
// factories are unavailable to us. they will be excluded
// from comparison
export const excludeChannelContentDdsFactories: IChannelFactory[] = [
	SharedSummaryBlock.getFactory(),
	new UnknownChannelFactory("https://graph.microsoft.com/types/SharedArray"),
	new UnknownChannelFactory("https://graph.microsoft.com/types/signal"),
];
const allDdsFactories: IChannelFactory[] = [
	...excludeChannelContentDdsFactories,
	SharedMatrix.getFactory(),
	SharedMap.getFactory(),
	SharedString.getFactory(),
	Ink.getFactory(),
	SharedCell.getFactory(),
	SharedObjectSequence.getFactory(),
	SharedNumberSequence.getFactory(),
	ConsensusQueue.getFactory(),
	ConsensusRegisterCollection.getFactory(),
	SparseMatrix.getFactory(),
	SharedDirectory.getFactory(),
];

/**
 * Simple data store factory that creates a data store runtime with a list of known DDSes. It does not create a data
 * object since the replay tool doesn't request any data store but only loads the data store runtime to summarize it.
 */
export class ReplayDataStoreFactory
	implements IFluidDataStoreFactory, Partial<IFluidDataStoreRegistry>
{
	public readonly type = "@fluid-internal/replay-tool";

	public get IFluidDataStoreFactory() {
		return this;
	}

	public get IFluidDataStoreRegistry() {
		return this;
	}

	/**
	 * Return ourselves when asked for child data store entry. The idea is that each data store that is created
	 * has access to and can create from the list of known DDSes.
	 */
	public async get(name: string): Promise<FluidDataStoreRegistryEntry | undefined> {
		return this;
	}

	public constructor(
		private readonly runtimeClassArg: typeof FluidDataStoreRuntime = FluidDataStoreRuntime,
	) {}

	public async instantiateDataStore(context: IFluidDataStoreContext) {
		return new this.runtimeClassArg(
			context,
			new Map(allDdsFactories.map((factory) => [factory.type, factory])),
			true /* existing */,
			() => {
				// TODO: AB#4779
				throw new Error("TODO");
			},
		);
	}
}
