/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { AsyncGenerator, BaseOperation } from "@fluid-private/stochastic-test-utils";
import { chainAsync, done, takeAsync } from "@fluid-private/stochastic-test-utils";
// eslint-disable-next-line import/no-internal-modules
import { Counter } from "@fluid-private/stochastic-test-utils/internal/test/utils";
import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import {
	MockContainerRuntimeFactoryForReconnection,
	MockFluidDataStoreRuntime,
} from "@fluidframework/test-runtime-utils/internal";
import execa from "execa";

import { type Client, hasStashData } from "../clientLoading.js";
import type {
	ChangeConnectionState,
	ClientSpec,
	DDSFuzzHarnessEvents,
	DDSFuzzModel,
	DDSFuzzSuiteOptions,
	DDSFuzzTestState,
	Synchronize,
	TriggerRebase,
} from "../ddsFuzzHarness.js";
import {
	defaultDDSFuzzSuiteOptions,
	mixinAttach,
	mixinClientSelection,
	mixinNewClient,
	mixinRebase,
	mixinReconnect,
	mixinStashedClient,
	mixinSynchronization,
	runTestForSeed,
} from "../ddsFuzzHarness.js";

import { _dirname } from "./dirname.cjs";
import type { Operation, SharedNothingFactory } from "./sharedNothing.js";
import { baseModel, isNoopOp } from "./sharedNothing.js";

type Model = DDSFuzzModel<SharedNothingFactory, Operation | ChangeConnectionState>;

/**
 * Mixes in spying functionality to a DDS fuzz model.
 * @returns A derived DDS fuzz model alongside spied lists of:
 *
 * - operations returned by any generator produced by the model's generator factory.
 * If multiple generators are created by the model, all operations end up in this flat list.
 *
 * - operations processed by the reducer of the model
 *
 * These spy lists are used to validate the behavior of the harness in subsequent tests.
 */
function mixinSpying<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
	TState extends DDSFuzzTestState<TChannelFactory>,
>(
	model: DDSFuzzModel<TChannelFactory, TOperation, TState>,
): {
	model: DDSFuzzModel<TChannelFactory, TOperation, TState>;
	generatedOperations: (TOperation | typeof done)[];
	processedOperations: TOperation[];
} {
	const generatedOperations: (TOperation | typeof done)[] = [];
	const processedOperations: TOperation[] = [];
	const spiedGeneratorFactory = (): AsyncGenerator<TOperation, TState> => {
		const generator = model.generatorFactory();
		return async (state): Promise<TOperation | typeof done> => {
			const op = await generator(state);
			generatedOperations.push(op);
			return op;
		};
	};
	const spiedReducer = async (state: TState, op: TOperation): Promise<void | TState> => {
		processedOperations.push(op);
		return model.reducer(state, op);
	};
	return {
		model: {
			...model,
			generatorFactory: spiedGeneratorFactory,
			reducer: spiedReducer,
		},
		generatedOperations,
		processedOperations,
	};
}

function verifyClientsSendOpsToEachOther(state: DDSFuzzTestState<SharedNothingFactory>): void {
	const { clients, containerRuntimeFactory } = state;
	containerRuntimeFactory.processAllMessages();
	for (const client of clients) {
		// Send an op from each client, synchronize, and verify that each other client processed one more message.
		const processCoreCallsByClient = clients.map(({ channel }) => channel.processCoreCalls);
		client.channel.noop();
		containerRuntimeFactory.processAllMessages();
		for (const [i, { channel }] of clients.entries()) {
			assert.equal(channel.processCoreCalls, processCoreCallsByClient[i] + 1);
		}
	}
}

const defaultOptions: DDSFuzzSuiteOptions = {
	...defaultDDSFuzzSuiteOptions,
	detachedStartOptions: { numOpsBeforeAttach: 0 },
};

