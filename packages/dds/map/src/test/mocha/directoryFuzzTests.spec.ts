/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import * as dirPath from "node:path";

import {
	type AsyncGenerator,
	type AsyncReducer,
	combineReducersAsync,
	createWeightedAsyncGenerator,
	takeAsync,
} from "@fluid-private/stochastic-test-utils";
import {
	type Client,
	type DDSFuzzModel,
	type DDSFuzzTestState,
	createDDSFuzzSuite,
} from "@fluid-private/test-dds-utils";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { Serializable } from "@fluidframework/datastore-definitions/internal";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";

import { DirectoryFactory, type IDirectory } from "../../index.js";

import { assertEquivalentDirectories } from "./directoryEquivalenceUtils.js";
import { _dirname } from "./dirname.cjs";

type DirFuzzTestState = DDSFuzzTestState<DirectoryFactory>;

interface DirSetKey {
	type: "set";
	path: string;
	key: string;
	value: Serializable<unknown>;
}

interface DirClearKeys {
	type: "clear";
	path: string;
}

interface DirDeleteKey {
	type: "delete";
	path: string;
	key: string;
}

interface CreateSubDirectory {
	type: "createSubDirectory";
	path: string;
	name: string;
}

interface DeleteSubDirectory {
	type: "deleteSubDirectory";
	path: string;
	name: string;
}

type DirKeyOperation = DirSetKey | DirDeleteKey | DirClearKeys;

type SubDirectoryOperation = CreateSubDirectory | DeleteSubDirectory;

type DirOperation = DirKeyOperation | SubDirectoryOperation;

interface DirOperationGenerationConfig {
	validateInterval: number;
	maxSubDirectoryChild?: number;
	subDirectoryNamePool?: string[];
	keyNamePool?: string[];
	setKeyWeight?: number;
	deleteKeyWeight?: number;
	clearKeysWeight?: number;
	createSubDirWeight?: number;
	deleteSubDirWeight?: number;
}

const dirDefaultOptions: Required<DirOperationGenerationConfig> = {
	validateInterval: 10,
	maxSubDirectoryChild: 3,
	subDirectoryNamePool: ["dir1", "dir2", "dir3"],
	keyNamePool: ["prop1", "prop2", "prop3"],
	setKeyWeight: 5,
	deleteKeyWeight: 2,
	clearKeysWeight: 1,
	createSubDirWeight: 2,
	deleteSubDirWeight: 1,
};

function pickAbsolutePathForKeyOps(state: DirFuzzTestState, shouldHaveKey: boolean): string {
	const { random, client } = state;
	let parentDir: IDirectory = client.channel;
	for (;;) {
		assert(parentDir !== undefined, "Directory should be defined");
		const subDirs: IDirectory[] = [];
		for (const [_, b] of parentDir.subdirectories()) {
			subDirs.push(b);
		}
		const subDir = random.pick<IDirectory | undefined>([undefined, ...subDirs]);
		if (subDir !== undefined && (!shouldHaveKey || subDir.size > 0)) {
			parentDir = subDir;
		} else {
			break;
		}
	}
	return parentDir.absolutePath;
}

