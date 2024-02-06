/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, delay } from "@fluidframework/core-utils";
import {
	ITestObjectProvider,
	TestContainerRuntimeFactory,
	TestFluidObjectFactory,
	TestObjectProvider,
	summarizeNow,
	createSummarizerCore,
} from "@fluidframework/test-utils";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { IContainer, IHostLoader } from "@fluidframework/container-definitions";
import {
	IContainerRuntimeOptions,
	ISummarizer,
	SummaryCollection,
} from "@fluidframework/container-runtime";
import { LocalServerTestDriver } from "@fluid-private/test-drivers";
import { Loader as ContainerLoader } from "@fluidframework/container-loader";
import { createChildLogger } from "@fluidframework/telemetry-utils";

import {
	ICollabChannelCore,
	CollabSpaceCellType,
	IEfficientMatrix,
	IEfficientMatrixTest,
} from "../contracts";
import { createCollabSpace } from "../factory";

import { CounterFactory, ISharedCounter } from "./counterFactory";

/* eslint-disable @typescript-eslint/no-non-null-assertion */

function sampleFactory() {
	return createCollabSpace([new CounterFactory()]);
}

/*
 * // TBD(Pri2):
 * Things to test:
 * 1. Detached data store mode
 * 2. Fuzz tests
 */

