/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { IContainer } from "@fluidframework/container-definitions";

import {
	ICollabChannelCore,
	CollabSpaceCellType,
	IEfficientMatrix,
	IEfficientMatrixTest,
} from "../contracts";
import { createCollabSpace } from "../factory";

import { CounterFactory, ISharedCounter } from "./counterFactory";

function sampleFactory() {
	return createCollabSpace([new CounterFactory()]);
}

/*
 * // TBD(Pri0):
 * Things to test:
 * 1. Attached & Detached modes (for container, data store runtime)
 * 2. Connected & disconnected states
 * 3. Collaboration across multiple clients.
 * 4. Save transitions between the states, including
 *    - One user removing collab channel, while otehrs do not, and continue eventually making changes
 *    - Loading from summary that has collab channel removed (from summary), but some clients keep it in memory.
 *    - Fuzz tests
 */

/*
 * This dance with describe() -> describeCompat() and dynamic input is here only because
 * of mismatch in module types. In other places where we use @fluid-private/test-version-utils,
 * we solve this problem by putting "type": "module" in package.json.
 * This is Ok for test-only packages, but not ideal for package with shipping code.
 * // TBD(Pri0) - this fails when run from console (time-out), and succeeds when run from debugger (no time-outs)
 *    I believe this is due to describeCompat() being nested inside of describe().
 *    While we can increase timeout, it's better to find the right solution for this import problem.
 */
