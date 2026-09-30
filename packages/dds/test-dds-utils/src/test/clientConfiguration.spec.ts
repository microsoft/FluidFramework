/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	asyncGeneratorFromArray,
	done,
	FuzzTestMinimizer,
	takeAsync,
	type SaveInfo,
} from "@fluid-private/stochastic-test-utils";
import type { IChannelAttributes } from "@fluidframework/datastore-definitions/internal";
import execa from "execa";
import type { JsonSerializable } from "@fluidframework/core-interfaces/internal";

import type { Client } from "../clientLoading.js";
import {
	createDDSFuzzSuite,
	defaultDDSFuzzSuiteOptions,
	mixinAttach,
	mixinNewClient,
	mixinStashedClient,
	replayTest,
	runTestForSeed,
	type DDSFuzzHarnessEvents,
	type DDSFuzzModel,
	type DDSFuzzSuiteOptions,
	type DDSFuzzTestState,
	type HarnessOperation,
} from "../ddsFuzzHarness.js";
import {
	createSquashFuzzSuite,
	type SquashFuzzModel,
	type SquashFuzzTestState,
} from "../squashFuzzHarness.js";

import { baseModel, type Operation, SharedNothingFactory } from "./sharedNothing.js";
import { _dirname } from "./dirname.cjs";

interface Configuration {
	version: "current" | "previous";
	options: { enabled: boolean };
}

type State = DDSFuzzTestState<SharedNothingFactory, Configuration>;
type TestOperation = Operation | HarnessOperation<Configuration>;
type Model = DDSFuzzModel<SharedNothingFactory, TestOperation, State>;

class ConfiguredFactory extends SharedNothingFactory {
	public constructor(private readonly configuration: Configuration) {
		super();
	}

	public override get attributes(): IChannelAttributes {
		return {
			...super.attributes,
			packageVersion: JSON.stringify(this.configuration),
		};
	}
}

function createModel(): Model {
	return {
		...baseModel,
		minimizationTransforms: [],
		clientConfiguration: {
			generate: (random, { clientId, isSummarizer }) => ({
				version: isSummarizer || clientId === "B" ? "previous" : "current",
				options: { enabled: random.bool() },
			}),
			factory: (configuration) => new ConfiguredFactory(configuration),
		},
		generatorFactory: () => takeAsync(3, async () => ({ type: "noop" })),
		reducer: () => {},
		validateConsistency: () => {},
	};
}

function assertConfigurationApplied(client: Client<SharedNothingFactory>): void {
	assert(client.channel.attributes.packageVersion !== undefined);
	assert.deepEqual(
		JSON.parse(client.channel.attributes.packageVersion),
		client.clientConfiguration,
	);
}

