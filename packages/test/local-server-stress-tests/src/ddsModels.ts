/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import-x/no-internal-modules */
import { done, type AsyncGenerator } from "@fluid-private/stochastic-test-utils";
import { DDSFuzzModel, DDSFuzzTestState } from "@fluid-private/test-dds-utils";
import { baseCounterModel } from "@fluidframework/counter/internal/test";
// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import { baseSharedArrayModel } from "@fluidframework/legacy-dds/internal/test";
import { baseMapModel, baseDirModel } from "@fluidframework/map/internal/test";
import { baseSharedMatrixModel } from "@fluidframework/matrix/internal/test";
import { baseConsensusOrderedCollectionModel } from "@fluidframework/ordered-collection/internal/test";
import { baseRegisterCollectionModel } from "@fluidframework/register-collection/internal/test";
import {
	baseSharedStringModel,
	baseIntervalModel,
} from "@fluidframework/sequence/internal/test";
import { baseTaskManagerModel } from "@fluidframework/task-manager/internal/test";
import { baseTreeModel } from "@fluidframework/tree/internal/test";

function repeatFactoryAsync<T, TState = void>(
	factory: () => AsyncGenerator<T, TState>,
): AsyncGenerator<T, TState> {
	let generator = factory();
	return async (state: TState): Promise<typeof done | T> => {
		const next = await generator(state);
		if (next !== done) {
			return next;
		}
		generator = factory();
		return generator(state);
	};
}

const generateSubModelMap = (
	// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
	...models: Omit<DDSFuzzModel<IChannelFactory, any>, "workloadName">[]
): Map<
	string,
	{
		// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
		factory: IChannelFactory;
		// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
		generator: AsyncGenerator<any, DDSFuzzTestState<IChannelFactory>>;
		// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
		reducer: DDSFuzzModel<IChannelFactory, any>["reducer"];
		// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
		validateConsistency: DDSFuzzModel<IChannelFactory, any>["validateConsistency"];
		// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
		minimizationTransforms?: DDSFuzzModel<IChannelFactory, any>["minimizationTransforms"];
	}
> => {
	const modelMap = new Map<
		string,
		{
			// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
			factory: IChannelFactory;
			// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
			generator: AsyncGenerator<any, DDSFuzzTestState<IChannelFactory>>;
			// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
			reducer: DDSFuzzModel<IChannelFactory, any>["reducer"];
			// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
			validateConsistency: DDSFuzzModel<IChannelFactory, any>["validateConsistency"];
			// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
			minimizationTransforms?: DDSFuzzModel<IChannelFactory, any>["minimizationTransforms"];
		}
	>();
	for (const model of models) {
		const { reducer, generatorFactory, factory, validateConsistency, minimizationTransforms } =
			model;
		const generator = repeatFactoryAsync(generatorFactory);
		modelMap.set(factory.attributes.type, {
			generator,
			reducer,
			factory,
			validateConsistency,
			minimizationTransforms,
		});
	}

	return modelMap;
};

/**
 * here we import the dds models, and do some minor changes to make this easier to nest in the local server stress model.
 */
export const ddsModelMap = generateSubModelMap(
	baseMapModel,
	baseDirModel,
	baseSharedStringModel,
	baseIntervalModel,
	baseSharedMatrixModel,
	baseTreeModel,
	baseSharedArrayModel,
	baseTaskManagerModel,
	baseCounterModel,
	baseRegisterCollectionModel,
	baseConsensusOrderedCollectionModel,
);
