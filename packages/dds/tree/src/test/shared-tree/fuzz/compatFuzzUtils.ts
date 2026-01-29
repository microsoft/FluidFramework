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
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";

import { ITree } from "../../../simple-tree/index.js";
import { configuredSharedTree, type ISharedTree } from "../../../treeFactory.js";
import { validateFuzzTreeConsistency } from "../../utils.js";

import { generatorFactory } from "./baseModel.js";
import type { FuzzView } from "./fuzzEditGenerators.js";
import { fuzzReducer } from "./fuzzEditReducers.js";
import {
	createTreeViewSchema,
	defaultTreePackageStatics,
	deterministicIdCompressorFactory,
	failureDirectory,
	treeToPackageStatics,
	type TreePackageStatics,
} from "./fuzzUtils.js";
import type { Operation } from "./operationTypes.js";

export function createCompatFuzzSuite(
	factoryForCompat: IChannelFactory<ITree>,
	compatPackageStatics: TreePackageStatics,
	compatVersion: MinimumVersionForCollab,
) {
	const compatFuzzModel: DDSFuzzModel<
		CompatTestTreeFactory,
		Operation,
		DDSFuzzTestState<CompatTestTreeFactory>
	> = {
		workloadName: "SharedTree Compat",
		factory: new CompatTestTreeFactory([
			[factoryForCompat as IChannelFactory<ISharedTree>, compatPackageStatics],
			[
				makeFactorySupportingVersion(compatVersion) as IChannelFactory<ISharedTree>,
				defaultTreePackageStatics,
			],
		]),
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
	skipMinimization: true,
};

function makeFactorySupportingVersion(
	version: MinimumVersionForCollab,
): IChannelFactory<ITree> {
	return configuredSharedTree({ minVersionForCollab: version }).getFactory();
}

class CompatTestTreeFactory implements IChannelFactory<ISharedTree> {
	private lastUsedIdx = -1;

	public get type(): string {
		return this.factories[0][0].type;
	}
	public get attributes(): IChannelAttributes {
		return this.factories[0][0].attributes;
	}

	public constructor(
		private readonly factories: readonly [IChannelFactory<ISharedTree>, TreePackageStatics][],
	) {}

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		channelAttributes: Readonly<IChannelAttributes>,
	): Promise<ISharedTree & IChannel> {
		const [factory, statics] = this.getInnerFactory();
		const tree = await factory.load(runtime, id, services, channelAttributes);
		treeToPackageStatics.set(tree, statics);
		return tree;
	}

	public create(runtime: IFluidDataStoreRuntime, id: string): ISharedTree & IChannel {
		const [factory, statics] = this.getInnerFactory();
		const tree = factory.create(runtime, id);
		treeToPackageStatics.set(tree, statics);

		const view = tree.viewWith(
			statics.newTreeViewConfiguration({
				schema: createTreeViewSchema([], statics.newSchemaFactory),
			}),
		);
		(view as FuzzView).initialize(undefined);
		view.dispose();

		return tree;
	}

	private getInnerFactory(): [IChannelFactory<ISharedTree>, TreePackageStatics] {
		this.lastUsedIdx = (this.lastUsedIdx + 1) % this.factories.length;
		return this.factories[this.lastUsedIdx];
	}
}
