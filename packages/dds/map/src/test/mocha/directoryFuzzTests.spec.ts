/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as dirPath from "path";
import { mkdirSync } from "fs";
import { strict as assert } from "assert";
import {
	BaseFuzzTestState,
	createFuzzDescribe,
	createWeightedGenerator,
	Generator,
	interleave,
	makeRandom,
	performFuzzActions,
	Reducer,
	SaveInfo,
	take,
} from "@fluid-internal/stochastic-test-utils";
import {
	MockContainerRuntimeFactoryForReconnection,
	MockContainerRuntimeForReconnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { IChannelServices } from "@fluidframework/datastore-definitions";
import { DirectoryFactory, SharedDirectory } from "../../directory";
import { IDirectory } from "../../interfaces";

interface Client {
	sharedDirectory: SharedDirectory;
	containerRuntime: MockContainerRuntimeForReconnection;
}

interface FuzzTestState extends BaseFuzzTestState {
	containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
	clients: Client[];
}

interface ClientSpec {
	directoryId: string;
}

interface SetKey extends ClientSpec {
	type: "set";
	path: string;
	key: string;
	value: string;
}

interface ClearKeys extends ClientSpec {
	type: "clear";
	path: string;
}

interface DeleteKey extends ClientSpec {
	type: "delete";
	path: string;
	key: string;
}

interface CreateSubDirectory extends ClientSpec {
	type: "createSubDirectory";
	path: string;
	name: string;
}

interface DeleteSubDirectory extends ClientSpec {
	type: "deleteSubDirectory";
	path: string;
	name: string;
}

interface Synchronize {
	type: "synchronize";
}

type KeyOperation = SetKey | DeleteKey | ClearKeys;

type SubDirectoryOperation = CreateSubDirectory | DeleteSubDirectory;

type ClientOperation = KeyOperation | SubDirectoryOperation;

type Operation = ClientOperation | Synchronize;

interface OperationGenerationConfig {
	validateInterval: number;
	maxSubDirectoryChild?: number;
	subDirectoryNamePool?: string[];
	keyNamePool?: string[];
}

const defaultOptions: Required<OperationGenerationConfig> = {
	validateInterval: 10,
	maxSubDirectoryChild: 3,
	subDirectoryNamePool: ["dir1", "dir2", "dir3"],
	keyNamePool: ["prop1", "prop2", "prop3"],
};

function makeOperationGenerator(
	optionsParam?: OperationGenerationConfig,
): Generator<Operation, FuzzTestState> {
	const options = { ...defaultOptions, ...(optionsParam ?? {}) };
	type ClientOpState = FuzzTestState & { sharedDirectory: SharedDirectory };

	// All subsequent helper functions are generators; note that they don't actually apply any operations.
	function pickAbsolutePathForCreateDirectoryOp(state: ClientOpState): string {
		const { random, sharedDirectory } = state;
		let dir: IDirectory = sharedDirectory;
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

	function pickAbsolutePathForDeleteDirectoryOp(state: ClientOpState): string {
		const { random, sharedDirectory } = state;
		let parentDir: IDirectory = sharedDirectory;
		const subDirectories: IDirectory[] = [];
		for (const [_, b] of sharedDirectory.subdirectories()) {
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

	function pickAbsolutePathForKeyOps(state: ClientOpState, shouldHaveKey: boolean): string {
		const { random, sharedDirectory } = state;
		let parentDir: IDirectory = sharedDirectory;
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

	function createSubDirectory(state: ClientOpState): CreateSubDirectory {
		const { random, sharedDirectory } = state;
		return {
			type: "createSubDirectory",
			directoryId: sharedDirectory.id,
			name: random.pick(options.subDirectoryNamePool),
			path: pickAbsolutePathForCreateDirectoryOp(state),
		};
	}

	function deleteSubDirectory(state: ClientOpState): DeleteSubDirectory {
		const { random, sharedDirectory } = state;
		const path = pickAbsolutePathForDeleteDirectoryOp(state);
		const parentDir = sharedDirectory.getWorkingDirectory(path);
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
			directoryId: sharedDirectory.id,
			name: random.pick<string>(subDirName),
			path,
		};
	}

	function setKey(state: ClientOpState): SetKey {
		const { random, sharedDirectory } = state;
		return {
			type: "set",
			key: random.pick(options.keyNamePool),
			path: pickAbsolutePathForKeyOps(state, false),
			value: random.string(random.integer(0, 4)),
			directoryId: sharedDirectory.id,
		};
	}

	function clearKeys(state: ClientOpState): ClearKeys {
		return {
			type: "clear",
			path: pickAbsolutePathForKeyOps(state, true),
			directoryId: state.sharedDirectory.id,
		};
	}

	function deleteKey(state: ClientOpState): DeleteKey {
		const { random, sharedDirectory } = state;
		const path = pickAbsolutePathForKeyOps(state, true);
		const dir = sharedDirectory.getWorkingDirectory(path);
		assert(dir, "dir should exist");
		return {
			type: "delete",
			key: random.pick([...dir.keys()]),
			path,
			directoryId: sharedDirectory.id,
		};
	}

	const clientBaseOperationGenerator = createWeightedGenerator<Operation, ClientOpState>([
		[createSubDirectory, 2],
		[
			deleteSubDirectory,
			1,
			(state: ClientOpState): boolean => state.sharedDirectory.countSubDirectory() > 0,
		],
		[setKey, 5],
		[deleteKey, 2, (state: ClientOpState): boolean => state.sharedDirectory.size > 0],
		[clearKeys, 1, (state: ClientOpState): boolean => state.sharedDirectory.size > 0],
	]);

	const clientOperationGenerator = (state: FuzzTestState) =>
		clientBaseOperationGenerator({
			...state,
			sharedDirectory: state.random.pick(state.clients).sharedDirectory,
		});

	return interleave(
		clientOperationGenerator,
		() => ({ type: "synchronize" }),
		options.validateInterval,
	);
}

interface LoggingInfo {
	// Clients to print
	clientIds: string[];
}

function logCurrentState(state: FuzzTestState, loggingInfo: LoggingInfo): void {
	for (const id of loggingInfo.clientIds) {
		const { sharedDirectory } = state.clients.find((s) => s.sharedDirectory.id === id) ?? {};
		if (sharedDirectory !== undefined) {
			console.log(`Client ${id}:`);
			console.log(JSON.stringify(sharedDirectory.getAttachSummary(true), undefined, 4));
			console.log("\n");
		}
	}
}

function runSharedDirectoryFuzz(
	generator: Generator<Operation, FuzzTestState>,
	initialState: FuzzTestState,
	saveInfo?: SaveInfo,
	loggingInfo?: LoggingInfo,
): void {
	// Small wrapper to avoid having to return the same state repeatedly; all operations in this suite mutate.
	// Also a reasonable point to inject logging of incremental state.
	const statefully =
		<T>(
			statefulReducer: (state: FuzzTestState, operation: T) => void,
		): Reducer<T, FuzzTestState> =>
		(state, operation) => {
			if (loggingInfo !== undefined) {
				logCurrentState(state, loggingInfo);
				console.log("-".repeat(20));
				console.log("Next operation:", JSON.stringify(operation, undefined, 4));
			}
			statefulReducer(state, operation);
			return state;
		};

	performFuzzActions(
		generator,
		{
			createSubDirectory: statefully(({ clients }, { directoryId, path, name }) => {
				const { sharedDirectory } =
					clients.find((c) => c.sharedDirectory.id === directoryId) ?? {};
				assert(sharedDirectory);
				const dir = sharedDirectory.getWorkingDirectory(path);
				assert(dir);
				dir.createSubDirectory(name);
			}),
			deleteSubDirectory: statefully(({ clients }, { directoryId, path, name }) => {
				const { sharedDirectory } =
					clients.find((c) => c.sharedDirectory.id === directoryId) ?? {};
				assert(sharedDirectory);
				const dir = sharedDirectory.getWorkingDirectory(path);
				assert(dir);
				dir.deleteSubDirectory(name);
			}),
			set: statefully(({ clients }, { directoryId, path, key, value }) => {
				const { sharedDirectory } =
					clients.find((c) => c.sharedDirectory.id === directoryId) ?? {};
				assert(sharedDirectory);
				const dir = sharedDirectory.getWorkingDirectory(path);
				assert(dir);
				dir.set(key, value);
			}),
			clear: statefully(({ clients }, { directoryId, path }) => {
				const { sharedDirectory } =
					clients.find((c) => c.sharedDirectory.id === directoryId) ?? {};
				assert(sharedDirectory);
				const dir = sharedDirectory.getWorkingDirectory(path);
				assert(dir);
				dir.clear();
			}),
			delete: statefully(({ clients }, { directoryId, path, key }) => {
				const { sharedDirectory } =
					clients.find((c) => c.sharedDirectory.id === directoryId) ?? {};
				assert(sharedDirectory);
				const dir = sharedDirectory.getWorkingDirectory(path);
				assert(dir);
				dir.delete(key);
			}),
			synchronize: statefully(({ containerRuntimeFactory, clients }) => {
				containerRuntimeFactory.processAllMessages();
				assertEventuallyConsistentDirectoryState(clients);
			}),
		},
		initialState,
		saveInfo,
	);
}

const directory = dirPath.join(__dirname, "./results");

function getPath(seed: number): string {
	return dirPath.join(directory, `${seed}.json`);
}

const describeFuzz = createFuzzDescribe({ defaultTestCount: 10 });

describeFuzz.skip("SharedDirectory fuzz testing", ({ testCount }) => {
	before(() => {
		mkdirSync(directory, { recursive: true });
	});

	function runTests(
		seed: number,
		generator: Generator<Operation, FuzzTestState>,
		loggingInfo?: LoggingInfo,
	): void {
		it(`with default config, seed ${seed}`, async () => {
			const numClients = 3;

			const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
			const clients = Array.from({ length: numClients }, (_, index) => {
				const dataStoreRuntime = new MockFluidDataStoreRuntime();
				const sharedDirectory = new SharedDirectory(
					String.fromCharCode(index + 65),
					dataStoreRuntime,
					DirectoryFactory.Attributes,
				);
				const containerRuntime =
					containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
				const services: IChannelServices = {
					deltaConnection: containerRuntime.createDeltaConnection(),
					objectStorage: new MockStorage(),
				};

				sharedDirectory.initializeLocal();
				sharedDirectory.connect(services);
				return { containerRuntime, sharedDirectory };
			});

			const initialState: FuzzTestState = {
				clients,
				containerRuntimeFactory,
				random: makeRandom(seed),
			};

			runSharedDirectoryFuzz(
				generator,
				initialState,
				{ saveOnFailure: true, filepath: getPath(seed) },
				loggingInfo,
			);
		});
	}

	for (let i = 0; i < testCount; i++) {
		const generator = take(100, makeOperationGenerator({ validateInterval: 10 }));
		runTests(i, generator);
	}
});

/**
 * Validates that all shared directories in the provided array are consistent in the underlying keys/values
 * and sub directories recursively.
 * */
function assertEventuallyConsistentDirectoryState(clients: Client[]): void {
	const connectedClients = clients.filter((client) => client.containerRuntime.connected);
	if (connectedClients.length < 2) {
		// No two strings are expected to be consistent.
		return;
	}
	const first = connectedClients[0].sharedDirectory;
	for (const { sharedDirectory: second } of connectedClients.slice(1)) {
		assertEventualConsistencyCore(first, second);
	}
}

function assertEventualConsistencyCore(first: SharedDirectory, second: SharedDirectory) {
	// Check number of keys.
	assert.strictEqual(
		first.size,
		second.size,
		`Number of keys not same: Number of keys in ` +
			`${first.id}: ${first.size} and in ${second.id}: ${second.size}`,
	);

	// Check key/value pairs in both directories.
	for (const key of first.keys()) {
		assert.strictEqual(
			first.get(key),
			second.get(key),
			`Key not found or value not matching ` +
				`key: ${key}, value in dir ${first.id}: ${first.get(key)} and in ${
					second.id
				}: ${second.get(key)}`,
		);
	}

	// Check for number of subdirectores with both directories.
	assert.strictEqual(
		first.countSubDirectory(),
		second.countSubDirectory(),
		`Number of subDirectories not same: Number of subdirectory in ` +
			`${first.id}: ${first.countSubDirectory()} and in ${
				second.id
			}: ${second.countSubDirectory()}`,
	);

	// Check for consistency of subdirectores with both directories.
	for (const [name, subDirectory1] of first.subdirectories()) {
		const subDirectory2 = second.getSubDirectory(name);
		assert(
			subDirectory2 !== undefined,
			`SubDirectory with name ${name} not present in second directory`,
		);
		assertEventualConsistencyCore(
			subDirectory1 as SharedDirectory,
			subDirectory2 as SharedDirectory,
		);
	}
}
