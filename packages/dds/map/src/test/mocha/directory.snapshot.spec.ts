/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import path from "node:path";

import { createSnapshotSuite } from "@fluid-private/test-dds-utils";
import { convertSummaryTreeToITree } from "@fluidframework/runtime-utils/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { type ISharedDirectory, SharedDirectory } from "../../index.js";

import { assertEquivalentDirectories } from "./directoryEquivalenceUtils.js";
import { _dirname } from "./dirname.cjs";

function serialize(directory: ISharedDirectory): string {
	const summaryTree = directory.getAttachSummary().summary;
	const snapshotTree = convertSummaryTreeToITree(summaryTree);
	return JSON.stringify(snapshotTree, undefined, 1);
}

async function loadSharedDirectory(
	id: string,
	serializedSnapshot: string,
): Promise<ISharedDirectory> {
	const containerRuntimeFactory = new MockContainerRuntimeFactory();
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		objectStorage: new MockStorage(JSON.parse(serializedSnapshot)),
	};

	const factory = SharedDirectory.getFactory();
	const directory = await factory.load(dataStoreRuntime, id, services, factory.attributes);
	return directory;
}

interface TestScenario {
	only?: boolean;
	skip?: boolean;
	name: string;
	runScenario: () => unknown;
	/**
	 * Whether running the scenario produces a snapshot which matches the saved one.
	 * This is used to test back-compat of snapshots, i.e. ensuring current code can load older documents.
	 * @remarks It may be valuable to confirm clients can collaborate on such documents
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
	 * @remarks This test suite isn't set up to be easily augmented when map's document format changes.
	 * `writeCompatible` may want to be changed to enable storing all snapshots over time for a given scenario.
	 * See e.g. SharedString tests.
	 */
	const testScenarios: TestScenario[] = [
		{
			name: "random-create-delete",
			runScenario: (): ISharedDirectory => {
				const testDirectory = factory.create(dataStoreRuntime, "A");
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
			runScenario: (): ISharedDirectory => {
				const testDirectory = factory.create(dataStoreRuntime, "A");
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
			runScenario: (): ISharedDirectory => {
				const testDirectory = factory.create(dataStoreRuntime, "A");
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
	assert(/(dist|lib)[/\\]test[/\\]mocha$/.exec(_dirname));
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
			await assertEquivalentDirectories(testDirectory, secondDirectory);
		});
	}
});

describe("SharedDirectory Snapshot Tests — sort keys", () => {
	function createDetachedDirectory(id: string): SharedDirectory {
		const runtimeFactory = new MockContainerRuntimeFactory();
		const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: id });
		runtimeFactory.createContainerRuntime(dataStoreRuntime);
		const factory = SharedDirectory.getFactory();
		return factory.create(dataStoreRuntime, id) as SharedDirectory;
	}

	interface RawDataObject {
		storage?: Record<string, unknown>;
		subdirectories?: Record<string, RawDataObject>;
		ci?: unknown;
		sortKeys?: Record<string, string>;
		subdirectorySortKeys?: Record<string, string>;
	}

