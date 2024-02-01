/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { describeCompat } from "@fluid-private/test-version-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";

import { ICollabChannelCore } from "../contracts";
import { TempCollabSpaceRuntime } from "../collabSpaces";
import { TempCollabSpaceRuntimeFactory } from "../factory";

import { CounterFactory, ISharedCounter } from "./counterFactory";

function sampleFactory() {
	return new TempCollabSpaceRuntimeFactory("MatrixWithCollab", [new CounterFactory()]);
}

describeCompat("Temporal Collab Spaces", "2.0.0-rc.1.0.0", (getTestObjectProvider) => {
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

	async function loadContainer(summaryVersion: string) {
		return provider.loadContainer(runtimeFactory, undefined, {
			[LoaderHeader.version]: summaryVersion,
		});
	}

	beforeEach("getTestObjectProvider", async () => {
		provider = getTestObjectProvider({ syncSummarizer: true });
	});

	it("Basic test", async () => {
		const container = await createContainer();
		const datastore = (await container.getEntryPoint()) as TempCollabSpaceRuntime;

		const cols = 40;
		const rows = 10000;

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

		let value = await datastore.getCellAsync(100, 5);

		const channel = (await datastore.getCellChannel(100, 5)) as ISharedCounter &
			ICollabChannelCore;
		// TBD - this fails as we are not properlly initializing channel
		// assert(channel.value === value?.value, "not the same value");

		channel.increment(100);
		value = await datastore.getCellAsync(100, 5);
		assert(channel.value === value?.value, "not the same value");

		datastore.saveChannelState(channel);
		datastore.destroyCellChannel(channel);

		value = await datastore.getCellAsync(100, 5);
		assert(channel.value === value?.value, "not the same value");

		// 100K rows test numbers:
		// Read arbitrary column: 1s on my dev box
		// But only 234ms if using non-async function (and thus not doing await here)!
		const start = performance.now();
		for (let i = 0; i < rows; i++) {
			await datastore.getCellAsync(i, 5);
			// datastore.getCell(i, 5);
		}
		const time = performance.now() - start;
		console.log(time);

		await provider.ensureSynchronized();
	});
});
