/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	AsyncGenerator,
	AsyncReducer,
	BaseOperation,
	Generator,
	MinimizationTransform,
	Reducer,
} from "@fluid-private/stochastic-test-utils";
import { done } from "@fluid-private/stochastic-test-utils";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";

import { type Client } from "./clientLoading.js";
import { PoisonedDDSFuzzHandle } from "./ddsFuzzHandle.js";
import {
	addClientContext,
	createSuite,
	handles,
	mixinAttach,
	mixinClientSelection,
	mixinNewClient,
	mixinRebase,
	mixinReconnect,
	mixinStashedClient,
	mixinSynchronization,
	convertOnlyAndSkip,
	type DDSFuzzHarnessModel,
	type DDSFuzzModel,
	type DDSFuzzSuiteOptions,
	type DDSFuzzTestState,
	type DDSRandom,
	type HarnessOperation,
	defaultDDSFuzzSuiteOptions,
	type CleanupFunction,
} from "./ddsFuzzHarness.js";
import { makeUnreachableCodePathProxy } from "./utils.js";

export interface SquashRandom extends DDSRandom {
	/**
	 * Generate a handle which should never be sent to other clients.
	 * This is used to simulate data that should be squashed when exiting staging mode / resubmitting ops,
	 * and it is up to the test author to ensure that all such handles are removed before resubmission occurs.
	 * A suggested approach to implement this is to store information about the location of all poisoned handles
	 * in the test state while in staging mode, then listening to the "exitStaging" event to issue remove ops.
	 */
	poisonedHandle(): IFluidHandle;
}

export interface SquashClient<TChannelFactory extends IChannelFactory>
	extends Client<TChannelFactory> {
	/**
	 * 'exiting' means "it's up to the DDS to apply edits which remove any poisoned handles from the document".
	 * They should use TODO to do so
	 */
	stagingModeStatus: "off" | "staging" | "exiting";
}

export interface SquashFuzzModel<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TState extends DDSFuzzTestState<TChannelFactory> = SquashFuzzTestState<TChannelFactory>,
> extends DDSFuzzModel<TChannelFactory, TOperation, TState> {
	/**
	 * This generator will be invoked when the selected client is exiting staging mode.
	 * It is the responsibility of the DDS model to generate one or more operations which remove references to poisoned content
	 * from the document.
	 *
	 * Once all poisoned content is removed, this generator should return "done" to indicate to the harness that it is safe to reconnect.
	 */
	exitingStagingModeGeneratorFactory: () => Generator<TOperation, TState>;
}

/**
 * This model is used within the harness to wrap the provided {@link SquashFuzzModel}.
 *
 * This model's reducer differs from the {@link SquashFuzzModel} in that it can be an asynchronous
 * reducer. This is necessary for the harness to support asynchronous operations
 * like loading new clients, and doing synchronization.
 *
 * @internal
 */
export interface SquashFuzzHarnessModel<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TState extends SquashFuzzTestState<TChannelFactory> = SquashFuzzTestState<TChannelFactory>,
> extends Omit<
		SquashFuzzModel<TChannelFactory, TOperation, TState>,
		"reducer" | "exitingStagingModeGeneratorFactory"
	> {
	/**
	 * Reducer capable of updating the test state according to the operations generated.
	 */
	reducer: AsyncReducer<TOperation, TState> | Reducer<TOperation, TState>;
}

export interface SquashFuzzSuiteOptions extends DDSFuzzSuiteOptions {
	/**
	 * TODO: Document expectations / consider reworking the API. Weird decisions right now.
	 */
	stagingMode: {
		changeStagingModeProbability: number;
	};
}

export interface SquashFuzzTestState<TChannelFactory extends IChannelFactory>
	extends DDSFuzzTestState<TChannelFactory> {
	random: SquashRandom;
	clients: SquashClient<TChannelFactory>[];
	client: SquashClient<TChannelFactory>;
}

export interface ChangeStagingMode {
	type: "changeStagingMode";
	newStatus: "off" | "staging" | "exiting";
}

export type SquashHarnessOperation = HarnessOperation | ChangeStagingMode;

