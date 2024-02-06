/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { convertSummaryTreeToITree } from "@fluidframework/runtime-utils";
import { DirectoryFactory, IDirectory, SharedDirectory } from "../..";

interface TestScenario {
	only?: boolean;
	skip?: boolean;
	name: string;
	runScenario: () => SharedDirectory;
}

function serialize(directory: SharedDirectory): string {
	const summaryTree = directory.getAttachSummary().summary;
	const snapshotTree = convertSummaryTreeToITree(summaryTree);
	return JSON.stringify(snapshotTree, undefined, 1);
}

function assertEquivalentDirectories(first: IDirectory, second: IDirectory): void {
	assertEventualConsistencyCore(first.getWorkingDirectory("/"), second.getWorkingDirectory("/"));
}

function assertEventualConsistencyCore(
	first: IDirectory | undefined,
	second: IDirectory | undefined,
): void {
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

	// Check for consistency of subdirectories ordering of both directories
	const firstSubdirNames = [...first.subdirectories()].map(([dirName, _]) => dirName);
	const secondSubdirNames = [...second.subdirectories()].map(([dirName, _]) => dirName);
	assert.deepStrictEqual(firstSubdirNames, secondSubdirNames);
}

function takeSnapshot(directory: SharedDirectory, fileName: string): string {
	const data = serialize(directory);
	if (!existsSync(fileName)) {
		writeFileSync(fileName, data);
	}
	const pastData = readFileSync(fileName, "utf8");
	assert.equal(data, pastData, `snapshots are different on test "${fileName}"`);
	return data;
}

async function loadSharedDirectory(
	id: string,
	serializedSnapshot: string,
): Promise<SharedDirectory> {
	const containerRuntimeFactory = new MockContainerRuntimeFactory();
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		objectStorage: new MockStorage(JSON.parse(serializedSnapshot)),
	};
	const sharedDirectory = new SharedDirectory(id, dataStoreRuntime, DirectoryFactory.Attributes);
	await sharedDirectory.load(services);
	return sharedDirectory;
}

function generateTestScenarios(): TestScenario[] {
	const runtimeFactory = new MockContainerRuntimeFactory();
	const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: "A" });
	runtimeFactory.createContainerRuntime(dataStoreRuntime);
	const factory = SharedDirectory.getFactory();

	const testScenarios: TestScenario[] = [
		{
			name: "random-create-delete",
			runScenario: (): SharedDirectory => {
				const testDirectory = new SharedDirectory(
					"A",
					dataStoreRuntime,
					factory.attributes,
				);
				const dir1 = testDirectory.createSubDirectory("a");
				const dir2 = testDirectory.createSubDirectory("b");
				dir1.set("key1", "value1");
				dir1.set("key2", "value2");
				dir2.set("key3", "value3");
				testDirectory.set("key4", "value4");
				testDirectory.set("key5", "value5");
				dir2.createSubDirectory("b-a");
				return testDirectory;
			},
		},
		{
			name: "long-property-value",
			runScenario: (): SharedDirectory => {
				const testDirectory = new SharedDirectory(
					"A",
					dataStoreRuntime,
					factory.attributes,
				);
				// 40K word
				let longWord = "0123456789";
				for (let i = 0; i < 12; i++) {
					longWord = longWord + longWord;
				}
				const logWord2 = `${longWord}_2`;

				testDirectory.set("first", "second");
				testDirectory.set("long1", longWord);
				const nestedDirectory = testDirectory.createSubDirectory("nested");
				nestedDirectory.set("deepKey1", "deepValue1");
				nestedDirectory.set("long2", logWord2);
				return testDirectory;
			},
		},
		// Add more test scenarios as needed
	];

	return testScenarios;
}

function runTestScenarios(testScenarios: TestScenario[]): void {
	for (const { name, runScenario, only = false, skip = false } of testScenarios) {
		const itFn = only ? it.only : skip ? it.skip : it;
		itFn(name, async () => {
			const testDirectory = runScenario();
			const snapshotData = takeSnapshot(testDirectory, `./snapshots/${name}.json`);
			const secondDirectory = await loadSharedDirectory("B", snapshotData);
			assertEquivalentDirectories(testDirectory, secondDirectory);
		});
	}
}

describe("SharedDirectory Snapshot Tests", () => {
	const testScenarios = generateTestScenarios();
	runTestScenarios(testScenarios);
});