	function stripSortKeys(serializedSnapshot: string): string {
		const snapshotTree = JSON.parse(serializedSnapshot) as {
			entries: { path: string; value: { contents: string; encoding: string } }[];
		};
		for (const entry of snapshotTree.entries) {
			const parsed = JSON.parse(entry.value.contents) as {
				blobs: string[];
				content: RawDataObject;
			};
			const stack: RawDataObject[] = [parsed.content];
			while (stack.length > 0) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const current = stack.pop()!;
				delete current.sortKeys;
				delete current.subdirectorySortKeys;
				if (current.subdirectories) {
					for (const child of Object.values(current.subdirectories)) {
						stack.push(child);
					}
				}
			}
			entry.value.contents = JSON.stringify(parsed);
		}
		return JSON.stringify(snapshotTree);
	}

	it("T58: Snapshot with sort keys reloads with same key iteration order", async () => {
		const original = createDetachedDirectory("T58");
		original.set("a", 1);
		original.set("b", 2);
		original.set("c", 3);
		original.set("d", 4);
		original.set("e", 5);
		original.setSortKey("a", "3");
		original.setSortKey("b", "1");
		original.setSortKey("c", "2");

		const serialized = serialize(original);
		const loaded = await loadSharedDirectory("T58-loaded", serialized);

		assert.deepStrictEqual([...loaded.keysByOrder()], [...original.keysByOrder()]);
		assert.deepStrictEqual(
			[...loaded.keysByOrder()],
			["b", "c", "a", "d", "e"],
			"sort-keyed entries first (lex order), then unkeyed in insertion order",
		);
	});

	it("T59: Old-format snapshot (no sortKeys fields) loads cleanly", async () => {
		const oldFormatContent = {
			blobs: [],
			content: {
				ci: { csn: 0, ccIds: [] },
				storage: {
					a: { type: "Plain", value: 1 },
					b: { type: "Plain", value: 2 },
					c: { type: "Plain", value: 3 },
				},
			},
		};
		const snapshotTree = {
			entries: [
				{
					path: "header",
					mode: "100644",
					type: "Blob",
					value: {
						contents: JSON.stringify(oldFormatContent),
						encoding: "utf8",
					},
				},
			],
		};
		const loaded = await loadSharedDirectory("T59-loaded", JSON.stringify(snapshotTree));

		assert.deepStrictEqual(
			[...loaded.keysByOrder()],
			[...loaded.keys()],
			"fast-path: keysByOrder equals keys() when no sort keys in snapshot",
		);
		assert.deepStrictEqual([...loaded.keysByOrder()], ["a", "b", "c"]);
	});

	it("T60: Snapshot round-trip preserves subdirectory sort keys", async () => {
		const original = createDetachedDirectory("T60");
		original.createSubDirectory("alpha");
		original.createSubDirectory("beta");
		original.createSubDirectory("gamma");
		original.setSubDirectorySortKey("alpha", "3");
		original.setSubDirectorySortKey("beta", "1");
		original.setSubDirectorySortKey("gamma", "2");

		const serialized = serialize(original);
		const loaded = await loadSharedDirectory("T60-loaded", serialized);

		const originalOrder = [...original.subdirectoriesByOrder()].map(([name]) => name);
		const loadedOrder = [...loaded.subdirectoriesByOrder()].map(([name]) => name);
		assert.deepStrictEqual(loadedOrder, originalOrder);
		assert.deepStrictEqual(loadedOrder, ["beta", "gamma", "alpha"]);
	});

	it("T61: Snapshot round-trip preserves nested sort keys", async () => {
		const original = createDetachedDirectory("T61");
		original.set("k1", "v1");
		original.set("k2", "v2");
		original.setSortKey("k1", "B");
		original.setSortKey("k2", "A");

		original.createSubDirectory("child1");
		original.createSubDirectory("child2");
		original.setSubDirectorySortKey("child1", "Z");
		original.setSubDirectorySortKey("child2", "Y");

		const child1 = original.getSubDirectory("child1");
		assert(child1 !== undefined);
		child1.set("nested1", "n1");
		child1.set("nested2", "n2");
		child1.setSortKey("nested1", "9");
		child1.setSortKey("nested2", "1");

		const serialized = serialize(original);
		const loaded = await loadSharedDirectory("T61-loaded", serialized);

		assert.deepStrictEqual([...loaded.keysByOrder()], [...original.keysByOrder()]);
		assert.deepStrictEqual(
			[...loaded.subdirectoriesByOrder()].map(([n]) => n),
			[...original.subdirectoriesByOrder()].map(([n]) => n),
		);
		const loadedChild = loaded.getSubDirectory("child1");
		assert(loadedChild !== undefined);
		assert.deepStrictEqual([...loadedChild.keysByOrder()], [...child1.keysByOrder()]);
		assert.deepStrictEqual([...loadedChild.keysByOrder()], ["nested2", "nested1"]);
	});

	it("T62: Stripped snapshot (forward-compat lossy) loads cleanly", async () => {
		const original = createDetachedDirectory("T62");
		original.set("a", 1);
		original.set("b", 2);
		original.setSortKey("a", "M");
		original.setSortKey("b", "Z");
		original.createSubDirectory("sub");
		original.setSubDirectorySortKey("sub", "X");
		const sub = original.getSubDirectory("sub");
		assert(sub !== undefined);
		sub.set("nested", "v");
		sub.setSortKey("nested", "N");

		const serialized = serialize(original);
		const stripped = stripSortKeys(serialized);
		const loaded = await loadSharedDirectory("T62-loaded", stripped);

		assert.deepStrictEqual(
			[...loaded.keysByOrder()],
			[...loaded.keys()],
			"stripped snapshot falls back to default iteration",
		);
		assert.deepStrictEqual([...loaded.keysByOrder()], ["a", "b"]);
		assert.deepStrictEqual(
			[...loaded.subdirectoriesByOrder()].map(([n]) => n),
			[...loaded.subdirectories()].map(([n]) => n),
		);
		const loadedSub = loaded.getSubDirectory("sub");
		assert(loadedSub !== undefined);
		assert.deepStrictEqual([...loadedSub.keysByOrder()], [...loadedSub.keys()]);
	});
});