describe("Temporal Collab Spaces", () => {
	it("Creating tests", async () => {
		const importModule = await import("@fluid-private/test-version-utils");
		importModule.describeCompat(
			"Temporal Collab Spaces",
			"NoCompat",
			(getTestObjectProvider) => {
				let provider: ITestObjectProvider;
				let containers: IContainer[] = [];
				let collabSpaces: IEfficientMatrix[] = [];

				// Size of the matrix
				const cols = 7;
				const rows = 20;

				const defaultFactory = sampleFactory();
				const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
					defaultFactory,
					registryEntries: [[defaultFactory.type, Promise.resolve(defaultFactory)]],
					runtimeOptions: {},
				});

				const createContainer = async () => {
					const container = await provider.createContainer(runtimeFactory);
					containers.push(container);
					const cp = (await container.getEntryPoint()) as IEfficientMatrix &
						IEfficientMatrixTest;
					collabSpaces.push(cp);
					return cp;
				};

				async function addContainerInstance(/* summaryVersion: string */) {
					// TBD(Pri1): ensure we produce summary before loading here.

					const container = await provider.loadContainer(runtimeFactory, undefined, {
						// [LoaderHeader.version]: summaryVersion,
					});
					containers.push(container);
					const cp = (await container.getEntryPoint()) as IEfficientMatrix;
					collabSpaces.push(cp);

					await provider.ensureSynchronized();
					ensureSameSize();

					return cp;
				}

				beforeEach("getTestObjectProvider", async () => {
					provider = getTestObjectProvider({ syncSummarizer: true });
				});

				afterEach(() => {
					for (const container of containers) {
						container.close();
					}
					containers = [];
					collabSpaces = [];
				});

				/**
				 * Populates collab space with initial values
				 */
				async function populateInitialMatrix(
					collabSpace: IEfficientMatrix,
					value: CollabSpaceCellType,
				) {
					// +700Mb, but only +200Mb if accounting GC after that.
					collabSpace.insertCols(0, cols);
					collabSpace.insertRows(0, rows);

					if (global?.gc !== undefined) {
						global.gc();
					}

					// 100K rows test numbers:
					// +550Mb with GC step after that having almost no impact
					// Though if GC did not run in a step above, this number is much higher (+1GB),
					// suggesting that actual memory growth is 1GB, but 500Mb offset could be coming
					// from the fact that GC did not had a chance to run and cleanup after previous step.
					for (let r = 0; r < rows; r++) {
						for (let c = 0; c < cols; c++) {
							collabSpace.setCell(r, c, value);
						}
					}

					if (global?.gc !== undefined) {
						global.gc();
					}
				}

				/**
				 * Creates a pair of containers and initializes them with initial state
				 * @returns collab space
				 */
				async function initialize() {
					const collabSpace = await createContainer();

					// Ensure that data store is properly attached. It should be, as default
					// data store is aliased (and thus attached) in test container
					assert(collabSpace.isAttached, "data store is not attached");

					// Have a secont container that follows passivley the first one
					await addContainerInstance();

					// Populate initial state of the matrix - insert a ton of rows & columns and populate
					// all cells with same data.
					await populateInitialMatrix(collabSpace, {
						value: 5,
						type: CounterFactory.Type,
					});

					// TBD(Pri0): this synchronization takes very long time (for medium sized tables, like 100x40)!
					// There are obviously a lot of ops, but it should still take relatively short amount of time.
					// This might be an test code issue, but also (much worse) - a production code inefficiency.
					// Two things to check:
					// 1. Looks like our local test pipeline is slow, probably something easy to improve
					// 2. Enable op grouping, possibly compression by default to reduce amount of data that goes through
					//    local server
					await provider.ensureSynchronized();
					ensureSameSize();

					return collabSpace;
				}

				function ensureSameSize() {
					const cp1 = collabSpaces[0];
					for (const cp of collabSpaces) {
						assert(cp1.rowCount === cp.rowCount, "syncronized");
						assert(cp1.colCount === cp.colCount, "syncronized");
					}
				}

				async function ensureSameValues(
					row: number,
					col: number,
					value: unknown,
					channel?: ICollabChannelCore,
				) {
					// const cp1 = collabSpaces[0];
					if (channel) {
						assert(channel.value === value, "Cahnnel value is not the same!");
					}
					for (const cp of collabSpaces) {
						const value2 = await cp.getCellAsync(row, col);
						assert(value === value2?.value, "Non-synchronized value!");
					}
				}

				async function measureReadSpeed(col: number, collabSpace: IEfficientMatrix) {
					// 100K rows test numbers:
					// Read arbitrary column: 1s on my dev box
					// But only 234ms if using non-async function (and thus not doing await here)!
					const start = performance.now();
					for (let i = 0; i < rows; i++) {
						await collabSpace.getCellAsync(i, col);
						// collabSpace.getCell(i, col);
					}
					const time = performance.now() - start;
					console.log(time);
				}

				it("Basic test", async () => {
					// Cell we will be interrogating
					const row = 5;
					const col = 3;

					const collabSpace = await initialize();

					let initialValue = (await collabSpace.getCellAsync(row, col))?.value as number;

					// Create a collab channel to start collaboration.
					const channel = (await collabSpace.getCellChannel(row, col)) as ISharedCounter;
					let channel2 = (await collabSpace.getCellChannel(row, col)) as ISharedCounter;
					assert(channel === channel2, "getCellChannel() returns same channel");

					// If channel is not properly attached, then the rest of the test will fail as
					// data will not be replicated properly.
					assert(channel.isAttached(), "channel is not properly attached");

					await ensureSameValues(row, col, initialValue, channel);

					// Collaborate a bit :)
					channel.increment(100);
					initialValue += 100;

					await provider.ensureSynchronized();
					await ensureSameValues(row, col, initialValue, channel);

					// Before channel has a chance to be saved or destroyed, let's load 3rd container from that state
					// and validate it can follow
					await addContainerInstance();

					// implementation detail: due to op grouping and issue with same sequence numbers, we need
					// one more batch to ensure channel could be safely destroyed below (and test to validate it).
					// Make some arbitrary change, but also test insertion flow.
					collabSpace.insertRows(rows, 1);
					await provider.ensureSynchronized();
					ensureSameSize();

					// Also let's grap channel in second container for later manipulations
					channel2 = (await collabSpaces[2].getCellChannel(row, col)) as ISharedCounter;

					// Save changes and destroy channel
					let destroyed = collabSpace.destroyCellChannel(channel);
					assert(
						!destroyed,
						"can't be destroyed without matrix save ops doing rountrip first",
					);
					collabSpace.saveChannelState(channel);

					await provider.ensureSynchronized();
					await ensureSameValues(row, col, initialValue, channel);

					destroyed = collabSpace.destroyCellChannel(channel);
					assert(destroyed, "Channel should be destroyed by now!");

					// Add one more container and observe they are all equal
					// TBD(Pri1): It would be nice somehow to validate that such channel was dropped from summary!
					await addContainerInstance();
					await ensureSameValues(row, col, initialValue, channel2);

					// After one container destroyed the channel (and 3rd container loaded without channel),
					// let's test that op showing up on that channel will be processed correctly by all containers.
					channel2.increment(10);
					initialValue += 10;
					await provider.ensureSynchronized();
					await ensureSameValues(row, col, initialValue, channel2);

					// Useful mostly if you debug and want measure column reading speed - read one column
					await measureReadSpeed(col, collabSpace);
				});

				it("Concurrent changes", async () => {
					// Cell we will be interrogating
					const row = 6;
					const col = 3;

					const collabSpace = await initialize();

					const channel2a = (await collabSpace.getCellChannel(
						row,
						col,
					)) as ISharedCounter;
					const channel2b = (await collabSpaces[1].getCellChannel(
						row,
						col,
					)) as ISharedCounter;

					// Concurrent changes - clients do not see each other changes yet
					const initialValue = channel2a.value;
					channel2a.increment(10);
					channel2b.increment(20);
					assert(
						channel2a.value !== channel2b.value,
						"test infra should not process all ops synchronously",
					);

					// syncrhonize - all containers should see exactly same changes
					await provider.ensureSynchronized();
					assert(channel2a.value === channel2b.value, "syncrhonized");
					await ensureSameValues(row, col, initialValue + 30, channel2a);
				});

				it("Channel overwrite", async () => {
					// Cell we will be interrogating
					const row = 7;
					const col = 3;

					const collabSpace = await initialize();

					const channel2a = (await collabSpace.getCellChannel(
						row,
						col,
					)) as ISharedCounter;

					// Make some changes on a channel
					const initialValue = channel2a.value;
					let overwriteValue = initialValue + 100;
					channel2a.increment(10);

					// TBD(Pri1): Test fails if this synchronizaiton is removed, due to Pri1 comment in
					// TempCollabSpaceRuntime.updatePendingCoutner()
					// The issue should be fixed, and test should be duplicated - one version to run with this
					// extra synchronizaiton, and one without.
					await provider.ensureSynchronized();

					// Overwrite it!
					const collabSpace2 = collabSpaces[1];
					collabSpace2.setCell(row, col, {
						value: overwriteValue,
						type: CounterFactory.Type,
					});

					// syncrhonize - all containers should see exactly same changes
					await provider.ensureSynchronized();
					await ensureSameValues(row, col, overwriteValue);

					assert(channel2a.value === initialValue + 10, "No impact on unrooted channel");

					// Retrieve channel for same cell
					const channel2b = (await collabSpace.getCellChannel(
						row,
						col,
					)) as ISharedCounter;
					const channel2c = (await collabSpace2.getCellChannel(
						row,
						col,
					)) as ISharedCounter;
					assert(channel2b.value === overwriteValue, "overwritten value");
					assert(channel2c.value === overwriteValue, "overwritten value");

					channel2c.increment(10);
					overwriteValue += 10;
					await provider.ensureSynchronized();
					await ensureSameValues(row, col, overwriteValue);
					assert(channel2b.value === overwriteValue, "overwritten value");
					assert(channel2c.value === overwriteValue, "overwritten value");
					assert(channel2a.value === initialValue + 10, "No impact on unrooted channel");
				});
			},
		);
	});
});
