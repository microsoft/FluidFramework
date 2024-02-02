/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { IContainer } from "@fluidframework/container-definitions";

import { ICollabChannelCore } from "../contracts";
import { TempCollabSpaceRuntime } from "../collabSpaces";
import { TempCollabSpaceRuntimeFactory } from "../factory";

import { CounterFactory, ISharedCounter } from "./counterFactory";

function sampleFactory() {
	return new TempCollabSpaceRuntimeFactory("MatrixWithCollab", [new CounterFactory()]);
}

/*
 * Things to cover:
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
describe("Temporal Collab Spaces 1", () => {
	it("Sub-entry", async () => {
		const importModule = await import("@fluid-private/test-version-utils");
		importModule.describeCompat(
			"Temporal Collab Spaces",
			"2.0.0-rc.1.0.0",
			(getTestObjectProvider) => {
				let provider: ITestObjectProvider;
				const defaultFactory = sampleFactory();
				const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
					defaultFactory,
					registryEntries: [[defaultFactory.type, Promise.resolve(defaultFactory)]],
					runtimeOptions: {},
				});

				const createContainer = async (): Promise<IContainer> => {
					return provider.createContainer(runtimeFactory);
				};

				async function loadContainer(/* summaryVersion: string */) {
					return provider.loadContainer(runtimeFactory, undefined, {
						// [LoaderHeader.version]: summaryVersion,
					});
				}

				beforeEach("getTestObjectProvider", async () => {
					provider = getTestObjectProvider({ syncSummarizer: true });
				});

				it("Basic test", async () => {
					const container = await createContainer();
					const datastore = (await container.getEntryPoint()) as TempCollabSpaceRuntime;

					const container2 = await loadContainer();
					const datastore2 = (await container2.getEntryPoint()) as TempCollabSpaceRuntime;

					await provider.ensureSynchronized();

					const cols = 40;
					const rows = 100;
					const row = 5;
					const col = 10;

					// +700Mb, but only +200Mb if accounting GC after that.
					datastore.insertCols(0, cols);
					datastore.insertRows(0, rows);

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
							datastore.setCell(r, c, { value: 5, type: CounterFactory.Type });
						}
					}

					if (global?.gc !== undefined) {
						global.gc();
					}

					// TBD(Pri0): this synchronization takes very long time!
					// There are obviously a lot of ops, but it should still take relatively short amount of time.
					// Two things to check:
					// 1. Looks like our local test pipeline is slow, probably something easy to improve
					// 2. Enable op grouping, possibly compression by default to reduce amount of data that goes through
					//    local server
					await provider.ensureSynchronized();

					assert(datastore.rowCount === datastore2.rowCount, "syncronized");
					assert(datastore.colCount === datastore2.colCount, "syncronized");

					let value = await datastore.getCellAsync(row, col);

					const channel = (await datastore.getCellChannel(row, col)) as ISharedCounter &
						ICollabChannelCore;
					const channel2 = await datastore.getCellChannel(row, col);
					assert(channel === channel2, "can get to same channel");

					assert(channel.value === value?.value, "Channel has the same initial state");

					channel.increment(100);
					const channelValue = channel.value;

					value = await datastore.getCellAsync(row, col);
					assert(channelValue === value?.value, "Channel and cell has the same value");

					await provider.ensureSynchronized();

					let value2 = await datastore2.getCellAsync(row, col);
					assert(channelValue === value2?.value, "Another container has the same value!");

					// Save changes and destroy channel
					datastore.saveChannelState(channel);
					datastore.destroyCellChannel(channel);

					await provider.ensureSynchronized();

					value = await datastore.getCellAsync(row, col);
					assert(channelValue === value?.value, "Value was properly stored in matrix");

					value2 = await datastore2.getCellAsync(row, col);
					assert(channelValue === value2?.value, "Another container has the same value!");

					// 100K rows test numbers:
					// Read arbitrary column: 1s on my dev box
					// But only 234ms if using non-async function (and thus not doing await here)!
					const start = performance.now();
					for (let i = 0; i < rows; i++) {
						await datastore.getCellAsync(i, col);
						// datastore.getCell(i, col);
					}
					const time = performance.now() - start;
					console.log(time);

					await provider.ensureSynchronized();
				});
			},
		);
	});
});
