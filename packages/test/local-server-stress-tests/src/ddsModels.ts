/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { done, type AsyncGenerator } from "@fluid-private/stochastic-test-utils";
import { DDSFuzzModel, DDSFuzzTestState } from "@fluid-private/test-dds-utils";
import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
// eslint-disable-next-line import/no-internal-modules
import { baseMapModel, baseDirModel } from "@fluidframework/map/internal/test";
import {
	baseSharedStringModel,
	baseIntervalModel,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/sequence/internal/test";

function repeatFactoryAsync<T, TState = void>(
	factory: () => AsyncGenerator<T, TState>,
): AsyncGenerator<T, TState> {
	let generator = factory();
	return async (state: TState) => {
		const next = await generator(state);
		if (next !== done) {
			return next;
		}
		generator = factory();
		return generator(state);
	};
}

const generateSubModelMap = (
	...models: Omit<DDSFuzzModel<IChannelFactory, any>, "workloadName">[]
) => {
	const modelMap = new Map<
		string,
		{
			factory: IChannelFactory;
			generator: AsyncGenerator<any, DDSFuzzTestState<IChannelFactory>>;
			reducer: DDSFuzzModel<IChannelFactory, any>["reducer"];
			validateConsistency: DDSFuzzModel<IChannelFactory, any>["validateConsistency"];
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
);
