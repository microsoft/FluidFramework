/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type AsyncGenerator,
	type AsyncReducer,
	type Generator,
	combineReducers,
	combineReducersAsync,
	createWeightedAsyncGenerator,
	createWeightedGenerator,
	takeAsync,
} from "@fluid-private/stochastic-test-utils";
import type { Client, DDSFuzzModel, DDSFuzzTestState } from "@fluid-private/test-dds-utils";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { isObject } from "@fluidframework/core-utils/internal";
import type { Serializable } from "@fluidframework/datastore-definitions/internal";
import { isFluidHandle, toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";

import {
	DirectoryFactory,
	type IDirectory,
	type ISharedMap,
	MapFactory,
} from "../../index.js";

import { assertEquivalentDirectories } from "./directoryEquivalenceUtils.js";

/**
 * Represents a map clear operation.
 */
interface MapClear {
	type: "clear";
}

/**
 * Represents a map set key operation.
 */
interface MapSetKey {
	type: "setKey";
	key: string;
	value: Serializable<unknown>;
}

/**
 * Represents a map delete key operation.
 */
interface MapDeleteKey {
	type: "deleteKey";
	key: string;
}

type MapOperation = MapSetKey | MapDeleteKey | MapClear;

// This type gets used a lot as the state object of the suite; shorthand it here.
type MapState = DDSFuzzTestState<MapFactory>;

async function assertMapsAreEquivalent(a: ISharedMap, b: ISharedMap): Promise<void> {
	assert.equal(a.size, b.size, `${a.id} and ${b.id} have different number of keys.`);
	for (const key of a.keys()) {
		const aVal: unknown = a.get(key);
		const bVal: unknown = b.get(key);
		if (isObject(aVal) === true) {
			assert(
				isObject(bVal),
				`${a.id} and ${b.id} differ at ${key}: a is an object, b is not}`,
			);
			const aHandle = isFluidHandle(aVal) ? toFluidHandleInternal(aVal).absolutePath : aVal;
			const bHandle = isFluidHandle(bVal) ? toFluidHandleInternal(bVal).absolutePath : bVal;
			assert.equal(
				aHandle,
				bHandle,
				`${a.id} and ${b.id} differ at ${key}: ${JSON.stringify(aHandle)} vs ${JSON.stringify(
					bHandle,
				)}`,
			);
		} else {
			assert.equal(aVal, bVal, `${a.id} and ${b.id} differ at ${key}: ${aVal} vs ${bVal}`);
		}
	}
}

const mapReducer = combineReducers<MapOperation, MapState>({
	clear: ({ client }) => client.channel.clear(),
	setKey: ({ client }, { key, value }) => {
		client.channel.set(key, value);
	},
	deleteKey: ({ client }, { key }) => {
		client.channel.delete(key);
	},
});

/**
 * Represents the options for the map generator.
 */
interface MapGeneratorOptions {
	setWeight: number;
	deleteWeight: number;
	clearWeight: number;
	keyPoolSize: number;
}

const mapDefaultOptions: MapGeneratorOptions = {
	setWeight: 20,
	deleteWeight: 20,
	clearWeight: 1,
	keyPoolSize: 20,
};

function mapMakeGenerator(
	optionsParam?: Partial<MapGeneratorOptions>,
): AsyncGenerator<MapOperation, MapState> {
	const { setWeight, deleteWeight, clearWeight, keyPoolSize } = {
		...mapDefaultOptions,
		...optionsParam,
	};
	// Use numbers as the key names.
	const keyNames = Array.from({ length: keyPoolSize }, (_, i) => `${i}`);

	const setKey: Generator<MapSetKey, MapState> = ({ random }) => ({
		type: "setKey",
		key: random.pick(keyNames),
		value: random.pick([
			(): number => random.integer(1, 50),
			(): string => random.string(random.integer(3, 7)),
			(): IFluidHandle => random.handle(),
		])(),
	});
	const deleteKey: Generator<MapDeleteKey, MapState> = ({ random }) => ({
		type: "deleteKey",
		key: random.pick(keyNames),
	});

	const syncGenerator = createWeightedGenerator<MapOperation, MapState>([
		[setKey, setWeight],
		[deleteKey, deleteWeight],
		[{ type: "clear" }, clearWeight],
	]);

	return async (state) => syncGenerator(state);
}

/**
 * the maps fuzz model
 */
export const baseMapModel: DDSFuzzModel<MapFactory, MapOperation> = {
	workloadName: "default",
	factory: new MapFactory(),
	generatorFactory: () => takeAsync(100, mapMakeGenerator()),
	reducer: async (state, operation) => mapReducer(state, operation),
	validateConsistency: async (a, b) => assertMapsAreEquivalent(a.channel, b.channel),
};

type DirFuzzTestState = DDSFuzzTestState<DirectoryFactory>;

/**
 * Represents a directory set key operation.
 */
export interface DirSetKey {
	type: "set";
	path: string;
	key: string;
	value: Serializable<unknown>;
}

/**
 * Represents a directory clear keys operation.
 */
export interface DirClearKeys {
	type: "clear";
	path: string;
}

/**
 * Represents a directory delete key operation.
 */
export interface DirDeleteKey {
	type: "delete";
	path: string;
	key: string;
}

/**
 * Represents a create subdirectory operation.
 */
export interface CreateSubDirectory {
	type: "createSubDirectory";
	path: string;
	name: string;
}

/**
 * Represents a delete subdirectory operation.
 */
export interface DeleteSubDirectory {
	type: "deleteSubDirectory";
	path: string;
	name: string;
}

/**
 * Represents a directory key operation.
 */
export type DirKeyOperation = DirSetKey | DirDeleteKey | DirClearKeys;

/**
 * Represents a subdirectory operation.
 */
export type SubDirectoryOperation = CreateSubDirectory | DeleteSubDirectory;

/**
 * Represents a directory operation.
 */
export type DirOperation = DirKeyOperation | SubDirectoryOperation;

/**
 * Represents the configuration for directory operation generation.
 */
export interface DirOperationGenerationConfig {
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

/**
 * The default options for the directory fuzz model
 */
export const dirDefaultOptions: Required<DirOperationGenerationConfig> = {
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

/**
 * Picks an absolute path for key operations.
 * @param state - The current state of the directory fuzz test.
 * @param shouldHaveKey - Whether the directory should have a key.
 * @returns The absolute path.
 */
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

/**
 * Creates a directory operation generator.
 * @param optionsParam - The configuration options for the generator.
 * @returns An asynchronous generator for directory operations.
 */
export function makeDirOperationGenerator(
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
			(state: DirFuzzTestState): boolean =>
				(state.client.channel.countSubDirectory?.() ?? 0) > 0,
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

/**
 * Represents logging information.
 */
interface LoggingInfo {
	// Clients to print
	clientIds: string[];
	// Set this to true in case you want to debug and print client states and ops.
	printConsoleLogs?: boolean;
}

function logCurrentState(clients: Client<DirectoryFactory>[], loggingInfo: LoggingInfo): void {
	if (loggingInfo.printConsoleLogs === true) {
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
}

/**
 * Creates a directory reducer with optional logging.
 * @param loggingInfo - The logging information.
 * @returns An asynchronous reducer for directory operations.
 */
export function makeDirReducer(
	loggingInfo?: LoggingInfo,
): AsyncReducer<DirOperation, DirFuzzTestState> {
	const withLogging =
		<T>(baseReducer: AsyncReducer<T, DirFuzzTestState>): AsyncReducer<T, DirFuzzTestState> =>
		async (state, operation) => {
			if (loggingInfo?.printConsoleLogs === true) {
				logCurrentState(state.clients, loggingInfo);
				console.log("-".repeat(20));
				console.log("Next operation:", JSON.stringify(operation, undefined, 4));
			}
			try {
				await baseReducer(state, operation);
			} catch (error) {
				if (loggingInfo?.printConsoleLogs === true) {
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

/**
 * The base fuzz model for directory.
 */
export const baseDirModel: DDSFuzzModel<DirectoryFactory, DirOperation> = {
	workloadName: "default directory 1",
	generatorFactory: () => takeAsync(100, makeDirOperationGenerator(dirDefaultOptions)),
	reducer: makeDirReducer({ clientIds: ["A", "B", "C"], printConsoleLogs: false }),
	validateConsistency: async (a, b) => assertEquivalentDirectories(a.channel, b.channel),
	factory: new DirectoryFactory(),
};
