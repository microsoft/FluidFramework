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
				const createContainer = async (): Promise<TempCollabSpaceRuntime> => {
					const container = await provider.createContainer(runtimeFactory);
					containers.push(container);
					const cp = (await container.getEntryPoint()) as TempCollabSpaceRuntime;
					collabSpaces.push(cp);
					return cp;
				};

				async function loadContainer(/* summaryVersion: string */) {
					// TBD(Pri1): ensure we produce summary before loading here.

					const container = await provider.loadContainer(runtimeFactory, undefined, {
						// [LoaderHeader.version]: summaryVersion,
					});
					containers.push(container);
					const cp = (await container.getEntryPoint()) as TempCollabSpaceRuntime;
					collabSpaces.push(cp);

					await provider.ensureSynchronized();
					ensureSameSize();

					return cp;
				}

				beforeEach("getTestObjectProvider", async () => {
					provider = getTestObjectProvider({ syncSummarizer: true });
				});

				let provider: ITestObjectProvider;
				const containers: IContainer[] = [];
				const collabSpaces: TempCollabSpaceRuntime[] = [];

				const defaultFactory = sampleFactory();
				const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
					defaultFactory,
					registryEntries: [[defaultFactory.type, Promise.resolve(defaultFactory)]],
					runtimeOptions: {},
				});

				// Size of the matrix
				const cols = 40;
				const rows = 100;

				// Cell we will be interogating
				const row = 5;
				const col = 10;

				async function initializeContainer(collabSpace: TempCollabSpaceRuntime) {
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
							collabSpace.setCell(r, c, { value: 5, type: CounterFactory.Type });
						}
					}

					if (global?.gc !== undefined) {
						global.gc();
					}
				}

				function ensureSameSize() {
					const cp1 = collabSpaces[0];
					for (const cp of collabSpaces) {
						assert(cp1.rowCount === cp.rowCount, "syncronized");
						assert(cp1.colCount === cp.colCount, "syncronized");
					}
				}

				async function ensureSameValue(value: unknown, channel?: ICollabChannelCore) {
					// const cp1 = collabSpaces[0];
					if (channel) {
						assert(channel.value === value, "Cahnnel value is not the same!");
					}
					for (const cp of collabSpaces) {
						const value2 = await cp.getCellAsync(row, col);
						assert(value === value2?.value, "Non-synchronized value!");
					}
				}

				async function measureReadSpeed(collabSpace: TempCollabSpaceRuntime) {
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
					const collabSpace = await createContainer();

					// Have a secont container that follows passivley the first one
					await loadContainer();

					await initializeContainer(collabSpace);

					// TBD(Pri0): this synchronization takes very long time!
					// There are obviously a lot of ops, but it should still take relatively short amount of time.
					// Two things to check:
					// 1. Looks like our local test pipeline is slow, probably something easy to improve
					// 2. Enable op grouping, possibly compression by default to reduce amount of data that goes through
					//    local server
					await provider.ensureSynchronized();
					ensureSameSize();

					let initialValue = (await collabSpace.getCellAsync(row, col))?.value as number;

					// Create a collab channel to start collaboration.
					const channel = (await collabSpace.getCellChannel(row, col)) as ISharedCounter &
						ICollabChannelCore;
					const channel2 = await collabSpace.getCellChannel(row, col);
					assert(channel === channel2, "can get to same channel");

					await ensureSameValue(initialValue, channel);

					// Collaborate a bit :)
					channel.increment(100);
					initialValue += 100;

					await provider.ensureSynchronized();
					await ensureSameValue(initialValue);

					// Before channel has a chance to be saved or destroyed, let's load 3rd container from that state
					// and validate it can follow
					await loadContainer();

					// Save changes and destroy channel
					let destroyed = collabSpace.destroyCellChannel(channel);
					assert(!destroyed, "can't be destroyed without saving ops rountrip first");
					collabSpace.saveChannelState(channel);
					await provider.ensureSynchronized();
					await ensureSameValue(initialValue);

					destroyed = collabSpace.destroyCellChannel(channel);
					// If feels like we can't guarantee that actually, as we might need one more op
					// to make it possible. Not sure.
					assert(destroyed, "Channel should be destroyed by now!");

					// Add one more container and observe they are all equal
					await loadContainer();
					await ensureSameValue(initialValue);

					// Useful mostly if you debug and want measure column reading speed - read one column
					await measureReadSpeed(collabSpace);
				});
			},
		);
	});
});
