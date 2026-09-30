/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { takeAsync } from "@fluid-private/stochastic-test-utils";

import {
	defaultDDSFuzzSuiteOptions,
	mixinAttach,
	mixinClientSelection,
	mixinNewClient,
	mixinReconnect,
	mixinStashedClient,
	mixinSynchronization,
	runTestForSeed,
	type DDSFuzzHarnessEvents,
	type DDSFuzzModel,
	type DDSFuzzSuiteOptions,
	type DDSFuzzTestState,
	type HarnessOperation,
} from "../ddsFuzzHarness.js";

import { SharedNothingFactory } from "./sharedNothing.js";

interface State extends DDSFuzzTestState<SharedNothingFactory> {
	startValue?: number;
}

interface Sample {
	type: "noop";
	value: number;
	startValue?: number;
}

interface Scenario {
	name: string;
	detached: number;
	count: number;
	stash: number;
	rehydrate?: boolean;
	hashes: [string, string];
}

// SHA-256 of seed 42's workload operation streams before the shared bootstrap change
// (ad548d1bfa6). Each pair is per-operation seeding followed by global seeding.
const scenarios: Scenario[] = [
	{
		name: "attached",
		detached: 0,
		count: 3,
		stash: 0,
		hashes: [
			"697ae998b672b6d0e288fd14e761df7f67493e14bf8ce4fb64563cf83360081f",
			"a70b48ea5104c3a1bef9c25b55bf519fb724d63de420d0ebdafa90bc29938d7f",
		],
	},
	{
		name: "detached",
		detached: 3,
		count: 3,
		stash: 0,
		hashes: [
			"93ebdcf1864c6e9eab079dd20d313e8f75e3974092f1452f7e11495718542c79",
			"2a93c36bcb78653c214eeee1397b62cc27a4a5e24a54957a5fdd667cc1a41257",
		],
	},
	{
		name: "rehydrate",
		detached: 3,
		count: 3,
		stash: 0,
		rehydrate: true,
		hashes: [
			"98fbb69643e8dc336ab9788e27480056c07801000e8e67c0351c0215669a3b37",
			"4dcfc52f00f8099f6d386263dbc26d77c4618f48225b70c40589c9b75788bcc9",
		],
	},
	{
		name: "attached stashing",
		detached: 0,
		count: 3,
		stash: 0.5,
		hashes: [
			"26854e190e2437c087c446d1b5037a31d7c1e56ba91cc8bb46f8ca3af25f1c89",
			"2b81d6a371c04d3cdd56087b89630d3535993de67078baaff4814b6222f89a79",
		],
	},
	{
		name: "detached stashing",
		detached: 3,
		count: 3,
		stash: 0.5,
		hashes: [
			"0b858ada103ba5e9af0a3089a9c0f081ffdd07b45ba8ab0764b06681c3ee3eed",
			"db4bf0a15d3eb906c3a4718a8558d55c366d8ed9f4f85fa9063eb5d4ee1e50f1",
		],
	},
	{
		name: "attached UUIDs",
		detached: 0,
		count: 28,
		stash: 0.5,
		hashes: [
			"be839a8c69eaa8c3901f01c545dc7da4562dfc92abe136f5101efba7ddf7c98d",
			"c05b5370c561470bdf12addf31ee13542531cd58eb7ac754ffae9fdac40a7360",
		],
	},
	{
		name: "detached UUIDs",
		detached: 3,
		count: 28,
		stash: 0.5,
		hashes: [
			"6c4d9cbfb8833e2d682a56f9e4128b4276ee2b1887eeb9f487ccf9250ffb797b",
			"768a8ca9fce49a1b79a9b63200df14baca729dfc068a91f4ef4aba00b77ba5df",
		],
	},
];

describe("DDS fuzz workload seed compatibility", () => {
	let directory: string;
	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), "dds-seed-compatibility-"));
	});
	afterEach(() => {
		rmSync(directory, { recursive: true });
	});

	for (const scenario of scenarios) {
		for (const forceGlobalSeed of [false, true]) {
			for (const configured of [false, true]) {
				it(`${scenario.name}, global ${forceGlobalSeed}, configured ${configured}`, async () => {
					const options: DDSFuzzSuiteOptions = {
						...defaultDDSFuzzSuiteOptions,
						emitter: new TypedEventEmitter<DDSFuzzHarnessEvents>(),
						numberOfClients: scenario.count,
						detachedStartOptions: {
							numOpsBeforeAttach: scenario.detached,
							...(scenario.rehydrate
								? { attachingBeforeRehydrateDisable: true }
								: { rehydrateDisabled: true }),
						},
						clientJoinOptions: {
							maxNumberOfClients: scenario.count + 2,
							clientAddProbability: 0.1,
							stashableClientProbability: scenario.stash,
						},
						reconnectProbability: 0.1,
						rebaseProbability: 0,
						validationStrategy: { type: "fixedInterval", interval: 5 },
						...(forceGlobalSeed ? { forceGlobalSeed: true } : {}),
					};
					options.emitter.on("testStart", (state: State) => {
						state.startValue = state.random.integer(0, 1000);
					});
					const factory = new SharedNothingFactory();
					const base: DDSFuzzModel<SharedNothingFactory, Sample, State> = {
						workloadName: "seed compatibility",
						factory: configured
							? { generateClientConfiguration: () => ({}), getFactory: () => factory }
							: factory,
						minimizationTransforms: [],
						generatorFactory: () =>
							takeAsync(40, async (state) => ({
								type: "noop",
								value: state.random.integer(0, 10000),
								startValue:
									state.startValue ?? assert.fail("Expected testStart initialization."),
							})),
						reducer: (state) => {
							state.client.channel.noop();
						},
						validateConsistency: () => {},
					};
					const model = mixinAttach(
						mixinSynchronization(
							mixinNewClient(
								mixinStashedClient(
									mixinClientSelection(mixinReconnect(base, options), options),
									options,
								),
								options,
							),
							options,
						),
						options,
					);
					const path = join(directory, "operations.json");
					await runTestForSeed(model, options, 42, {
						saveOnFailure: false,
						saveOnSuccess: { path },
						saveFluidOps: false,
					});
					const operations = JSON.parse(readFileSync(path, "utf8")) as (
						| Sample
						| HarnessOperation
					)[];
					const workload = operations
						.filter((operation) => operation.type !== "initialize")
						.map((operation) => {
							if (operation.type === "attach") {
								const { clients: _, ...original } = operation;
								return original;
							}
							if (operation.type === "addClient") {
								const { clientConfiguration: _, ...original } = operation;
								return original;
							}
							return operation;
						});
					const hash = createHash("sha256").update(JSON.stringify(workload)).digest("hex");
					assert.equal(hash, scenario.hashes[forceGlobalSeed ? 1 : 0]);
				});
			}
		}
	}
});
