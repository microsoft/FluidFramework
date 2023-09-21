/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as dirPath from "path";
import { strict as assert } from "assert";
import {
	AsyncGenerator,
	AsyncReducer,
	combineReducersAsync,
	createWeightedAsyncGenerator,
	takeAsync,
} from "@fluid-internal/stochastic-test-utils";
import {
	Client,
	createDDSFuzzSuite,
	DDSFuzzModel,
	DDSFuzzTestState,
} from "@fluid-internal/test-dds-utils";
import { FlushMode } from "@fluidframework/runtime-definitions";
import { DirectoryFactory } from "../../directory";
import { IDirectory } from "../../interfaces";
import { assertEquivalentDirectories } from "./directoryEquivalenceUtils";

type FuzzTestState = DDSFuzzTestState<DirectoryFactory>;

interface SetKey {
	type: "set";
	path: string;
	key: string;
	value: string;
}

interface ClearKeys {
	type: "clear";
	path: string;
}

interface DeleteKey {
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

type KeyOperation = SetKey | DeleteKey | ClearKeys;

type SubDirectoryOperation = CreateSubDirectory | DeleteSubDirectory;

type Operation = KeyOperation | SubDirectoryOperation;

interface OperationGenerationConfig {
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

const defaultOptions: Required<OperationGenerationConfig> = {
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

function makeOperationGenerator(
	optionsParam?: OperationGenerationConfig,
): AsyncGenerator<Operation, FuzzTestState> {
	const options = { ...defaultOptions, ...(optionsParam ?? {}) };

	// All subsequent helper functions are generators; note that they don't actually apply any operations.
	function pickAbsolutePathForCreateDirectoryOp(state: FuzzTestState): string {
		const { random, channel } = state;
		let dir: IDirectory = channel;
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
			if (subDir !== undefined) {
				dir = subDir;
			} else {
				break;
			}
		}
		return dir.absolutePath;
	}

	function pickAbsolutePathForDeleteDirectoryOp(state: FuzzTestState): string {
		const { random, channel } = state;
		let parentDir: IDirectory = channel;
		const subDirectories: IDirectory[] = [];
		for (const [_, b] of channel.subdirectories()) {
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
			if (subDir !== undefined) {
				parentDir = dirToDelete;
				dirToDelete = subDir;
			} else {
				break;
			}
		}
		return parentDir.absolutePath;
	}

	function pickAbsolutePathForKeyOps(state: FuzzTestState, shouldHaveKey: boolean): string {
		const { random, channel } = state;
		let parentDir: IDirectory = channel;
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

	async function createSubDirectory(state: FuzzTestState): Promise<CreateSubDirectory> {
		return {
			type: "createSubDirectory",
			name: state.random.pick(options.subDirectoryNamePool),
			path: pickAbsolutePathForCreateDirectoryOp(state),
		};
	}

	async function deleteSubDirectory(state: FuzzTestState): Promise<DeleteSubDirectory> {
		const { random, channel } = state;
		const path = pickAbsolutePathForDeleteDirectoryOp(state);
		const parentDir = channel.getWorkingDirectory(path);
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

	async function setKey(state: FuzzTestState): Promise<SetKey> {
		const { random } = state;
		return {
			type: "set",
			key: random.pick(options.keyNamePool),
			path: pickAbsolutePathForKeyOps(state, false),
			value: random.string(random.integer(0, 4)),
		};
	}

	async function clearKeys(state: FuzzTestState): Promise<ClearKeys> {
		return {
			type: "clear",
			path: pickAbsolutePathForKeyOps(state, true),
		};
	}

	async function deleteKey(state: FuzzTestState): Promise<DeleteKey> {
		const { random, channel } = state;
		const path = pickAbsolutePathForKeyOps(state, true);
		const dir = channel.getWorkingDirectory(path);
		assert(dir, "dir should exist");
		return {
			type: "delete",
			key: random.pick([...dir.keys()]),
			path,
		};
	}

	return createWeightedAsyncGenerator<Operation, FuzzTestState>([
		[createSubDirectory, options.createSubDirWeight],
		[
			deleteSubDirectory,
			options.deleteSubDirWeight,
			(state: FuzzTestState): boolean => (state.channel.countSubDirectory?.() ?? 0) > 0,
		],
		[setKey, options.setKeyWeight],
		[
			deleteKey,
			options.deleteKeyWeight,
			(state: FuzzTestState): boolean => state.channel.size > 0,
		],
		[
			clearKeys,
			options.clearKeysWeight,
			(state: FuzzTestState): boolean => state.channel.size > 0,
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

function makeReducer(loggingInfo?: LoggingInfo): AsyncReducer<Operation, FuzzTestState> {
	const withLogging =
		<T>(baseReducer: AsyncReducer<T, FuzzTestState>): AsyncReducer<T, FuzzTestState> =>
		async (state, operation) => {
			if (loggingInfo !== undefined) {
				if (loggingInfo.printConsoleLogs) {
					logCurrentState(state.clients, loggingInfo);
					console.log("-".repeat(20));
					console.log("Next operation:", JSON.stringify(operation, undefined, 4));
				}
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

	const reducer: AsyncReducer<Operation, FuzzTestState> = combineReducersAsync({
		createSubDirectory: async ({ channel }, { path, name }) => {
			const dir = channel.getWorkingDirectory(path);
			assert(dir);
			dir.createSubDirectory(name);
		},
		deleteSubDirectory: async ({ channel }, { path, name }) => {
			const dir = channel.getWorkingDirectory(path);
			assert(dir);
			dir.deleteSubDirectory(name);
		},
		set: async ({ channel }, { path, key, value }) => {
			const dir = channel.getWorkingDirectory(path);
			assert(dir);
			dir.set(key, value);
		},
		clear: async ({ channel }, { path }) => {
			const dir = channel.getWorkingDirectory(path);
			assert(dir);
			dir.clear();
		},
		delete: async ({ channel }, { path, key }) => {
			const dir = channel.getWorkingDirectory(path);
			assert(dir);
			dir.delete(key);
		},
	});

	return withLogging(reducer);
}

describe("SharedDirectory fuzz Create/Delete concentrated", () => {
	const options: OperationGenerationConfig = {
		setKeyWeight: 0,
		clearKeysWeight: 0,
		deleteKeyWeight: 0,
		createSubDirWeight: 2,
		deleteSubDirWeight: 2,
		maxSubDirectoryChild: 2,
		subDirectoryNamePool: ["dir1", "dir2"],
		validateInterval: defaultOptions.validateInterval,
	};
	const model: DDSFuzzModel<DirectoryFactory, Operation> = {
		workloadName: "default directory 1",
		generatorFactory: () => takeAsync(100, makeOperationGenerator(options)),
		reducer: makeReducer({ clientIds: ["A", "B", "C"], printConsoleLogs: false }),
		validateConsistency: assertEquivalentDirectories,
		factory: new DirectoryFactory(),
	};

	createDDSFuzzSuite(model, {
		validationStrategy: { type: "fixedInterval", interval: defaultOptions.validateInterval },
		reconnectProbability: 0.15,
		numberOfClients: 3,
		clientJoinOptions: {
			maxNumberOfClients: 3,
			clientAddProbability: 0.08,
		},
		defaultTestCount: 25,
		// Uncomment this line to replay a specific seed from its failure file:
		// replay: 21,
		saveFailures: { directory: dirPath.join(__dirname, "../../../src/test/mocha/results/1") },
	});

	createDDSFuzzSuite(
		{ ...model, workloadName: "default directory 1 with rebasing" },
		{
			validationStrategy: {
				type: "fixedInterval",
				interval: defaultOptions.validateInterval,
			},
			rebaseProbability: 0.15,
			containerRuntimeOptions: {
				flushMode: FlushMode.TurnBased,
				enableGroupedBatching: true,
			},
			numberOfClients: 3,
			clientJoinOptions: {
				maxNumberOfClients: 3,
				clientAddProbability: 0.08,
			},
			defaultTestCount: 25,
			// Uncomment this line to replay a specific seed from its failure file:
			// replay: 21,
			saveFailures: {
				directory: dirPath.join(__dirname, "../../../src/test/mocha/results/1"),
			},
		},
	);
});

describe("SharedDirectory fuzz", () => {
	const model: DDSFuzzModel<DirectoryFactory, Operation> = {
		workloadName: "default directory 2",
		generatorFactory: () => takeAsync(100, makeOperationGenerator()),
		reducer: makeReducer({ clientIds: ["A", "B", "C"], printConsoleLogs: false }),
		validateConsistency: assertEquivalentDirectories,
		factory: new DirectoryFactory(),
	};

	createDDSFuzzSuite(model, {
		validationStrategy: { type: "fixedInterval", interval: defaultOptions.validateInterval },
		reconnectProbability: 0.15,
		numberOfClients: 3,
		clientJoinOptions: {
			// Note: if tests are slow, we may want to tune this down. This mimics behavior before this suite
			// was refactored to use the DDS fuzz harness.
			maxNumberOfClients: Number.MAX_SAFE_INTEGER,
			clientAddProbability: 0.08,
		},
		defaultTestCount: 25,
		// Uncomment this line to replay a specific seed from its failure file:
		// replay: 0,
		saveFailures: { directory: dirPath.join(__dirname, "../../../src/test/mocha/results/2") },
	});

	createDDSFuzzSuite(
		{ ...model, workloadName: "default directory 2 with rebasing" },
		{
			validationStrategy: {
				type: "fixedInterval",
				interval: defaultOptions.validateInterval,
			},
			rebaseProbability: 0.15,
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
			},
			defaultTestCount: 25,
			// Uncomment this line to replay a specific seed from its failure file:
			// replay: 0,
			saveFailures: {
				directory: dirPath.join(__dirname, "../../../src/test/mocha/results/2"),
			},
		},
	);
});