function makeDirOperationGenerator(
	optionsParam?: DirOperationGenerationConfig,
): AsyncGenerator<DirOperation, DirFuzzTestState> {
	const options = { ...dirDefaultOptions, ...optionsParam };

	// All subsequent helper functions are generators; note that they don't actually apply any operations.
	function pickAbsolutePathForCreateDirectoryOp(state: DirFuzzTestState): string {
		const { random, client } = state;
		let dir: IDirectory = client.channel;
		for (;;) {
			assert(dir !== undefined, "Directory should be defined");
			const subDirectories: IDirectory[] = [];
			for (const [_, b] of dir.subdirectories()) {
				subDirectories.push(b);
			}
			// If this dir already has max number of child, then choose one and continue.
			if (
				dir.countSubDirectory !== undefined &&
				dir.countSubDirectory() === options.maxSubDirectoryChild
			) {
				dir = random.pick<IDirectory>(subDirectories);
				continue;
			}
			const subDir = random.pick<IDirectory | undefined>([undefined, ...subDirectories]);
			if (subDir === undefined) {
				break;
			} else {
				dir = subDir;
			}
		}
		return dir.absolutePath;
	}

	function pickAbsolutePathForDeleteDirectoryOp(state: DirFuzzTestState): string {
		const { random, client } = state;
		let parentDir: IDirectory = client.channel;
		const subDirectories: IDirectory[] = [];
		for (const [_, b] of client.channel.subdirectories()) {
			subDirectories.push(b);
		}
		let dirToDelete = random.pick<IDirectory>(subDirectories);
		for (;;) {
			assert(dirToDelete !== undefined, "Directory should be defined");
			const subDirs: IDirectory[] = [];
			for (const [_, b] of dirToDelete.subdirectories()) {
				subDirs.push(b);
			}
			const subDir = random.pick<IDirectory | undefined>([undefined, ...subDirs]);
			if (subDir === undefined) {
				break;
			} else {
				parentDir = dirToDelete;
				dirToDelete = subDir;
			}
		}
		return parentDir.absolutePath;
	}

	async function createSubDirectory(state: DirFuzzTestState): Promise<CreateSubDirectory> {
		return {
			type: "createSubDirectory",
			name: state.random.pick(options.subDirectoryNamePool),
			path: pickAbsolutePathForCreateDirectoryOp(state),
		};
	}

	async function deleteSubDirectory(state: DirFuzzTestState): Promise<DeleteSubDirectory> {
		const { random, client } = state;
		const path = pickAbsolutePathForDeleteDirectoryOp(state);
		const parentDir = client.channel.getWorkingDirectory(path);
		assert(parentDir !== undefined, "parent dir should be defined");
		assert(
			parentDir.countSubDirectory && parentDir.countSubDirectory() > 0,
			"Atleast 1 subdir should be there",
		);
		const subDirName: string[] = [];
		for (const [a, _] of parentDir.subdirectories()) {
			subDirName.push(a);
		}
		return {
			type: "deleteSubDirectory",
			name: random.pick<string>(subDirName),
			path,
		};
	}

	async function setKey(state: DirFuzzTestState): Promise<DirSetKey> {
		const { random } = state;
		return {
			type: "set",
			key: random.pick(options.keyNamePool),
			path: pickAbsolutePathForKeyOps(state, false),
			value: random.pick([
				(): string => random.string(random.integer(0, 4)),
				(): IFluidHandle => random.handle(),
			])(),
		};
	}

	async function clearKeys(state: DirFuzzTestState): Promise<DirClearKeys> {
		return {
			type: "clear",
			path: pickAbsolutePathForKeyOps(state, true),
		};
	}

	async function deleteKey(state: DirFuzzTestState): Promise<DirDeleteKey> {
		const { random, client } = state;
		const path = pickAbsolutePathForKeyOps(state, true);
		const dir = client.channel.getWorkingDirectory(path);
		assert(dir, "dir should exist");
		return {
			type: "delete",
			key: random.pick([...dir.keys()]),
			path,
		};
	}

	return createWeightedAsyncGenerator<DirOperation, DirFuzzTestState>([
		[createSubDirectory, options.createSubDirWeight],
		[
			deleteSubDirectory,
			options.deleteSubDirWeight,
			(state: DirFuzzTestState): boolean => (state.client.channel.countSubDirectory?.() ?? 0) > 0,
		],
		[setKey, options.setKeyWeight],
		[
			deleteKey,
			options.deleteKeyWeight,
			(state: DirFuzzTestState): boolean => state.client.channel.size > 0,
		],
		[
			clearKeys,
			options.clearKeysWeight,
			(state: DirFuzzTestState): boolean => state.client.channel.size > 0,
		],
	]);
}

interface LoggingInfo {
	// Clients to print
	clientIds: string[];
	// Set this to true in case you want to debug and print client states and ops.
	printConsoleLogs?: boolean;
}

function logCurrentState(clients: Client<DirectoryFactory>[], loggingInfo: LoggingInfo): void {
	for (const id of loggingInfo.clientIds) {
		const { channel: sharedDirectory } =
			clients.find((s) => s.containerRuntime.clientId === id) ?? {};
		if (sharedDirectory !== undefined) {
			console.log(`Client ${id}:`);
			console.log(
				JSON.stringify(sharedDirectory.getAttachSummary(true).summary, undefined, 4),
			);
			console.log("\n");
		}
	}
}

function makeDirReducer(loggingInfo?: LoggingInfo): AsyncReducer<DirOperation, DirFuzzTestState> {
	const withLogging =
		<T>(baseReducer: AsyncReducer<T, DirFuzzTestState>): AsyncReducer<T, DirFuzzTestState> =>
		async (state, operation) => {
			if (loggingInfo !== undefined && loggingInfo.printConsoleLogs) {
				logCurrentState(state.clients, loggingInfo);
				console.log("-".repeat(20));
				console.log("Next operation:", JSON.stringify(operation, undefined, 4));
			}
			try {
				await baseReducer(state, operation);
			} catch (error) {
				if (loggingInfo !== undefined) {
					logCurrentState(state.clients, loggingInfo);
				}
				throw error;
			}
			return state;
		};

	const reducer: AsyncReducer<DirOperation, DirFuzzTestState> = combineReducersAsync({
		createSubDirectory: async ({ client }, { path, name }) => {
			const dir = client.channel.getWorkingDirectory(path);
			assert(dir);
			dir.createSubDirectory(name);
		},
		deleteSubDirectory: async ({ client }, { path, name }) => {
			const dir = client.channel.getWorkingDirectory(path);
			assert(dir);
			dir.deleteSubDirectory(name);
		},
		set: async ({ client }, { path, key, value }) => {
			const dir = client.channel.getWorkingDirectory(path);
			assert(dir);
			dir.set(key, value);
		},
		clear: async ({ client }, { path }) => {
			const dir = client.channel.getWorkingDirectory(path);
			assert(dir);
			dir.clear();
		},
		delete: async ({ client }, { path, key }) => {
			const dir = client.channel.getWorkingDirectory(path);
			assert(dir);
			dir.delete(key);
		},
	});

	return withLogging(reducer);
}