describe("DDS fuzz client configuration", () => {
	let directory: string;
	let operationsFile: string;
	let saveInfo: SaveInfo;
	let options: DDSFuzzSuiteOptions;

	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), "dds-client-configuration-"));
		operationsFile = join(directory, "operations.json");
		saveInfo = {
			saveOnSuccess: { path: operationsFile },
			saveOnFailure: { path: operationsFile },
			saveFluidOps: false,
		};
		options = {
			...defaultDDSFuzzSuiteOptions,
			detachedStartOptions: { numOpsBeforeAttach: 0 },
			emitter: new TypedEventEmitter<DDSFuzzHarnessEvents>(),
		};
	});

	describe("configured fuzz suites", () => {
		const model = createModel();
		model.validateConsistency = (a, b) => {
			assertConfigurationApplied(a);
			assertConfigurationApplied(b);
		};
		const suiteOptions: Partial<DDSFuzzSuiteOptions> = {
			defaultTestCount: 1,
			saveFailures: false,
			detachedStartOptions: { numOpsBeforeAttach: 1, rehydrateDisabled: true },
			clientJoinOptions: { maxNumberOfClients: 4, clientAddProbability: 1 },
		};
		createDDSFuzzSuite(model, {
			...suiteOptions,
			emitter: new TypedEventEmitter<DDSFuzzHarnessEvents>(),
		});

		const squashModel: SquashFuzzModel<
			SharedNothingFactory,
			TestOperation,
			SquashFuzzTestState<SharedNothingFactory, Configuration>
		> = {
			...model,
			workloadName: "configured squash",
			reducer: () => {},
			exitingStagingModeGeneratorFactory: () => () => done,
			validatePoisonedContentRemoved: () => {},
		};
		createSquashFuzzSuite(squashModel, {
			...suiteOptions,
			emitter: new TypedEventEmitter<DDSFuzzHarnessEvents>(),
		});
	});

	afterEach(() => {
		rmSync(directory, { recursive: true });
	});

	function readOperations(): TestOperation[] {
		return JSON.parse(readFileSync(operationsFile, "utf8")) as TestOperation[];
	}

	it("replays configured clients through the suite's replay option", async function () {
		this.timeout(15000);
		const result = await execa(
			"npm",
			[
				"exec",
				"mocha",
				"--silent",
				"--",
				"--config",
				join(_dirname, "../../.mocharc.harnessTests.cjs"),
				join(_dirname, "ddsSuiteCases/clientConfigurationReplay.js"),
			],
			{
				env: { FLUID_TEST_VERBOSE: undefined, SILENT_TEST_OUTPUT: "1" },
			},
		);
		const report = JSON.parse(result.stdout) as {
			stats: { passes: number; failures: number };
		};
		assert.equal(report.stats.passes, 1);
		assert.equal(report.stats.failures, 0);
	});

	it("records and applies configuration for initial clients, the summarizer, and later joins", async () => {
		options.clientJoinOptions = {
			maxNumberOfClients: 4,
			clientAddProbability: 1,
		};
		const created: Client<SharedNothingFactory>[] = [];
		options.emitter.on("clientCreate", (client) => {
			assert(client.clientConfiguration !== undefined);
			created.push(client);
		});
		const model = mixinNewClient(createModel(), options);
		const state = await runTestForSeed(model, options, 0, saveInfo);
		assert.equal(state.clients.length, 4);
		assert.equal(created.length, 5);
		for (const client of created) {
			assertConfigurationApplied(client);
		}
		assert.equal(state.summarizerClient.clientConfiguration?.version, "previous");
		assert.equal(state.clients[0].clientConfiguration?.version, "current");

		const operations = readOperations();
		const initialization = operations[0];
		assert(initialization.type === "initialize");
		assert.equal(initialization.initialClient.clientId, "summarizer");
		assert.deepEqual(
			[initialization.initialClient, ...initialization.clients].map(
				(client) => client.clientConfiguration,
			),
			created.slice(0, 4).map((client) => client.clientConfiguration),
		);
		const add = operations.find((operation) => operation.type === "addClient");
		assert(add !== undefined);
		assert.equal(add.addedClientId, "D");
		assert.deepEqual(add.clientConfiguration, state.clients[3].clientConfiguration);
	});

	it("replays recorded choices without generating configurations again", async () => {
		options.clientJoinOptions = {
			maxNumberOfClients: 4,
			clientAddProbability: 1,
		};
		const model = mixinNewClient(createModel(), options);
		assert(model.clientConfiguration !== undefined);
		const original = await runTestForSeed(model, options, 0, saveInfo);
		const operations = readOperations();
		let replayed: DDSFuzzTestState<SharedNothingFactory> | undefined;
		options.emitter.on("testEnd", (state) => {
			replayed = state;
		});
		await replayTest(
			{
				...model,
				clientConfiguration: {
					...model.clientConfiguration,
					generate: () => assert.fail("Replay must not generate client configurations."),
				},
			},
			999,
			asyncGeneratorFromArray(operations),
			undefined,
			options,
		);
		assert(replayed !== undefined);
		assert.deepEqual(
			replayed.clients.map((client) => client.clientConfiguration),
			original.clients.map((client) => client.clientConfiguration),
		);
		assert.deepEqual(
			replayed.summarizerClient.clientConfiguration,
			original.summarizerClient.clientConfiguration,
		);
	});

	it("creates the workload generator after testStart", async () => {
		let started = false;
		options.emitter.on("testStart", () => {
			started = true;
		});
		const model = createModel();
		const generatorFactory = model.generatorFactory;
		model.generatorFactory = () => {
			assert(started);
			return generatorFactory();
		};
		await runTestForSeed(model, options, 0);
	});

	it("records stable UUID client names and configurations in both seed modes", async () => {
		options.numberOfClients = 27;
		options.clientJoinOptions = { maxNumberOfClients: 28, clientAddProbability: 1 };
		for (const forceGlobalSeed of [false, true]) {
			for (const numOpsBeforeAttach of [0, 1]) {
				if (forceGlobalSeed) {
					options.forceGlobalSeed = true;
				} else {
					delete options.forceGlobalSeed;
				}
				options.detachedStartOptions = { numOpsBeforeAttach, rehydrateDisabled: true };
				const model = mixinAttach(mixinNewClient(createModel(), options), options);
				const original = await runTestForSeed(model, options, 0, saveInfo);
				const operations = readOperations();
				await runTestForSeed(model, options, 0, saveInfo);
				assert.deepEqual(readOperations(), operations);
				const replayed = await runTestForSeed(
					model,
					options,
					999,
					undefined,
					asyncGeneratorFromArray(operations),
				);
				const describeClients = (state: State): [string, Configuration | undefined][] =>
					state.clients.map((client) => [client.channel.id, client.clientConfiguration]);
				assert.equal(original.clients.length, 28);
				assert.equal(original.clients[26].channel.id.length, 36);
				assert.deepEqual(describeClients(replayed), describeClients(original));
			}
		}
	});

	it("records configuration before a factory fails during initialization", async () => {
		const model = createModel();
		assert(model.clientConfiguration !== undefined);
		model.clientConfiguration.factory = () => {
			throw new Error("Configured factory failed.");
		};
		await assert.rejects(
			runTestForSeed(model, options, 0, saveInfo),
			/Configured factory failed/,
		);
		const operations = readOperations();
		assert.equal(operations.length, 1);
		assert.equal(operations[0].type, "initialize");
		await assert.rejects(
			replayTest(model, 0, asyncGeneratorFromArray(operations), undefined, options),
			/Configured factory failed/,
		);
	});

	it("records attachment clients and preserves the detached client's configuration on rehydration", async () => {
		options.detachedStartOptions = {
			numOpsBeforeAttach: 1,
			attachingBeforeRehydrateDisable: true,
		};
		const created: Client<SharedNothingFactory>[] = [];
		const generated: string[] = [];
		options.emitter.on("clientCreate", (client) => created.push(client));
		const base = createModel();
		assert(base.clientConfiguration !== undefined);
		const configuration = base.clientConfiguration;
		const model = mixinAttach(
			{
				...base,
				clientConfiguration: {
					...configuration,
					generate: (random, context) => {
						generated.push(context.clientId);
						return configuration.generate(random, context);
					},
				},
			},
			options,
		);
		await runTestForSeed(model, options, 0, saveInfo);
		assert.deepEqual(generated, ["A", "summarizer", "B", "C"]);
		assert.deepEqual(
			created.map((client) => client.channel.id),
			["A", "A", "summarizer", "B", "C"],
		);
		assert.deepEqual(created[0].clientConfiguration, created[1].clientConfiguration);
		for (const client of created) {
			assertConfigurationApplied(client);
		}
		const operations = readOperations();
		const attach = operations.find((operation) => operation.type === "attach");
		assert(attach?.clients !== undefined);
		assert.deepEqual(
			attach.clients.map((client) => client.clientConfiguration),
			created.slice(2).map((client) => client.clientConfiguration),
		);
		generated.length = 0;
		created.length = 0;
		await replayTest(model, 123, asyncGeneratorFromArray(operations), undefined, options);
		assert.deepEqual(generated, []);
		for (const client of created) {
			assertConfigurationApplied(client);
		}
	});

	it("preserves configuration when restoring a stashed client under a new name", async () => {
		options.numberOfClients = 1;
		options.clientJoinOptions = {
			maxNumberOfClients: 1,
			clientAddProbability: 0,
			stashableClientProbability: 1,
		};
		const created: Client<SharedNothingFactory>[] = [];
		options.emitter.on("clientCreate", (client) => created.push(client));
		const model = mixinStashedClient(
			{
				...createModel(),
				generatorFactory: () =>
					asyncGeneratorFromArray<TestOperation, State>([
						{ type: "noop" },
						{ type: "stashClient", existingClientId: "A", newClientId: "A_1" },
					]),
			},
			options,
		);
		const state = await runTestForSeed(model, options, 0, saveInfo);
		assert.equal(state.clients[0].channel.id, "A_1");
		assert.equal(created.length, 3);
		assert.deepEqual(created[1].clientConfiguration, created[2].clientConfiguration);
		assertConfigurationApplied(state.clients[0]);
		await replayTest(
			model,
			123,
			asyncGeneratorFromArray(readOperations()),
			undefined,
			options,
		);
		assert.deepEqual(created[4].clientConfiguration, created[5].clientConfiguration);
	});

	it("retains initialization and required client choices during minimization", async () => {
		options.clientJoinOptions = { maxNumberOfClients: 4, clientAddProbability: 1 };
		const model = mixinNewClient(
			{
				...createModel(),
				reducer: (state: State) => {
					if (state.clients.some((client) => client.channel.id === "D")) {
						throw new Error("Failure requiring configured client D.");
					}
				},
			},
			options,
		);
		await assert.rejects(runTestForSeed(model, options, 0, saveInfo), /configured client D/);
		const operations = readOperations();
		const originalOperations = structuredClone(operations);
		const minimizer = new FuzzTestMinimizer(
			undefined,
			operations,
			saveInfo,
			async (generator) => replayTest(model, 0, generator, undefined, options),
			0,
		);
		const minimized = await minimizer.minimize();
		assert.equal(minimized[0].type, "initialize");
		assert(minimized.some((operation) => operation.type === "addClient"));
		assert.deepEqual(minimized, originalOperations);
	});

	it("rejects replay without the required initialization", async () => {
		await assert.rejects(
			replayTest(
				createModel(),
				0,
				asyncGeneratorFromArray([{ type: "noop" }]),
				undefined,
				options,
			),
			/Configured tests must start with initialize/,
		);
		await assert.rejects(
			replayTest(createModel(), 0, asyncGeneratorFromArray([]), undefined, options),
			/Configured tests must start with initialize/,
		);
	});

	it("rejects missing configuration instead of generating a replacement", async () => {
		options.clientJoinOptions = { maxNumberOfClients: 4, clientAddProbability: 1 };
		const model = mixinNewClient(createModel(), options);
		await runTestForSeed(model, options, 0, saveInfo);
		const operations = readOperations();
		const add = operations.find((operation) => operation.type === "addClient");
		assert(add !== undefined);
		delete add.clientConfiguration;
		await assert.rejects(
			replayTest(model, 0, asyncGeneratorFromArray(operations), undefined, options),
			/Missing recorded clientConfiguration/,
		);
	});

	it("rejects attachment without recorded client configurations", async () => {
		options.detachedStartOptions = { numOpsBeforeAttach: 1, rehydrateDisabled: true };
		const model = mixinAttach(createModel(), options);
		await runTestForSeed(model, options, 0, saveInfo);
		const operations = readOperations();
		const attach = operations.find((operation) => operation.type === "attach");
		assert(attach !== undefined);
		delete attach.clients;
		await assert.rejects(
			replayTest(model, 0, asyncGeneratorFromArray(operations), undefined, options),
			/Recorded client initializations must match/,
		);
	});

	it("rejects configuration that changes when serialized", async () => {
		const model = createModel();
		assert(model.clientConfiguration !== undefined);
		model.clientConfiguration.generate = () => ({
			version: "current",
			options: { enabled: true },
			invalid: Number.NaN,
		});
		await assert.rejects(
			runTestForSeed(model, options, 0),
			/clientConfiguration must round-trip through JSON/,
		);
	});

	const configurations: JsonSerializable<unknown>[] = [
		// JSON null is a supported configuration, unlike undefined.
		// eslint-disable-next-line unicorn/no-null
		null,
		false,
		0,
		"previous",
		["previous", 1],
		{ type: "__fluid_handle__", url: "/configuration-not-a-handle" },
	];
	for (const clientConfiguration of configurations) {
		it(`preserves consumer-owned JSON: ${JSON.stringify(clientConfiguration)}`, async () => {
			options.detachedStartOptions = { numOpsBeforeAttach: 1, rehydrateDisabled: true };
			options.clientJoinOptions = { maxNumberOfClients: 4, clientAddProbability: 1 };
			type JsonConfiguration = JsonSerializable<unknown>;
			type JsonOperation = Operation | HarnessOperation<JsonConfiguration>;
			const base: DDSFuzzModel<
				SharedNothingFactory,
				JsonOperation,
				DDSFuzzTestState<SharedNothingFactory, JsonConfiguration>
			> = {
				...baseModel,
				minimizationTransforms: [],
				clientConfiguration: {
					generate: () => clientConfiguration,
					factory: (recorded) => {
						assert.deepEqual(recorded, clientConfiguration);
						return baseModel.factory;
					},
				},
				reducer: () => {},
				generatorFactory: () => takeAsync(3, baseModel.generatorFactory()),
			};
			const model = mixinAttach(mixinNewClient(base, options), options);
			const state = await runTestForSeed(model, options, 0, saveInfo);
			assert.equal(state.clients.length, 4);
			for (const client of [state.summarizerClient, ...state.clients]) {
				assert.deepEqual(client.clientConfiguration, clientConfiguration);
			}
			const operations = JSON.parse(readFileSync(operationsFile, "utf8")) as JsonOperation[];
			await replayTest(model, 0, asyncGeneratorFromArray(operations), undefined, options);
		});
	}

	it("leaves unconfigured clients and operation logs unchanged", async () => {
		const model = {
			...baseModel,
			generatorFactory: () => takeAsync(1, baseModel.generatorFactory()),
		};
		const state = await runTestForSeed(model, options, 0, saveInfo);
		for (const client of [state.summarizerClient, ...state.clients]) {
			assert(!("clientConfiguration" in client));
		}
		const operations = readOperations();
		assert.deepEqual(operations, [{ type: "noop", seed: 1325690281034360 }]);
		await replayTest(
			model,
			0,
			asyncGeneratorFromArray(operations.filter((operation) => operation.type === "noop")),
			undefined,
			options,
		);
	});
});
