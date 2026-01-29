/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { takeAsync, type AsyncGenerator } from "@fluid-private/stochastic-test-utils";
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

import {
	makeOpGenerator,
	type EditGeneratorOpWeights,
	type FuzzView,
} from "./fuzzEditGenerators.js";
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

// TODO: Enable other types of ops.
// AB#11436: Currently manually disposing the view when applying the schema op is causing a double dispose issue. Once this issue has been resolved, re-enable schema ops.
const editGeneratorOpWeights: Partial<EditGeneratorOpWeights> = {
	set: 3,
	clear: 1,
	insert: 5,
	remove: 5,
	intraFieldMove: 5,
	crossFieldMove: 5,
	start: 1,
	commit: 1,
	abort: 1,
	fieldSelection: { optional: 1, required: 1, sequence: 3, recurse: 3 },
	schema: 0,
	nodeConstraint: 0, // XXX: Support node constraints.
	fork: 1,
	merge: 1,
};

const generatorFactory = (): AsyncGenerator<
	Operation,
	DDSFuzzTestState<IChannelFactory<ISharedTree>>
> => takeAsync(100, makeOpGenerator(editGeneratorOpWeights));

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