const dirOptions: DirOperationGenerationConfig = {
	setKeyWeight: 0,
	clearKeysWeight: 0,
	deleteKeyWeight: 0,
	createSubDirWeight: 2,
	deleteSubDirWeight: 2,
	maxSubDirectoryChild: 2,
	subDirectoryNamePool: ["dir1", "dir2"],
	validateInterval: dirDefaultOptions.validateInterval,
};


const baseDirModel: DDSFuzzModel<DirectoryFactory, DirOperation> = {
	workloadName: "default directory 1",
	generatorFactory: () => takeAsync(100, makeDirOperationGenerator(dirOptions)),
	reducer: makeDirReducer({ clientIds: ["A", "B", "C"], printConsoleLogs: false }),
	validateConsistency: async (a, b) => assertEquivalentDirectories(a.channel, b.channel),
	factory: new DirectoryFactory(),
};

describe("SharedDirectory fuzz Create/Delete concentrated", () => {

	createDDSFuzzSuite(baseDirModel, {
		validationStrategy: { type: "fixedInterval", interval: dirDefaultOptions.validateInterval },
		reconnectProbability: 0.15,
		numberOfClients: 3,
		// We prevent handles from being generated on the creation/deletion tests since the set operations are disabled.
		handleGenerationDisabled: true,
		clientJoinOptions: {
			maxNumberOfClients: 3,
			clientAddProbability: 0.08,
			stashableClientProbability: 0.2,
		},
		defaultTestCount: 25,
		// Uncomment this line to replay a specific seed from its failure file:
		// replay: 21,
		saveFailures: { directory: dirPath.join(_dirname, "../../../src/test/mocha/results/1") },
	});

	createDDSFuzzSuite(
		{ ...baseDirModel, workloadName: "default directory 1 with rebasing" },
		{
			validationStrategy: {
				type: "random",
				probability: 0.4,
			},
			rebaseProbability: 0.2,
			reconnectProbability: 0.5,
			// We prevent handles from being generated on the creation/deletion tests since the set operations are disabled.
			handleGenerationDisabled: true,
			containerRuntimeOptions: {
				flushMode: FlushMode.TurnBased,
				enableGroupedBatching: true,
			},
			numberOfClients: 3,
			clientJoinOptions: {
				maxNumberOfClients: 3,
				clientAddProbability: 0.08,
				stashableClientProbability: undefined,
			},
			defaultTestCount: 200,
			// Uncomment this line to replay a specific seed from its failure file:
			// replay: 0,
			saveFailures: {
				directory: dirPath.join(_dirname, "../../../src/test/mocha/results/1"),
			},
		},
	);
});

describe("SharedDirectory fuzz", () => {
	const model: DDSFuzzModel<DirectoryFactory, DirOperation> = {
		workloadName: "default directory 2",
		generatorFactory: () => takeAsync(100, makeDirOperationGenerator()),
		reducer: makeDirReducer({ clientIds: ["A", "B", "C"], printConsoleLogs: false }),
		validateConsistency: async (a, b) => assertEquivalentDirectories(a.channel, b.channel),
		factory: new DirectoryFactory(),
	};

	createDDSFuzzSuite(model, {
		validationStrategy: { type: "fixedInterval", interval: dirDefaultOptions.validateInterval },
		reconnectProbability: 0.15,
		numberOfClients: 3,
		clientJoinOptions: {
			// Note: if tests are slow, we may want to tune this down. This mimics behavior before this suite
			// was refactored to use the DDS fuzz harness.
			maxNumberOfClients: Number.MAX_SAFE_INTEGER,
			clientAddProbability: 0.08,
			stashableClientProbability: 0.2,
		},
		defaultTestCount: 25,
		// Uncomment this line to replay a specific seed from its failure file:
		// replay: 0,
		saveFailures: { directory: dirPath.join(_dirname, "../../../src/test/mocha/results/2") },
	});

	createDDSFuzzSuite(
		{ ...model, workloadName: "default directory 2 with rebasing" },
		{
			validationStrategy: {
				type: "random",
				probability: 0.4,
			},
			rebaseProbability: 0.2,
			reconnectProbability: 0.5,
			containerRuntimeOptions: {
				flushMode: FlushMode.TurnBased,
				enableGroupedBatching: true,
			},
			numberOfClients: 3,
			clientJoinOptions: {
				// Note: if tests are slow, we may want to tune this down. This mimics behavior before this suite
				// was refactored to use the DDS fuzz harness.
				maxNumberOfClients: Number.MAX_SAFE_INTEGER,
				clientAddProbability: 0.08,
				stashableClientProbability: undefined,
			},
			defaultTestCount: 200,
			// Uncomment this line to replay a specific seed from its failure file:
			// replay: 0,
			saveFailures: {
				directory: dirPath.join(_dirname, "../../../src/test/mocha/results/2"),
			},
		},
	);
});
