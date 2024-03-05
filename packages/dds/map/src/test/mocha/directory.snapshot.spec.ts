/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import path from "node:path";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { convertSummaryTreeToITree } from "@fluidframework/runtime-utils";
import { createSnapshotSuite } from "@fluid-private/test-dds-utils";
import { DirectoryFactory, SharedDirectory } from "../../index.js";
import { assertEquivalentDirectories } from "./directoryEquivalenceUtils.js";
import { _dirname } from "./dirname.cjs";

function serialize(directory: SharedDirectory): string {
	const summaryTree = directory.getAttachSummary().summary;
	const snapshotTree = convertSummaryTreeToITree(summaryTree);
	return JSON.stringify(snapshotTree, undefined, 1);
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

interface TestScenario {
	only?: boolean;
	skip?: boolean;
	name: string;
	runScenario: () => unknown;
	/**
	 * Whether running the scenario produces a snapshot which matches the saved one.
	 * This is used to test back-compat of snapshots, i.e. ensuring current code can load older documents.
	 * @remarks - It may be valuable to confirm clients can collaborate on such documents
	 * after loading them.
	 */
	writeCompatible?: boolean;
}

function generateTestScenarios(): TestScenario[] {
	const runtimeFactory = new MockContainerRuntimeFactory();
	const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: "A" });
	runtimeFactory.createContainerRuntime(dataStoreRuntime);
	const factory = SharedDirectory.getFactory();

	/**
	 * @remarks - This test suite isn't set up to be easily augmented when map's document format changes.
	 * `writeCompatible` may want to be changed to enable storing all snapshots over time for a given scenario.
	 * See e.g. SharedString tests.
	 */
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
		{
			name: "old-format-directory",
			runScenario: (): SharedDirectory => {
				const testDirectory = new SharedDirectory(
					"A",
					dataStoreRuntime,
					factory.attributes,
				);
				const dir1 = testDirectory.createSubDirectory("a");
				const dir2 = testDirectory.createSubDirectory("b");
				dir1.set("key3", "value3");
				dir1.set("key4", "value2");
				dir2.set("key5", "value3");
				testDirectory.set("key1", "value1");
				testDirectory.set("key2", "value2");
				return testDirectory;
			},
			writeCompatible: false,
		},
		// Add more test scenarios as needed
	];

	return testScenarios;
}

describe("SharedDirectory Snapshot Tests", () => {
	// Set up the directory path for reading/writing snapshots and generate tests
	assert(_dirname.match(/(dist|lib)[/\\]test[/\\]mocha$/));
	const testScenarios = generateTestScenarios();
	const { takeSnapshot, readSnapshot } = createSnapshotSuite(
		path.resolve(_dirname, `../../../src/test/mocha/snapshots/`),
	);

	for (const {
		name,
		runScenario,
		only = false,
		skip = false,
		writeCompatible = true,
	} of testScenarios) {
		const itFn = only ? it.only : skip ? it.skip : it;
		itFn(name, async () => {
			const testDirectory = runScenario() as SharedDirectory;
			const snapshotData = writeCompatible
				? takeSnapshot(serialize(testDirectory))
				: readSnapshot();
			const secondDirectory = await loadSharedDirectory("B", snapshotData);
			assertEquivalentDirectories(testDirectory, secondDirectory);
		});
	}
});