describe("Temporal Collab Spaces", () => {
	let provider: ITestObjectProvider;
	let containers: IContainer[] = [];
	let collabSpaces: (IEfficientMatrix & IEfficientMatrixTest)[] = [];
	let summaryCollection: SummaryCollection | undefined;
	let summarizer: ISummarizer | undefined;
	let loader: IHostLoader | undefined;

	// Size of the matrix
	const cols = 7;
	const rows = 20;

	const runtimeOptions: IContainerRuntimeOptions = {
		enableGroupedBatching: true,
		chunkSizeInBytes: 950000,
		maxBatchSizeInBytes: 990000,
	};
	const defaultFactory = sampleFactory();
	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory,
		registryEntries: [[defaultFactory.type, Promise.resolve(defaultFactory)]],
		runtimeOptions,
	});

	const createContainer = async () => {
		const container = await provider.createContainer(runtimeFactory);
		containers.push(container);
		const collabSpace = (await container.getEntryPoint()) as IEfficientMatrix &
			IEfficientMatrixTest;
		collabSpaces.push(collabSpace);
		return { container, collabSpace };
	};

	async function addContainerInstance(/* summaryVersion: string */) {
		const container = await provider.loadContainer(runtimeFactory, undefined, {
			// [LoaderHeader.version]: summaryVersion,
		});
		containers.push(container);
		const cp = (await container.getEntryPoint()) as IEfficientMatrix & IEfficientMatrixTest;
		collabSpaces.push(cp);

		await provider.ensureSynchronized();
		ensureSameSize();

		return cp;
	}

	beforeEach("getTestObjectProvider", async () => {
		const driver = new LocalServerTestDriver();
		const registry = [];

		provider = new TestObjectProvider(
			ContainerLoader as any,
			driver,
			() =>
				new TestContainerRuntimeFactory(
					"@fluid-experimental/test-propertyTree",
					new TestFluidObjectFactory(registry),
				),
		);
		// syncSummarizer: true
		provider.resetLoaderContainerTracker(true /* syncSummarizerClients */);

		loader = provider.createLoader([[provider.defaultCodeDetails, runtimeFactory]]);
	});

	afterEach(() => {
		provider.reset();
		for (const container of containers) {
			container.close();
		}
		containers = [];
		collabSpaces = [];
		summaryCollection = undefined;
		summarizer = undefined;
		loader = undefined;
	});

	async function waitForSummary() {
		assert(summaryCollection !== undefined, "summary setup properly");
		return summaryCollection.waitSummaryAck(containers[0].deltaManager.lastSequenceNumber);
	}

	/**
	 * Populates collab space with initial values
	 */
	async function populateInitialMatrix(
		collabSpace: IEfficientMatrix & IEfficientMatrixTest,
		value: CollabSpaceCellType,
	) {
		// Container is in "read" connection mode. If
		// This will cause it to go through resubmit flow and it's super expensive.
		// So let's make sure these ops (related to matrix size setting) go through first
		// (and force container into "write" mode), such that we do not pay the cost of resubmitting
		// a ton of setCell() calls later!
		collabSpace.insertRows(0, 1);
		if (collabSpace.isAttached) {
			await provider.ensureSynchronized();
		}

		// +700Mb, but only +200Mb if accounting GC after that.
		collabSpace.insertCols(0, cols);
		collabSpace.insertRows(0, rows - 1);

		// Roughly how many cells were changed due to row/col ID tracking
		let cells = cols + rows;

		if (global?.gc !== undefined) {
			global.gc();
		}

		// 100K rows test numbers:
		// +550Mb with GC step after that having almost no impact
		// Though if GC did not run in a step above, this number is much higher (+1GB),
		// suggesting that actual memory growth is 1GB, but 500Mb offset could be coming
		// from the fact that GC did not had a chance to run and cleanup after previous step.
		for (let c = 0; c < cols; c++) {
			// Batches are becoming too large. When testing 40 x 100K.
			// Thus flush ops sooner in smaller chunks. It mostly ensures we do not run out of memory.
			// 10K cell updates correspons roughtly to 2.5Mb of content before compression
			cells += rows;
			if (cells >= 10000) {
				await delay(0);
				cells = 0;
			}

			for (let r = 0; r < rows; r++) {
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
		const { container, collabSpace } = await createContainer();

		// Create and setup a summary collection that will be used to track and wait for summaries.
		summaryCollection = new SummaryCollection(container.deltaManager, createChildLogger());

		summarizer = (await createSummarizerCore(container, loader!)).summarizer;

		// Ensure that data store is properly attached. It should be, as default
		// data store is aliased (and thus attached) in test container
		assert(collabSpace.isAttached, "data store is not attached");

		// Have a secont container that follows passivley the first one
		await addContainerInstance();

		const start = performance.now();
		// Populate initial state of the matrix - insert a ton of rows & columns and populate
		// all cells with same data.
		await populateInitialMatrix(collabSpace, {
			value: 5,
			type: CounterFactory.Type,
		});

		await provider.ensureSynchronized();

		const time = performance.now() - start;
		console.log("Time to populate", time);

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
		channels: ICollabChannelCore[] = [],
	) {
		// const cp1 = collabSpaces[0];
		for (const channel of channels) {
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

	it("Detached container test", async () => {
		// Cell we will be interrogating
		const row = 5;
		const col = 3;

		const container = await loader!.createDetachedContainer(provider.defaultCodeDetails);
		containers.push(container);
		const collabSpace = (await container.getEntryPoint()) as IEfficientMatrix &
			IEfficientMatrixTest;
		collabSpaces.push(collabSpace);

		assert(!collabSpace.isAttached, "data store is not attached");

		await populateInitialMatrix(collabSpace, {
			value: 5,
			type: CounterFactory.Type,
		});

		// Create a collab channel to start collaboration.
		const channel = (await collabSpace.getCellChannel(row, col)) as ISharedCounter;
		let channel2 = (await collabSpace.getCellChannel(row, col)) as ISharedCounter;
		assert(channel === channel2, "getCellChannel() returns same channel");
		assert(!channel.isAttached(), "channel is not properly attached");

		// Collaborate a bit :)
		let initialValue = (await collabSpace.getCellAsync(row, col))?.value as number;
		channel.increment(100);
		initialValue += 100;

		// Save changes and destroy channel
		const destroyed = collabSpace.destroyCellChannel(channel);
		assert(destroyed, "in detached stayed it should be destroyed immidiatly");
		let value2 = await collabSpace.getCellAsync(row, col);
		assert(value2?.value === initialValue, "value was preserved correctly");

		// Get channel back.
		channel2 = (await collabSpace.getCellChannel(row, col)) as ISharedCounter;
		assert(channel2.value === initialValue, "value was preserved correctly");
		channel2.increment(10);
		initialValue += 10;

		const request = provider.driver.createCreateNewRequest(provider.documentId);
		await container.attach(request);

		// Have a secont container that follows passivley the first one
		await addContainerInstance();
		await provider.ensureSynchronized();

		ensureSameSize();
		value2 = await collabSpaces[1].getCellAsync(row, col);
		assert(value2?.value === initialValue, "value was preserved correctly");
	});

	it("Basic test", async () => {
		// Cell we will be interrogating
		const row = 5;
		const col = 3;

		const collabSpace = await initialize();

		let initialValue = (await collabSpace.getCellAsync(row, col))?.value as number;

		// Create a collab channel to start collaboration.
		let channel = (await collabSpace.getCellChannel(row, col)) as ISharedCounter;
		let channel2 = (await collabSpace.getCellChannel(row, col)) as ISharedCounter;
		assert(channel === channel2, "getCellChannel() returns same channel");

		// If channel is not properly attached, then the rest of the test will fail as
		// data will not be replicated properly.
		assert(channel.isAttached(), "channel is not properly attached");

		await ensureSameValues(row, col, initialValue, [channel]);

		// Collaborate a bit :)
		channel.increment(100);
		initialValue += 100;

		await provider.ensureSynchronized();
		await ensureSameValues(row, col, initialValue, [channel]);

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
		assert(!destroyed, "can't be destroyed without matrix save ops doing rountrip first");
		collabSpace.saveChannelState(channel);

		await provider.ensureSynchronized();
		await ensureSameValues(row, col, initialValue, [channel]);

		destroyed = collabSpace.destroyCellChannel(channel);
		assert(destroyed, "Channel should be destroyed by now!");

		// TBD(Pri0): Need to flip runSummaryValidation to true.
		// This fails due to deleted channel. Need to figure out proper solution
		const runSummaryValidation = false;

		// Force summary to test that channel is gone.
		if (runSummaryValidation) {
			await summarizeNow(summarizer!);
			await waitForSummary();
		}

		// Add one more container and observe they are all equal
		await addContainerInstance();
		await ensureSameValues(row, col, initialValue, [channel2]);

		// Validate that channel is not present in summary!
		if (runSummaryValidation) {
			const channel3 = await collabSpaces[2].getCellDebugInfo(row, col);
			assert(channel3 === undefined, "channel was not removed from summary");
		}

		// recreate deleted channel
		channel = (await collabSpace.getCellChannel(row, col)) as ISharedCounter;

		// After one container destroyed the channel (and 3rd container loaded without channel),
		// let's test that op showing up on that channel will be processed correctly by all containers.
		channel2.increment(10);
		initialValue += 10;
		await provider.ensureSynchronized();
		await ensureSameValues(row, col, initialValue, [channel, channel2]);

		// Useful mostly if you debug and want measure column reading speed - read one column
		await measureReadSpeed(col, collabSpace);
	});

	it("Concurrent changes", async () => {
		// Cell we will be interrogating
		const row = 6;
		const col = 3;

		const collabSpace = await initialize();

		const channel2a = (await collabSpace.getCellChannel(row, col)) as ISharedCounter;
		const channel2b = (await collabSpaces[1].getCellChannel(row, col)) as ISharedCounter;

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
		await ensureSameValues(row, col, initialValue + 30, [channel2a, channel2b]);
	});

	// Baseline for a number of tests (with different arguments)
	async function ChannelOverwrite(synchronize: boolean) {
		// Cell we will be interrogating
		const row = 7;
		const col = 3;

		const collabSpace = await initialize();

		const channel2a = (await collabSpace.getCellChannel(row, col)) as ISharedCounter;

		// Make some changes on a channel
		const initialValue = channel2a.value;
		let overwriteValue = initialValue + 100;
		channel2a.increment(10);

		// We test vastly different scenario depending on if we wait or not.
		// If we do not wait, then we test concurrent changes in channel and overwrite
		// (and thus test what happens if ops arrive to not known to a client unrooted channel).
		// If we wait, then there is not concurrency at all.
		if (synchronize) {
			await provider.ensureSynchronized();
		}

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
		const channel2b = (await collabSpace.getCellChannel(row, col)) as ISharedCounter;
		const channel2c = (await collabSpace2.getCellChannel(row, col)) as ISharedCounter;
		await ensureSameValues(row, col, overwriteValue, [channel2b, channel2c]);

		channel2c.increment(10);
		overwriteValue += 10;
		await provider.ensureSynchronized();
		await ensureSameValues(row, col, overwriteValue);
		await ensureSameValues(row, col, overwriteValue, [channel2b, channel2c]);
		assert(channel2a.value === initialValue + 10, "No impact on unrooted channel");

		// TBD(Pri1): Need to implement undo - restore original channel, validate that none
		// of the changes that were made before were lost, and that further collaboration could
		// be done on this channel.
		// Plus redo, and come back to second channel.
	}

	it("Channel overwrite with syncronization", async () => {
		await ChannelOverwrite(true);
	});

	// TBD(Pri1): Test fails if this synchronizaiton is removed, due to Pri1 comment in
	// TempCollabSpaceRuntime.updatePendingCoutner()
	// The issue should be fixed, and test should be duplicated - one version to run with this
	// extra synchronizaiton, and one without.
	it.skip("Channel overwrite without syncronization", async () => {
		await ChannelOverwrite(false);
	});
});

/* eslint-enable @typescript-eslint/no-non-null-assertion */