export function mixinStagingMode<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TState extends SquashFuzzTestState<TChannelFactory>,
>(
	model: SquashFuzzModel<TChannelFactory, TOperation, TState>,
	options: SquashFuzzSuiteOptions,
): SquashFuzzHarnessModel<TChannelFactory, TOperation | ChangeStagingMode, TState> {
	const generatorFactory: () => AsyncGenerator<TOperation | ChangeStagingMode, TState> =
		() => {
			const baseGenerator = model.generatorFactory();
			const exitingStagingModeGenerator = model.exitingStagingModeGeneratorFactory();
			return async (state): Promise<TOperation | ChangeStagingMode | typeof done> => {
				if (state.client.stagingModeStatus === "exiting") {
					const op = exitingStagingModeGenerator(state);
					return op === done
						? {
								type: "changeStagingMode",
								newStatus: "off",
							}
						: op;
				}
				if (
					!state.isDetached &&
					state.random.bool(options.stagingMode.changeStagingModeProbability)
				) {
					return {
						type: "changeStagingMode",
						newStatus: state.client.stagingModeStatus === "off" ? "staging" : "exiting",
					};
				}

				return await baseGenerator(state);
			};
		};

	const minimizationTransforms = model.minimizationTransforms as
		| MinimizationTransform<TOperation | ChangeStagingMode>[]
		| undefined;

	const reducer: AsyncReducer<TOperation | ChangeStagingMode, TState> = async (
		state,
		operation,
	) => {
		if (operation.type === "changeStagingMode") {
			state.client.stagingModeStatus = (operation as ChangeStagingMode).newStatus;
			if ((operation as ChangeStagingMode).newStatus === "off") {
				state.client.containerRuntime.connected = true;
			} else if ((operation as ChangeStagingMode).newStatus === "staging") {
				state.client.containerRuntime.connected = false;
			}
			return state;
		} else {
			return model.reducer(state, operation as TOperation);
		}
	};
	return {
		...model,
		minimizationTransforms,
		generatorFactory,
		reducer,
	};
}

const getFullModel = <
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
>(
	ddsModel: SquashFuzzModel<TChannelFactory, TOperation>,
	options: SquashFuzzSuiteOptions,
): SquashFuzzHarnessModel<TChannelFactory, TOperation | SquashHarnessOperation> => {
	const isReconnectAllowed = (state: SquashFuzzTestState<TChannelFactory>) =>
		// When staging mode is active, we don't want to generate any reconnect ops as they could result in poisoned handles being sent to other clients
		// without the DDS model having a chance to remove their content.
		state.client.stagingModeStatus === "off" && !state.isDetached;
	const modelPartsRequiringClientSelection = mixinReconnect(
		mixinRebase(mixinStagingMode(ddsModel, options), options),
		options,
		isReconnectAllowed,
	);
	const setupClientState: (
		state: SquashFuzzTestState<TChannelFactory>,
		client: SquashClient<TChannelFactory>,
	) => CleanupFunction = (state, client) => {
		const baseCleanup = addClientContext(state, client);
		const { poisonedHandle: oldPoisonedHandle } = state.random;
		if (state.client.stagingModeStatus === "staging") {
			state.random.poisonedHandle = () =>
				new PoisonedDDSFuzzHandle(
					state.random.pick(handles),
					client.dataStoreRuntime,
					client.channel.id,
				);
		} else {
			state.random.poisonedHandle = () => {
				// If you encounter this error, you probably need to check `state.client.stagingModeStatus` before generating poisoned handles.
				// If you're generating poisoned handles using `createWeightedGenerator`, you might consider using an acceptance condition on the weights object.
				throw new Error(
					`Poisoned handles should only be generated while in staging mode, but state is currently: ${state.client.stagingModeStatus}. This indicates a bug in the DDS's model.`,
				);
			};
		}
		return () => {
			baseCleanup();
			state.random.poisonedHandle = oldPoisonedHandle;
		};
	};
	const model = mixinAttach(
		mixinSynchronization(
			mixinNewClient(
				mixinStashedClient(
					mixinClientSelection(modelPartsRequiringClientSelection, options, setupClientState),
					options,
				),
				options,
			),
			options,
		),
		options,
	);

	return model;
};

