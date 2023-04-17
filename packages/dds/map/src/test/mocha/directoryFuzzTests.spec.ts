/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as dirPath from "path";
import { mkdirSync } from "fs";
import { strict as assert } from "assert";
import {
	AsyncGenerator,
	AsyncReducer,
	BaseFuzzTestState,
	createFuzzDescribe,
	createWeightedAsyncGenerator,
	interleaveAsync,
	makeRandom,
	performFuzzActionsAsync,
	SaveInfo,
	takeAsync,
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

interface LoadNewClient {
	type: "loadNewClient";
}

interface Synchronize {
	type: "synchronize";
}

type KeyOperation = SetKey | DeleteKey | ClearKeys;

type SubDirectoryOperation = CreateSubDirectory | DeleteSubDirectory;

type ClientOperation = KeyOperation | SubDirectoryOperation;

type Operation = ClientOperation | Synchronize | LoadNewClient;

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
): AsyncGenerator<Operation, FuzzTestState> {
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

	async function createSubDirectory(state: ClientOpState): Promise<CreateSubDirectory> {
		const { random, sharedDirectory } = state;
		return {
			type: "createSubDirectory",
			directoryId: sharedDirectory.id,
			name: random.pick(options.subDirectoryNamePool),
			path: pickAbsolutePathForCreateDirectoryOp(state),
		};
	}

	async function deleteSubDirectory(state: ClientOpState): Promise<DeleteSubDirectory> {
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

	async function setKey(state: ClientOpState): Promise<SetKey> {
		const { random, sharedDirectory } = state;
		return {
			type: "set",
			key: random.pick(options.keyNamePool),
			path: pickAbsolutePathForKeyOps(state, false),
			value: random.string(random.integer(0, 4)),
			directoryId: sharedDirectory.id,
		};
	}

	async function clearKeys(state: ClientOpState): Promise<ClearKeys> {
		return {
			type: "clear",
			path: pickAbsolutePathForKeyOps(state, true),
			directoryId: state.sharedDirectory.id,
		};
	}

	async function deleteKey(state: ClientOpState): Promise<DeleteKey> {
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

	async function loadNewClient(): Promise<LoadNewClient> {
		return {
			type: "loadNewClient",
		};
	}

	const clientBaseOperationGenerator = createWeightedAsyncGenerator<Operation, ClientOpState>([
		[createSubDirectory, 2],
		[
			deleteSubDirectory,
			1,
			(state: ClientOpState): boolean => state.sharedDirectory.countSubDirectory() > 0,
		],
		[setKey, 5],
		[deleteKey, 2, (state: ClientOpState): boolean => state.sharedDirectory.size > 0],
		[clearKeys, 1, (state: ClientOpState): boolean => state.sharedDirectory.size > 0],
		[loadNewClient, 1],
	]);

	const clientOperationGenerator = async (state: FuzzTestState) =>
		clientBaseOperationGenerator({
			...state,
			sharedDirectory: state.random.pick(state.clients).sharedDirectory,
		});

	return interleaveAsync(
		clientOperationGenerator,
		async () => ({ type: "synchronize" }),
		options.validateInterval,
	);
}

interface LoggingInfo {
	// Clients to print
	clientIds: string[];
	// Set this to true in case you want to debug and print client states and ops.
	printConsoleLogs?: boolean;
}

function logCurrentState(clients: Client[], loggingInfo: LoggingInfo): void {
	for (const id of loggingInfo.clientIds) {
		const { sharedDirectory } = clients.find((s) => s.sharedDirectory.id === id) ?? {};
		if (sharedDirectory !== undefined) {
			console.log(`Client ${id}:`);
			console.log(
				JSON.stringify(sharedDirectory.getAttachSummary(true).summary, undefined, 4),
			);
			console.log("\n");
		}
	}
}

async function runSharedDirectoryFuzz(
	generator: AsyncGenerator<Operation, FuzzTestState>,
	initialState: FuzzTestState,
	summarizerClient: Client,
	saveInfo?: SaveInfo,
	loggingInfo?: LoggingInfo,
): Promise<void> {
	// Small wrapper to avoid having to return the same state repeatedly; all operations in this suite mutate.
	// Also a reasonable point to inject logging of incremental state.
	const statefully =
		<T>(
			statefulReducer: (state: FuzzTestState, operation: T) => Promise<void>,
		): AsyncReducer<T, FuzzTestState> =>
		async (state, operation) => {
			if (loggingInfo !== undefined) {
				if (loggingInfo.printConsoleLogs) {
					logCurrentState(state.clients, loggingInfo);
					console.log("-".repeat(20));
					console.log("Next operation:", JSON.stringify(operation, undefined, 4));
				}
			}
			await statefulReducer(state, operation);
			return state;
		};

	await performFuzzActionsAsync(
		generator,
		{
			createSubDirectory: statefully(async ({ clients }, { directoryId, path, name }) => {
				const { sharedDirectory } =
					clients.find((c) => c.sharedDirectory.id === directoryId) ?? {};
				assert(sharedDirectory);
				const dir = sharedDirectory.getWorkingDirectory(path);
				assert(dir);
				dir.createSubDirectory(name);
			}),
			deleteSubDirectory: statefully(async ({ clients }, { directoryId, path, name }) => {
				const { sharedDirectory } =
					clients.find((c) => c.sharedDirectory.id === directoryId) ?? {};
				assert(sharedDirectory);
				const dir = sharedDirectory.getWorkingDirectory(path);
				assert(dir);
				dir.deleteSubDirectory(name);
			}),
			set: statefully(async ({ clients }, { directoryId, path, key, value }) => {
				const { sharedDirectory } =
					clients.find((c) => c.sharedDirectory.id === directoryId) ?? {};
				assert(sharedDirectory);
				const dir = sharedDirectory.getWorkingDirectory(path);
				assert(dir);
				dir.set(key, value);
			}),
			clear: statefully(async ({ clients }, { directoryId, path }) => {
				const { sharedDirectory } =
					clients.find((c) => c.sharedDirectory.id === directoryId) ?? {};
				assert(sharedDirectory);
				const dir = sharedDirectory.getWorkingDirectory(path);
				assert(dir);
				dir.clear();
			}),
			delete: statefully(async ({ clients }, { directoryId, path, key }) => {
				const { sharedDirectory } =
					clients.find((c) => c.sharedDirectory.id === directoryId) ?? {};
				assert(sharedDirectory);
				const dir = sharedDirectory.getWorkingDirectory(path);
				assert(dir);
				dir.delete(key);
			}),
			synchronize: statefully(async ({ containerRuntimeFactory, clients }) => {
				// Summarizer client will also process messages as part of this.
				containerRuntimeFactory.processAllMessages();
				try {
					assertEventuallyConsistentDirectoryState(clients);
				} catch (error) {
					if (loggingInfo !== undefined) {
						logCurrentState(clients, loggingInfo);
					}
					throw error;
				}
			}),
			loadNewClient: statefully(async ({ containerRuntimeFactory, clients }) => {
				const summaryAtMinSeq = summarizerClient.sharedDirectory.getAttachSummary();
				const dataStoreRuntime = new MockFluidDataStoreRuntime();
				const sharedDirectory = new SharedDirectory(
					String.fromCharCode(clients.length + 1 + 65),
					dataStoreRuntime,
					DirectoryFactory.Attributes,
				);
				const containerRuntime = containerRuntimeFactory.createContainerRuntime(
					dataStoreRuntime,
					{ minimumSequenceNumber: containerRuntimeFactory.sequenceNumber },
				);
				const services: IChannelServices = {
					deltaConnection: containerRuntime.createDeltaConnection(),
					objectStorage: MockStorage.createFromSummary(summaryAtMinSeq.summary),
				};

				await sharedDirectory.load(services);
				sharedDirectory.connect(services);
				const newClient: Client = {
					sharedDirectory,
					containerRuntime,
				};
				clients.push(newClient);
				loggingInfo?.clientIds.push(sharedDirectory.id);
			}),
		},
		initialState,
		saveInfo,
	);
}

const describeFuzz = createFuzzDescribe({ defaultTestCount: 10 });

describeFuzz("SharedDirectory fuzz testing", ({ testCount }) => {
	const directory = dirPath.join(__dirname, "../../../src/test/mocha/results");
	function getPath(seed: number): string {
		return dirPath.join(directory, `${seed}.json`);
	}

	before(() => {
		mkdirSync(directory, { recursive: true });
	});

	function runTests(
		seed: number,
		generator: AsyncGenerator<Operation, FuzzTestState>,
		loggingInfo?: LoggingInfo,
	): void {
		it(`with default config, seed ${seed}`, async () => {
			// 1 client will act as summarizer and it will just process ops and not submit any op.
			const numClients = 4;

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

			// Remove the summarizer client so that it does not get chosen to submit ops.
			const summarizerClient = clients.pop();
			assert(
				summarizerClient !== undefined && clients.length === numClients - 1,
				"summarizer client should be defined",
			);
			const clientIds: string[] = [];
			for (const c of clients) {
				clientIds.push(c.sharedDirectory.id);
			}

			const initialState: FuzzTestState = {
				clients,
				containerRuntimeFactory,
				random: makeRandom(seed),
			};

			await runSharedDirectoryFuzz(
				generator,
				initialState,
				summarizerClient,
				{ saveOnFailure: true, filepath: getPath(seed) },
				loggingInfo ?? { clientIds, printConsoleLogs: false },
			);
		});
	}

	for (let i = 0; i < testCount; i++) {
		const generator = takeAsync(200, makeOperationGenerator({ validateInterval: 10 }));
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
		assertEventualConsistencyCore(
			first.getWorkingDirectory("/"),
			second.getWorkingDirectory("/"),
		);
	}
}

function assertEventualConsistencyCore(
	first: IDirectory | undefined,
	second: IDirectory | undefined,
) {
	assert(first !== undefined, "first root dir should be present");
	assert(second !== undefined, "second root dir should be present");

	// Check number of keys.
	assert.strictEqual(
		first.size,
		second.size,
		`Number of keys not same: Number of keys ` +
			`in first at path ${first.absolutePath}: ${first.size} and in second at path ${second.absolutePath}: ${second.size}`,
	);

	// Check key/value pairs in both directories.
	for (const key of first.keys()) {
		assert.strictEqual(
			first.get(key),
			second.get(key),
			`Key not found or value not matching ` +
				`key: ${key}, value in dir first at path ${first.absolutePath}: ${first.get(
					key,
				)} and in second at path ${second.absolutePath}: ${second.get(key)}`,
		);
	}

	// Check for number of subdirectores with both directories.
	assert(first.countSubDirectory !== undefined && second.countSubDirectory !== undefined);
	assert.strictEqual(
		first.countSubDirectory(),
		second.countSubDirectory(),
		`Number of subDirectories not same: Number of subdirectory in ` +
			`first at path ${first.absolutePath}: ${first.countSubDirectory()} and in second` +
			`at path ${second.absolutePath}: ${second.countSubDirectory()}`,
	);

	// Check for consistency of subdirectores with both directories.
	for (const [name, subDirectory1] of first.subdirectories()) {
		const subDirectory2 = second.getSubDirectory(name);
		assert(
			subDirectory2 !== undefined,
			`SubDirectory with name ${name} not present in second directory`,
		);
		assertEventualConsistencyCore(subDirectory1, subDirectory2);
	}
}
