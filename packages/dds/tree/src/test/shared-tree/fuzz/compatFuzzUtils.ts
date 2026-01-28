/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createDDSFuzzSuite,
	type DDSFuzzModel,
	type DDSFuzzSuiteOptions,
	type DDSFuzzTestState,
} from "@fluid-private/test-dds-utils";
import type {
	IChannel,
	IChannelAttributes,
	IChannelFactory,
	IChannelServices,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";

import { pkgVersion } from "../../../packageVersion.js";
import type { ITree } from "../../../simple-tree/index.js";
import { configuredSharedTree, type ISharedTree } from "../../../treeFactory.js";
import { SharedTreeTestFactory, validateFuzzTreeConsistency } from "../../utils.js";

import { generatorFactory } from "./baseModel.js";
import { fuzzReducer } from "./fuzzEditReducers.js";
import {
	createOnCreate,
	deterministicIdCompressorFactory,
	failureDirectory,
	type SharedTreeFuzzTestFactory,
} from "./fuzzUtils.js";
import type { Operation } from "./operationTypes.js";




export function createCompatFuzzSuite(factoryForCompat: IChannelFactory<ITree>) {
	const compatFuzzModel: DDSFuzzModel<
		SharedTreeFuzzTestFactory,
		Operation,
		DDSFuzzTestState<SharedTreeFuzzTestFactory>
	> = {
		workloadName: "SharedTree Compat",
		factory: new SharedTreeTestFactory(
			new CompatTestTreeFactory(
				// factoryForCompat as IChannelFactory<ISharedTree>,
				currentFactory as IChannelFactory<ISharedTree>,
				currentFactory as IChannelFactory<ISharedTree>,
			),
			createOnCreate(undefined),
			undefined,
		),
		generatorFactory,
		reducer: fuzzReducer,
		validateConsistency: validateFuzzTreeConsistency,
	};

	createDDSFuzzSuite(compatFuzzModel, options);
}

const baseOptions: Partial<DDSFuzzSuiteOptions> = {
	numberOfClients: 3,
	clientJoinOptions: {
		maxNumberOfClients: 6,
		clientAddProbability: 0.1,
	},
	reconnectProbability: 0.5,
};

const runsPerBatch = 50;

const options: Partial<DDSFuzzSuiteOptions> = {
	...baseOptions,
	defaultTestCount: runsPerBatch,
	saveFailures: {
		directory: failureDirectory,
	},
	clientJoinOptions: {
		clientAddProbability: 0,
		maxNumberOfClients: 3,
	},
	detachedStartOptions: {
		numOpsBeforeAttach: 5,
		// AB#43127: fully allowing rehydrate after attach is currently not supported in tests (but should be in prod) due to limitations in the test mocks.
		attachingBeforeRehydrateDisable: true,
	},
	reconnectProbability: 0.1,
	idCompressorFactory: deterministicIdCompressorFactory(0xdeadbeef),
};

const currentFactory = configuredSharedTree({ minVersionForCollab: pkgVersion }).getFactory();

class CompatTestTreeFactory implements IChannelFactory<ISharedTree> {
	private lastUsedIdx = 1;

	public get type(): string {
		return this.factory1.type;
	}
	public get attributes(): IChannelAttributes {
		return this.factory1.attributes;
	}

	public constructor(
		private readonly factory1: IChannelFactory<ISharedTree>,
		private readonly factory2: IChannelFactory<ISharedTree>,
	) {}

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		channelAttributes: Readonly<IChannelAttributes>,
	): Promise<ISharedTree & IChannel> {
		return this.getInnerFactory().load(runtime, id, services, channelAttributes);
	}

	public create(runtime: IFluidDataStoreRuntime, id: string): ISharedTree & IChannel {
		return this.getInnerFactory().create(runtime, id);
	}

	private getInnerFactory(): IChannelFactory<ISharedTree> {
		this.lastUsedIdx = (this.lastUsedIdx + 1) % 2;
		return this.lastUsedIdx === 1 ? this.factory1 : this.factory2;
	}
}