const defaultSquashFuzzOptions: SquashFuzzSuiteOptions = {
	...defaultDDSFuzzSuiteOptions,
	stagingMode: {
		changeStagingModeProbability: 0,
	},
};

/**
 * Creates a fuzz test targetting correctness of a DDS's "squash" functionality while resubmitting ops.
 *
 * This model is an extension of {@link createDDSFuzzSuite}. In addition to whatever set of operations are defined in the DDS's
 * eventual consistency model, this harness also injects the notion of each client entering/exiting a "staging mode".
 *
 * While in staging mode, DDS models should sometimes opt to add "poisoned content" to the document. They do so by generating a
 * 'poisoned handle' using {@link SquashRandom.poisonedHandle}. If this handle is ever sent to another client, the harness will
 * detect this and fail the test.
 *
 * This model helps fuzz test correctness of squash functionality, as before a client exits staging mode, the harness will place it
 * in an "exiting" state and invoke {@link SquashFuzzModel.exitingStagingModeGeneratorFactory} to allow the model to remove any poisoned content from the document.
 * If the DDS's resubmit implementation correctly squashes this insertion+removal of content, this means that other clients should never see it.
 *
 * To do this incrementally, typically a model would want to augment its per-client state with information about where the poisoned content lives in a way that is
 * stable across edits. The {@link DDSFuzzHarnessEvents} event "clientCreate" is a good place to set up any initial state, and specific operations which add poisoned content
 * can augment this state. Other implementations (such as exhaustively walking the DDS contents to look for poisoned content) are also possible, but less efficient.
 *
 * Models should not generate poisoned handles while staging mode is off. This harness will also detect this and report an error indicating
 * the model author has a bug.
 *
 * Model authors should attempt to cover all possible notions by which content may be "added then removed" from their DDS.
 *
 * @internal
 */
export function createSquashFuzzSuite<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
>(
	ddsModel: SquashFuzzModel<TChannelFactory, TOperation>,
	providedOptions?: Partial<SquashFuzzSuiteOptions>,
): void {
	const options = convertOnlyAndSkip({ ...defaultSquashFuzzOptions, ...providedOptions });
	options.emitter.on("testStart", (state) => {
		(state.random as SquashRandom).poisonedHandle =
			makeUnreachableCodePathProxy("random.poisonedHandle");
	});
	const model = getFullModel(ddsModel, options);
	// TODO: Is getting the generic typing to work out is more effort than it's worth?
	createSuite(model as unknown as DDSFuzzHarnessModel<TChannelFactory, TOperation>, options);
}

/**
 * {@inheritDoc (createSquashFuzzSuite:function)}
 * @internal
 */
// Explicit usage of namespace needed for api-extractor.
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace createSquashFuzzSuite {
	/**
	 * Runs only the provided seeds.
	 *
	 * @example
	 *
	 * ```typescript
	 * // Runs only seed 42 for the given model.
	 * createSquashFuzzSuite.only(42)(model);
	 * ```
	 * @internal
	 */
	export const only =
		(...seeds: number[]) =>
		<TChannelFactory extends IChannelFactory, TOperation extends BaseOperation>(
			ddsModel: SquashFuzzModel<TChannelFactory, TOperation>,
			providedOptions?: Partial<SquashFuzzSuiteOptions>,
		): void =>
			createSquashFuzzSuite(ddsModel, {
				...providedOptions,
				only: [...seeds, ...(providedOptions?.only ?? [])],
			});

	/**
	 * Skips the provided seeds.
	 *
	 * @example
	 *
	 * ```typescript
	 * // Skips seed 42 for the given model.
	 * createSquashFuzzSuite.skip(42)(model);
	 * ```
	 * @internal
	 */
	export const skip =
		(...seeds: number[]) =>
		<TChannelFactory extends IChannelFactory, TOperation extends BaseOperation>(
			ddsModel: SquashFuzzModel<TChannelFactory, TOperation>,
			providedOptions?: Partial<SquashFuzzSuiteOptions>,
		): void =>
			createSquashFuzzSuite(ddsModel, {
				...providedOptions,
				skip: [...seeds, ...(providedOptions?.skip ?? [])],
			});
}