describe("DDS Fuzz Harness", () => {
	// This harness relies on some specific behavior of the shared mocks: putting acceptance tests here
	// for that behavior makes them brittle.
	describe("Fluid mocks", () => {
		it("update the quorum when a new client joins", () => {
			const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
			const addedClientIds: string[] = [];
			containerRuntimeFactory.quorum.on("addMember", (clientId: string) => {
				addedClientIds.push(clientId);
			});

			assert.deepEqual(addedClientIds, []);
			containerRuntimeFactory.createContainerRuntime(
				new MockFluidDataStoreRuntime({ clientId: "new client" }),
			);
			assert.deepEqual(addedClientIds, ["new client"]);
		});
	});

	describe("runTestForSeed", () => {
		it("gives its clients reasonable IDs", async () => {
			const model: Model = {
				...baseModel,
				generatorFactory: () => takeAsync(1, baseModel.generatorFactory()),
			};
			const finalState = await runTestForSeed(model, defaultOptions, 0);
			assert.equal(finalState.summarizerClient.containerRuntime.clientId, "summarizer");
			for (const client of finalState.clients) {
				assert.equal(client.containerRuntime.clientId, client.channel.id);
			}
			assert.deepEqual(
				finalState.clients.map((c) => c.channel.id),
				["A", "B", "C"],
			);
		});

		it("loads initial clients from summary", async () => {
			const model: Model = {
				...baseModel,
				generatorFactory: () => takeAsync(1, baseModel.generatorFactory()),
			};
			const finalState = await runTestForSeed(model, defaultOptions, 0);
			assert(finalState.summarizerClient.channel.methodCalls.includes("summarizeCore"));
			for (const client of finalState.clients) {
				assert.deepEqual(client.channel.methodCalls, ["loadCore"]);
			}
		});

		it("throws a reasonable error if given an exhausted generator", async () => {
			const model: Model = {
				...baseModel,
				generatorFactory: () => takeAsync(0, baseModel.generatorFactory()),
			};
			await assert.rejects(
				runTestForSeed(model, defaultOptions, 0),
				/Generator should have produced at least one operation/,
			);
		});
	});

	describe("mixinSynchronization", () => {
		const synchronize: Synchronize = { type: "synchronize" };
		describe("with fixed interval validation", () => {
			const options: DDSFuzzSuiteOptions = {
				...defaultOptions,
				validationStrategy: { type: "fixedInterval", interval: 2 },
				reconnectProbability: 0,
				detachedStartOptions: {
					numOpsBeforeAttach: 0,
				},
			};

			it("generates synchronize ops", async () => {
				const { model, generatedOperations } = mixinSpying(
					mixinSynchronization(
						{
							...baseModel,
							generatorFactory: () => takeAsync(4, baseModel.generatorFactory()),
						},
						options,
					),
				);
				await runTestForSeed(model, options, 0);
				assert.equal(
					generatedOperations.filter((op) => op !== done && op.type === "synchronize").length,
					2,
				);
				assert.deepEqual(generatedOperations[2], synchronize);
				assert.deepEqual(generatedOperations[5], synchronize);
			});

			it("processes outstanding messages on synchronize ops", async () => {
				const noValidateModel: Model = {
					...baseModel,
					reducer: async ({ clients }, operation) => {
						assert(isNoopOp(operation));
						clients[0].channel.noop();
					},
					generatorFactory: () => takeAsync(4, baseModel.generatorFactory()),
				};
				const { model, processedOperations } = mixinSpying(
					mixinSynchronization(noValidateModel, options),
				);
				const finalState = await runTestForSeed(model, options, 0);
				assert.deepEqual(finalState.clients[0].channel.methodCalls, [
					"loadCore",
					"noop",
					"noop",
					"processCore",
					"processCore",
					"noop",
					"noop",
					"processCore",
					"processCore",
				]);
				assert.deepEqual(finalState.clients[1].channel.methodCalls, [
					"loadCore",
					"processCore",
					"processCore",
					"processCore",
					"processCore",
				]);
				assert.equal(processedOperations.length, 6);
			});

			it("invokes the validateConsistency function for each client", async () => {
				const perPairCallCounts = new Counter<string>();
				const model = mixinSynchronization(
					{
						...baseModel,
						generatorFactory: () => takeAsync(4, baseModel.generatorFactory()),
						validateConsistency: (a, b) => {
							perPairCallCounts.increment(`${a.channel.id} vs ${b.channel.id}`);
						},
					},
					options,
				);
				await runTestForSeed(model, options, 0);

				assert.deepEqual(
					[...perPairCallCounts.entries()],
					[
						["A vs summarizer", 2],
						["B vs summarizer", 2],
						["C vs summarizer", 2],
					],
				);
			});

			it("avoids asserting disconnected clients are consistent", async () => {
				const perPairCallCounts = new Counter<string>();
				const model = mixinReconnect(
					mixinSynchronization(
						{
							...baseModel,
							generatorFactory: () =>
								chainAsync(
									takeAsync(2, baseModel.generatorFactory()),
									takeAsync(
										1,
										async (
											state: DDSFuzzTestState<SharedNothingFactory>,
										): Promise<ChangeConnectionState> => {
											// Selecting which client to apply the operation to is typically done by
											// `mixinClientSelection`. To keep this test simple, we do that manually
											// here instead.
											state.client = state.clients[0];
											return {
												type: "changeConnectionState",
												connected: false,
											};
										},
									),
									takeAsync(1, baseModel.generatorFactory()),
								),
							validateConsistency: (a, b) => {
								perPairCallCounts.increment(`${a.channel.id} vs ${b.channel.id}`);
							},
						},
						options,
					),
					options,
				);
				await runTestForSeed(model, options, 0);

				assert.deepEqual(
					[...perPairCallCounts.entries()],
					[
						["A vs summarizer", 1],
						["B vs summarizer", 2],
						["C vs summarizer", 2],
					],
				);
			});
		});

		describe("with random synchronization validation", () => {
			const options: DDSFuzzSuiteOptions = {
				...defaultDDSFuzzSuiteOptions,
				validationStrategy: { type: "random", probability: 0.25 },
				detachedStartOptions: {
					numOpsBeforeAttach: 0,
				},
			};
			it("generates synchronize ops", async () => {
				const { model, generatedOperations } = mixinSpying(
					mixinSynchronization(
						{
							...baseModel,
							generatorFactory: () => takeAsync(30, baseModel.generatorFactory()),
						},
						options,
					),
				);
				await runTestForSeed(model, options, 0);
				// Since we fix the seed above, this test is reliable.
				// Probability of this not occurring for a given seed is 0.75^30 which is roughly 1 in 5000.
				assert(generatedOperations.some((op) => op !== done && op.type === "synchronize"));
			});
		});
	});

	describe("mixinReconnect", () => {
		const options = { ...defaultOptions, reconnectProbability: 0.25 };
		it("generates reconnection ops", async () => {
			const { model, generatedOperations } = mixinSpying(
				mixinClientSelection(
					mixinReconnect(
						{
							...baseModel,
							generatorFactory: () => takeAsync(30, baseModel.generatorFactory()),
						},
						options,
					),
					options,
				),
			);
			await runTestForSeed(model, options, 0);
			const changeConnectionStateOps: ChangeConnectionState[] =
				generatedOperations.filter<ChangeConnectionState>(
					(op): op is ChangeConnectionState =>
						op !== done && op.type === "changeConnectionState",
				);
			assert(changeConnectionStateOps.length > 0);
			// As long as a single client was chosen twice, there should be some 'disconnect' and some 'reconnect' operations.
			assert(changeConnectionStateOps.some((op) => op.connected));
			assert(changeConnectionStateOps.some((op) => !op.connected));
		});

		it("reasonably processes reconnection ops", async () => {
			const model = mixinReconnect(
				{
					...baseModel,
					generatorFactory: () =>
						takeAsync(
							1,
							async (
								state: DDSFuzzTestState<SharedNothingFactory>,
							): Promise<ChangeConnectionState> => {
								state.client = state.clients[0];
								return {
									type: "changeConnectionState",
									connected: false,
								};
							},
						),
				},
				{ ...options, reconnectProbability: 0 },
			);
			const finalState = await runTestForSeed(model, options, 0);

			assert.deepEqual(
				finalState.clients.map((c) => c.containerRuntime.connected),
				[false, true, true],
			);
		});
	});

	describe("mixinRebase", () => {
		const options = { ...defaultDDSFuzzSuiteOptions, rebaseProbability: 0.5 };
		it("generates rebasing ops", async () => {
			const count = 20;
			const { model, generatedOperations } = mixinSpying(
				mixinClientSelection(
					mixinRebase(
						{
							...baseModel,
							generatorFactory: () => takeAsync(count, baseModel.generatorFactory()),
						},
						options,
					),
					options,
				),
			);
			await runTestForSeed(model, options, 0);
			const rebaseOps: TriggerRebase[] = generatedOperations.filter<TriggerRebase>(
				(op): op is TriggerRebase => op !== done && op.type === "rebase",
			);
			assert(rebaseOps.length > 0 && rebaseOps.length <= count / 2);
		});
	});

	describe("mixinClientSelection", () => {
		const options = defaultOptions;
		it("selects a client for each operation", async () => {
			const generatorSelectionCounts = new Counter<string>();
			const reducerSelectionCounts = new Counter<string>();
			const model = mixinClientSelection(
				{
					...baseModel,
					generatorFactory: () =>
						takeAsync(30, async (state: DDSFuzzTestState<SharedNothingFactory>) => {
							generatorSelectionCounts.increment(state.client.channel.id);
							return { type: "noop" };
						}),
					reducer: async ({ client }) => {
						reducerSelectionCounts.increment(client.channel.id);
					},
					minimizationTransforms: [],
				},
				options,
			);
			await runTestForSeed(model, options, 0);
			assert.deepEqual([...reducerSelectionCounts.values()].sort(), ["A", "B", "C"]);
			assert.equal(
				[...reducerSelectionCounts.counts()].reduce((a, b) => a + b),
				30,
			);
			assert.deepEqual(reducerSelectionCounts.entries(), generatorSelectionCounts.entries());
		});

		it("injects clientId onto generated operations", async () => {
			const { model, generatedOperations } = mixinSpying(
				mixinClientSelection(
					{
						...baseModel,
						generatorFactory: () => takeAsync(5, baseModel.generatorFactory()),
					},
					options,
				),
			);
			await runTestForSeed(model, options, 0);
			assert(
				generatedOperations.every(
					(op) => op === done || (op as unknown as ClientSpec).clientId !== undefined,
				),
			);
		});
	});

	describe("mixinNewClient", () => {
		it("can add new clients to the fuzz test", async () => {
			const options = {
				...defaultOptions,
				numberOfClients: 3,
				clientJoinOptions: {
					maxNumberOfClients: 4,
					clientAddProbability: 0.25,
					stashableClientProbability: 0.2,
				},
			};
			const model = mixinNewClient(
				{
					...baseModel,
					generatorFactory: () => takeAsync(30, baseModel.generatorFactory()),
				},
				options,
			);
			const finalState = await runTestForSeed(model, options, 0);
			assert.equal(finalState.clients.length, 4);
			assert(finalState.clients[3].channel.methodCalls.includes("loadCore"));
		});

		it("can add new stashable clients to the fuzz test", async () => {
			const options = {
				...defaultOptions,
				numberOfClients: 3,
				clientJoinOptions: {
					maxNumberOfClients: 4,
					clientAddProbability: 0.25,
					stashableClientProbability: 1,
				},
			};
			const model = mixinNewClient(
				{
					...baseModel,
					generatorFactory: () => takeAsync(30, baseModel.generatorFactory()),
				},
				options,
			);
			const finalState = await runTestForSeed(model, options, 0);
			assert.equal(finalState.clients.length, 4);
			assert(finalState.clients.every((c) => hasStashData(c)));
			assert(!hasStashData(finalState.summarizerClient));
			assert(finalState.clients[3].channel.methodCalls.includes("loadCore"));
		});
	});

	describe("mixinStashClient", () => {
		it("stashable clients changes can be restored on new client without saved ops", async () => {
			const options = {
				...defaultOptions,
				numberOfClients: 1,
				clientJoinOptions: {
					maxNumberOfClients: 1,
					clientAddProbability: 0.25,
					stashableClientProbability: 1,
				},
				emitter: new TypedEventEmitter<DDSFuzzHarnessEvents>(),
			};

			const clientCreates: Client<SharedNothingFactory>[] = [];
			options.emitter.on("clientCreate", (c) => clientCreates.push(c));

			const model = mixinStashedClient(
				{
					...baseModel,
					reducer: async ({ clients }, operation) => {
						if (isNoopOp(operation)) {
							clients[0].channel.noop();
						}
					},
					generatorFactory: () => takeAsync(5, baseModel.generatorFactory()),
				},
				options,
			);
			const finalState = await runTestForSeed(model, options, 0);
			assert.equal(finalState.clients.length, 1);
			assert.strictEqual(clientCreates.length, 3);

			assert.strictEqual(clientCreates[0].containerRuntime.clientId, "summarizer");

			// original client
			assert.strictEqual(clientCreates[1].channel.applyStashedOpCalls, 0);
			assert.strictEqual(clientCreates[1].channel.noopCalls, 5);
			assert.strictEqual(clientCreates[1].channel.processCoreCalls, 0);

			// client loaded from stash
			assert.strictEqual(clientCreates[2].channel.applyStashedOpCalls, 5);
			assert.strictEqual(clientCreates[2].channel.noopCalls, 5);
			assert.strictEqual(clientCreates[2].channel.processCoreCalls, 0);
		});

		it("stashable clients changes can be restored on new client with saved ops", async () => {
			const options: DDSFuzzSuiteOptions = {
				...defaultOptions,
				numberOfClients: 1,
				clientJoinOptions: {
					maxNumberOfClients: 1,
					clientAddProbability: 0.25,
					stashableClientProbability: 1,
				},
				validationStrategy: {
					type: "fixedInterval",
					interval: 3,
				},
				emitter: new TypedEventEmitter<DDSFuzzHarnessEvents>(),
			};

			const clientCreates: Client<SharedNothingFactory>[] = [];
			options.emitter.on("clientCreate", (c) => clientCreates.push(c));

			const model = mixinStashedClient(
				mixinSynchronization(
					{
						...baseModel,
						reducer: async ({ clients }, operation) => {
							if (isNoopOp(operation)) {
								clients[0].channel.noop();
							}
						},
						generatorFactory: () => takeAsync(10, baseModel.generatorFactory()),
					},
					options,
				),
				options,
			);
			const finalState = await runTestForSeed(model, options, 0);
			assert.equal(finalState.clients.length, 1);
			assert.strictEqual(clientCreates.length, 3);

			assert.strictEqual(clientCreates[0].containerRuntime.clientId, "summarizer");

			// original client
			assert.strictEqual(clientCreates[1].channel.applyStashedOpCalls, 0);
			assert.strictEqual(clientCreates[1].channel.noopCalls, 5);
			assert.strictEqual(clientCreates[1].channel.processCoreCalls, 3);

			// client loaded from stash
			assert.strictEqual(
				clientCreates[2].channel.applyStashedOpCalls,
				2,
				"3 should be saved, and 2 should be stashed",
			);
			assert.strictEqual(clientCreates[2].channel.noopCalls, 7);
			assert.strictEqual(clientCreates[2].channel.processCoreCalls, 9);
		});
	});

	describe("mixinAttach", () => {
		describe("with detached start enabled", () => {
			const makeOptions = (): DDSFuzzSuiteOptions => ({
				...defaultDDSFuzzSuiteOptions,
				numberOfClients: 3,
				detachedStartOptions: {
					numOpsBeforeAttach: 5,
				},
				emitter: new TypedEventEmitter(),
			});

			it("starts from a state with one client", async () => {
				const options = makeOptions();

				let testStartAssertsRan = false;
				options.emitter.on(
					"testStart",
					(initialState: DDSFuzzTestState<SharedNothingFactory>) => {
						assert.equal(initialState.clients.length, 1);
						assert.equal(initialState.clients[0].channel.isAttached(), false);
						assert.equal(initialState.clients[0], initialState.summarizerClient);
						testStartAssertsRan = true;
					},
				);
				const model = mixinAttach(
					{
						...baseModel,
						generatorFactory: () => takeAsync(1, baseModel.generatorFactory()),
					},
					options,
				);
				await runTestForSeed(model, options, 0);
				assert.equal(testStartAssertsRan, true);
			});

			it("causes other clients to join after attach", async () => {
				const options = makeOptions();

				const { model, generatedOperations } = mixinSpying(
					mixinAttach(
						{
							...baseModel,
							generatorFactory: () => takeAsync(12, baseModel.generatorFactory()),
						},
						options,
					),
				);
				const finalState = await runTestForSeed(model, options, 0);
				assert.deepEqual(
					finalState.clients.map((client) => client.channel.id),
					["A", "B", "C"],
				);
				assert.equal(finalState.summarizerClient.channel.id, "summarizer");
				assert.deepEqual(generatedOperations[5], { type: "rehydrate" });
				assert.deepEqual(generatedOperations[11], { type: "attach" });
				verifyClientsSendOpsToEachOther(finalState);
			});
		});

		describe("with detached start disabled", () => {
			const makeOptions = (): DDSFuzzSuiteOptions => ({
				...defaultDDSFuzzSuiteOptions,
				numberOfClients: 3,
				detachedStartOptions: {
					numOpsBeforeAttach: 0,
				},
				emitter: new TypedEventEmitter(),
			});

			it("starts from an attached state with more than one client", async () => {
				const options = makeOptions();

				let testStartAssertsRan = false;
				options.emitter.on(
					"testStart",
					(initialState: DDSFuzzTestState<SharedNothingFactory>) => {
						assert.equal(initialState.clients.length, 3);
						assert.equal(initialState.clients[0].channel.isAttached(), true);
						assert.notEqual(initialState.clients[0], initialState.summarizerClient);
						verifyClientsSendOpsToEachOther(initialState);
						testStartAssertsRan = true;
					},
				);
				const model = mixinAttach(
					{
						...baseModel,
						generatorFactory: () => takeAsync(1, baseModel.generatorFactory()),
					},
					options,
				);
				await runTestForSeed(model, options, 0);
				assert.equal(testStartAssertsRan, true);
			});
		});
	});

	describe("mixinStashClient", () => {});

	describe("events", () => {
		describe("clientCreate", () => {
			it("is raised for initial clients before generating any operations", async () => {
				const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
				const log: string[] = [];
				emitter.on("clientCreate", (client) => {
					log.push(client.containerRuntime.clientId);
				});
				const options = {
					...defaultOptions,
					numberOfClients: 3,
					emitter,
				};

				const model: typeof baseModel = {
					...baseModel,
					generatorFactory: () =>
						takeAsync(1, async (): Promise<Operation> => {
							log.push("generated an operation");
							return { type: "noop" };
						}),
				};
				const finalState = await runTestForSeed(model, options, 0);
				assert.equal(finalState.clients.length, 3);
				assert.deepEqual(log, ["summarizer", "A", "B", "C", "generated an operation"]);
			});

			it("is raised for clients added to the test mid-run", async () => {
				const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
				const log: string[] = [];
				emitter.on("clientCreate", (client) => {
					log.push(client.containerRuntime.clientId);
				});
				const options = {
					...defaultOptions,
					numberOfClients: 3,
					clientJoinOptions: {
						maxNumberOfClients: 4,
						clientAddProbability: 0.25,
						stashableClientProbability: 0.2,
					},
					emitter,
				};
				const model = mixinNewClient(
					{
						...baseModel,
						generatorFactory: () => takeAsync(30, baseModel.generatorFactory()),
					},
					options,
				);
				await runTestForSeed(model, options, 0);
				assert.deepEqual(log, ["summarizer", "A", "B", "C", "D"]);
			});
		});
		describe("testStart", () => {
			it("is raised before performing the fuzzActions, but after creating the clients", async () => {
				const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
				const log: string[] = [];
				emitter.on("clientCreate", (client) => {
					log.push(client.containerRuntime.clientId);
				});
				emitter.on("testStart", (initialState) => {
					log.push("testStart");
				});
				const options = {
					...defaultOptions,
					numberOfClients: 3,
					emitter,
				};

				const model: typeof baseModel = {
					...baseModel,
					generatorFactory: () =>
						takeAsync(1, async (): Promise<Operation> => {
							log.push("generated an operation");
							return { type: "noop" };
						}),
				};
				const finalState = await runTestForSeed(model, options, 0);
				assert.equal(finalState.clients.length, 3);
				assert.deepEqual(log, [
					"summarizer",
					"A",
					"B",
					"C",
					"testStart",
					"generated an operation",
				]);
			});
		});
		describe("testEnd", () => {
			it("is raised after performing the fuzzActions", async () => {
				const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();
				const log: string[] = [];
				emitter.on("clientCreate", (client) => {
					log.push(client.containerRuntime.clientId);
				});
				emitter.on("testEnd", (state) => {
					log.push("testEnd");
				});
				const options = {
					...defaultOptions,
					numberOfClients: 3,
					emitter,
				};

				const model: typeof baseModel = {
					...baseModel,
					generatorFactory: () =>
						takeAsync(1, async (): Promise<Operation> => {
							log.push("generated an operation");
							return { type: "noop" };
						}),
				};
				const finalState = await runTestForSeed(model, options, 0);
				assert.equal(finalState.clients.length, 3);
				assert.deepEqual(log, [
					"summarizer",
					"A",
					"B",
					"C",
					"generated an operation",
					"testEnd",
				]);
			});
		});
	});

	describe("suite creation", () => {
		interface MochaReport {
			stats: StatsReport;
			tests: TestReport[];
			pending: TestReport[];
			failures: FailingTestReport[];
			passes: TestReport[];
		}

		interface TestReport {
			title: string;
			fullTitle: string;
		}

		interface FailingTestReport extends TestReport {
			err: {
				message: string;
				stack: string;
			};
		}

		interface StatsReport {
			suites: number;
			tests: number;
			passes: number;
			pending: number;
			failures: number;
		}

		async function runTestFile(name: string): Promise<MochaReport> {
			const result = await execa(
				"npm",
				[
					"run",
					"test:mocha:base",
					"--silent",
					"--",
					"--reporter=json",
					path.join(_dirname, `./ddsSuiteCases/${name}.js`),
				],
				{
					env: {
						FLUID_TEST_VERBOSE: undefined,
					},
					encoding: "utf8",
					reject: false,
				},
			);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const testResults: MochaReport = JSON.parse(result.stdout);
			return testResults;
		}

		describe("supports modified .only syntax", () => {
			let runResults: MochaReport;
			before(async function () {
				// 2s timeout is a bit aggressive to run mocha, even though the suite of tests is very fast.
				this.timeout(5000);
				runResults = await runTestFile("dotOnly");
			});

			it("via .only(2, 3)", () => {
				const tests = runResults.passes
					.filter((p) => p.fullTitle.includes("1: .only via function"))
					.sort();
				assert.deepEqual(
					tests.map((t) => t.title),
					[
						"workload: 1: .only via function seed: 2",
						"workload: 1: .only via function seed: 3",
					],
				);
			});

			it("via `only: [4, 7]`", () => {
				const tests = runResults.passes
					.filter((p) => p.fullTitle.includes("2: .only via options"))
					.sort();
				assert.deepEqual(
					tests.map((t) => t.title),
					["workload: 2: .only via options seed: 4", "workload: 2: .only via options seed: 7"],
				);
			});

			it("via a combination of .only() and `only: []`", () => {
				const tests = runResults.passes
					.filter((p) => p.fullTitle.includes("3: .only via function and options"))
					.sort();
				assert.deepEqual(
					tests.map((t) => t.title),
					[
						"workload: 3: .only via function and options seed: 2",
						"workload: 3: .only via function and options seed: 4",
						"workload: 3: .only via function and options seed: 7",
					],
				);
			});

			it("runs multiple suites with .only simultaneously set", () => {
				assert.equal(runResults.stats.tests, 7);
				assert.equal(runResults.stats.pending, 0);
				assert.equal(runResults.stats.failures, 0);
			});
		});

		describe("supports modified .skip syntax", () => {
			let runResults: MochaReport;
			before(async function () {
				// 2s timeout is a bit aggressive to run mocha, even though the suite of tests is very fast.
				this.timeout(5000);
				runResults = await runTestFile("dotSkip");
			});

			it("via .skip(2, 3)", () => {
				const tests = runResults.passes
					.filter((p) => p.fullTitle.includes("1: .skip via function"))
					.sort();
				assert.deepEqual(
					tests.map((t) => t.title),
					[0, 1, 4, 5, 6, 7, 8, 9].map((i) => `workload: 1: .skip via function seed: ${i}`),
				);
			});

			it("via `skip: [4, 7]`", () => {
				const tests = runResults.passes
					.filter((p) => p.fullTitle.includes("2: .skip via options"))
					.sort();
				assert.deepEqual(
					tests.map((t) => t.title),
					[0, 1, 2, 3, 5, 6, 8, 9].map((i) => `workload: 2: .skip via options seed: ${i}`),
				);
			});

			it("via a combination of .skip() and `skip: []`", () => {
				const tests = runResults.passes
					.filter((p) => p.fullTitle.includes("3: .skip via function and options"))
					.sort();
				assert.deepEqual(
					tests.map((t) => t.title),
					[0, 1, 3, 5, 6, 8, 9].map(
						(i) => `workload: 3: .skip via function and options seed: ${i}`,
					),
				);
			});

			it("runs multiple suites with .skip simultaneously set", () => {
				assert.equal(runResults.stats.tests, 30);
				assert.equal(runResults.stats.pending, 7);
				assert.equal(runResults.stats.passes, 23);
				assert.equal(runResults.stats.failures, 0);
			});
		});

		describe("failure", () => {
			let runResults: MochaReport;
			const jsonDir = path.join(_dirname, "./ddsSuiteCases/failing-configuration");
			before(async function () {
				this.timeout(5000);
				fs.rmSync(jsonDir, { force: true, recursive: true });
				runResults = await runTestFile("failure");
			});

			it("is reported to mocha reasonably", () => {
				assert.equal(runResults.stats.failures, 2);
				assert.deepEqual(
					runResults.failures.map((test) => test.fullTitle),
					[
						"failing configuration workload: failing configuration seed: 0",
						"failing configuration workload: failing configuration seed: 1",
					],
				);
				assert(
					runResults.failures.every((test) => test.err.message.includes("Injected failure")),
				);
			});

			const inCi = !!process.env.TF_BUILD;
			if (inCi) {
				it("doesn't cause failure files to be written to disk", () => {
					const file0Exists = fs.existsSync(path.join(jsonDir, "0.json"));
					const file1Exists = fs.existsSync(path.join(jsonDir, "1.json"));

					// we don't write files in CI to avoid superfluous computation
					assert(!file0Exists, "expected file0 to not be written in CI");
					assert(!file1Exists, "expected file0 to not be written in CI");
				});
			} else {
				it("causes failure files to be written to disk", () => {
					const file0Exists = fs.existsSync(path.join(jsonDir, "0.json"));
					const file1Exists = fs.existsSync(path.join(jsonDir, "1.json"));

					assert(file0Exists);
					assert(file1Exists);

					const contents: unknown = JSON.parse(
						fs.readFileSync(path.join(jsonDir, "0.json"), { encoding: "utf8" }),
					);
					assert.deepEqual(contents, [{ clientId: "A", type: "noop" }]);
				});
			}
		});

		describe("replay", () => {
			let runResults: MochaReport;
			before(async function () {
				this.timeout(5000);
				runResults = await runTestFile("replay");
			});

			// Replay functionality is a bit more difficult to test from the outside perspective, so the replay
			// test file has its own assertions which should cause failure if replay is not working.
			it("successfully references the replay file", () => {
				assert.equal(runResults.stats.passes, 1);
				assert.equal(runResults.stats.failures, 0);
			});
		});
	});
});
