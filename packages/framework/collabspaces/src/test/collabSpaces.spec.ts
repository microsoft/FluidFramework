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
import { Loader } from "@fluidframework/container-loader";
import { createChildLogger } from "@fluidframework/telemetry-utils";
import { IRevertible } from "@fluidframework/matrix";

import {
	ICollabChannelCore,
	CollabSpaceCellType,
	IEfficientMatrix,
	IEfficientMatrixTest,
	SaveResult,
} from "../contracts";
import { createCollabSpaces } from "../factory";

import { CounterFactory, ISharedCounter } from "./counterFactory";

/* eslint-disable @typescript-eslint/no-non-null-assertion */

type IMatrix = IEfficientMatrix & IEfficientMatrixTest;

function sampleFactory() {
	return createCollabSpaces([new CounterFactory()], true /* createDebugChannel */);
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
	let collabSpaces: IMatrix[] = [];
	let summarizerCollabSpace: IMatrix;
	let summaryCollection: SummaryCollection | undefined;
	let summarizer: ISummarizer | undefined;
	let loader: IHostLoader | undefined;
	let seed: number;

	const runtimeOptions: IContainerRuntimeOptions = {
		enableGroupedBatching: true,
		chunkSizeInBytes: 950000,
		maxBatchSizeInBytes: 990000,
		enableRuntimeIdCompressor: true,
	};
	const defaultFactory = sampleFactory();
	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory,
		registryEntries: [[defaultFactory.type, Promise.resolve(defaultFactory)]],
		runtimeOptions,
	});

	// Produce pseudo-random numbers from a seed (i.e. repeatable stream):
	function random() {
		const x = Math.sin(seed++) * 10000;
		return x - Math.floor(x);
	}

	const rand = (maxIncluded: number) => {
		return Math.round(random() * maxIncluded);
	};
	const randNotInclusive = (maxIncluded: number) => {
		return Math.floor(random() * maxIncluded);
	};

	async function addContainer(container: IContainer) {
		containers.push(container);
		const collabSpace = (await container.getEntryPoint()) as IMatrix;
		collabSpaces.push(collabSpace);

		await provider.ensureSynchronized();
		ensureSameSize();

		return { container, collabSpace };
	}

	const createContainer = async () => {
		const container = await provider.createContainer(runtimeFactory);
		return addContainer(container);
	};

	async function addContainerInstance() {
		const container = await provider.loadContainer(runtimeFactory);
		return addContainer(container);
	}

	beforeEach("getTestObjectProvider", async () => {
		const driver = new LocalServerTestDriver();
		const registry = [];
		seed = 1; // Every test is independent from another test!

		provider = new TestObjectProvider(
			Loader,
			driver,
			() =>
				new TestContainerRuntimeFactory(
					"@fluid-experimental/test-collabspaces",
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

	async function waitForSummary(): Promise<string> {
		// ensure that all changes made it through
		await provider.ensureSynchronized();

		assert(summaryCollection !== undefined, "summary setup properly");
		// create promise before we call summarizeNow, as otherwise we might miss summary and will wait
		// forever for next one to happen
		const wait = summaryCollection.waitSummaryAck(
			containers[0].deltaManager.lastSequenceNumber,
		);
		const summaryResult = await summarizeNow(summarizer!);
		assert(summaryResult.summaryVersion !== undefined, "summary result");
		const ackedSummary = await wait;
		assert(ackedSummary.summaryAck.contents.handle !== undefined, "summary acked");
		return summaryResult.summaryVersion;
	}

	/**
	 * Populates collab space with initial values
	 */
	async function populateInitialMatrix(
		collabSpace: IMatrix,
		rows: number,
		cols: number,
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
		// the first row is already there
		collabSpace.insertRows(1, rows - 1);

		// Roughly how many cells were changed due to row/col ID tracking
		let cells = cols + rows;

		if (global?.gc !== undefined) {
			global.gc();
		}

		// 100K rows test numbers:
		// +550Mb with GC  after that having almost no impact
		// Though if GC did not run in a  above, this number is much higher (+1GB),
		// suggesting that actual memory growth is 1GB, but 500Mb offset could be coming
		// from the fact that GC did not had a chance to run and cleanup after previous .
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
	async function initialize(rows: number, cols: number) {
		const { container, collabSpace } = await createContainer();

		// Create and setup a summary collection that will be used to track and wait for summaries.
		summaryCollection = new SummaryCollection(container.deltaManager, createChildLogger());

		const summarizerRes = await createSummarizerCore(container, loader!);
		summarizer = summarizerRes.summarizer;
		// This is required for such operations as moveMsnForAllContainers
		// There are likely better way to achieve it, but we need all containers to advertise their
		// reference sequence number such that MSN moves.
		containers.push(summarizerRes.container);
		summarizerCollabSpace = (await container.getEntryPoint()) as IMatrix;

		// Ensure that data store is properly attached. It should be, as default
		// data store is aliased (and thus attached) in test container
		assert(collabSpace.isAttached, "data store is not attached");

		// Have a second container that follows passivley the first one
		await addContainerInstance();

		const start = performance.now();
		// Populate initial state of the matrix - insert a ton of rows & columns and populate
		// all cells with same data.
		await populateInitialMatrix(collabSpace, rows, cols, {
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
			assert(channel.value === value, "Channel value is not the same!");
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
		for (let i = 0; i < collabSpace.rowCount; i++) {
			await collabSpace.getCellAsync(i, col);
			// collabSpace.getCell(i, col);
		}
		const time = performance.now() - start;
		console.log(time);
	}

	function sendNoop(cp: IMatrix) {
		cp.sendSomeDebugOp();
	}

	async function moveMsnForAllContainers() {
		// Submit some op
		sendNoop(collabSpaces[0]);

		// make sure all containers saw all the ops, and thus updated their reference Sequence number
		await provider.ensureSynchronized();
		const seq = containers[0].deltaManager.lastSequenceNumber;

		// every container to communicate their reference sequence number, allow MSN to move forward
		for (const cp of [...collabSpaces, summarizerCollabSpace]) {
			// summarizerCollabSpace is undefined in detached tests
			if (cp !== undefined) {
				sendNoop(cp);
			}
		}

		await provider.ensureSynchronized();

		sendNoop(collabSpaces[0]);
		await provider.ensureSynchronized();

		// TBD(Pri2)
		// For some reasons steps above are not enough to move MSN:
		// Server seems not to bump MSN even though all containers reported new referenceSequenceNumber.
		// Usually noops that follow on a timer result in eventual MSN move.
		// But even that is not enough, but sending more ops resolve the issue, likely due to hitting another
		// noop heuristic. Not sure - need to figure it out!
		while (containers[0].deltaManager.minimumSequenceNumber < seq) {
			await delay(0);
			sendNoop(collabSpaces[0]);
		}
		assert(containers[0].deltaManager.minimumSequenceNumber >= seq, "MSN did not move!");
		ensureSameSize();
	}

	// Synchronize containers and validate they all have exactly same state
	const synchronizeAndValidateContainerFn = async () => {
		await provider.ensureSynchronized();
		ensureSameSize();

		const cp0 = collabSpaces[0];
		const rowCount = cp0.rowCount;
		const colCount = cp0.colCount;
		for (let row = 0; row < rowCount; row++) {
			for (let col = 0; col < colCount; col++) {
				const value = await cp0.getCellAsync(row, col);
				await ensureSameValues(row, col, value?.value);
			}
		}
	};

	async function doFinalValidation() {
		await moveMsnForAllContainers();
		await synchronizeAndValidateContainerFn();

		for (const cp of [...collabSpaces, summarizerCollabSpace]) {
			// summarizerCollabSpace is undefined in detached tests
			if (cp === undefined) {
				continue;
			}
			const { rooted, notRooted } = await cp.getAllChannels();
			for (const channel of rooted) {
				const res = cp.saveChannelState(channel);
				assert(
					res === SaveResult.Saved || res === SaveResult.NoNeedToSave,
					"should be able to save rooted channel",
				);
			}
			for (const channel of notRooted) {
				assert(
					cp.saveChannelState(channel) === SaveResult.NotRooted,
					"should not be able to save rooted channel",
				);
			}

			await provider.ensureSynchronized();
			sendNoop(collabSpaces[0]);
			await synchronizeAndValidateContainerFn();

			for (const channel of rooted) {
				assert(
					cp.saveChannelState(channel) === SaveResult.NoNeedToSave,
					"there should be no need to save channels",
				);
				assert(cp.destroyCellChannel(channel), "should be able to destroy rooted channel");
			}
		}
	}

	async function saveAndDestroyChannel(
		channel: ISharedCounter,
		collabSpace: IMatrix,
		row: number,
		col: number,
		value: number,
	) {
		// Save changes and destroy channel
		assert(
			!collabSpace.destroyCellChannel(channel),
			"can't be destroyed without matrix save ops doing rountrip first",
		);
		assert(collabSpace.saveChannelState(channel) === SaveResult.Saved, "saved");
		assert(
			!collabSpace.destroyCellChannel(channel),
			"can't be destroyed without matrix save ops doing rountrip first",
		);

		await provider.ensureSynchronized();
		await ensureSameValues(row, col, value, [channel]);

		// Need to move MSN for channel to be destroyable!
		// Make arbitrary change
		await moveMsnForAllContainers();

		assert(collabSpace.destroyCellChannel(channel), "Channel should be destroyed by now!");
	}

	describe("Detached tests", () => {
		it("Detached container test", async () => {
			// Cell we will be interrogating
			const row = 5;
			const col = 3;

			const container = await loader!.createDetachedContainer(provider.defaultCodeDetails);
			containers.push(container);
			const collabSpace = (await container.getEntryPoint()) as IMatrix;
			collabSpaces.push(collabSpace);

			assert(!collabSpace.isAttached, "data store is not attached");

			await populateInitialMatrix(collabSpace, 20, 7, {
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
			assert(
				collabSpace.destroyCellChannel(channel),
				"in detached stayed it should be destroyed immidiatly",
			);
			let value2 = await collabSpace.getCellAsync(row, col);
			assert(value2?.value === initialValue, "value was preserved correctly");

			// Get channel back.
			channel2 = (await collabSpace.getCellChannel(row, col)) as ISharedCounter;
			assert(channel2.value === initialValue, "value was preserved correctly");
			channel2.increment(10);
			initialValue += 10;

			const request = provider.driver.createCreateNewRequest(provider.documentId);
			await container.attach(request);

			// Have a second container that follows passivley the first one
			await addContainerInstance();
			await provider.ensureSynchronized();

			ensureSameSize();
			value2 = await collabSpaces[1].getCellAsync(row, col);
			assert(value2?.value === initialValue, "value was preserved correctly");

			await saveAndDestroyChannel(channel2, collabSpace, row, col, initialValue);

			await doFinalValidation();
		});
	});

	describe("Reverse Mapping tests", () => {
		function compareMaps(map1: { [id: string]: number }, map2: { [id: string]: number }) {
			assert(Object.keys(map1).length === Object.keys(map2).length, "maps size is different");
			for (const [id, rowValue] of Object.entries(map1)) {
				if (id in map2) {
					const colValue = map2[id];
					assert(
						rowValue === colValue,
						`Values for id ${id} do not match: row = ${rowValue}, col = ${colValue}`,
					);
				} else {
					assert(false, `No matching id found in map2 for ${id}`);
				}
			}
		}

		it("Reverse Mapping: Basic test", async () => {
			const rows = 20;
			const cols = 7;
			const row = 5;
			const col = 3;
			const collabSpace = await initialize(rows, cols);
			const { rowId, colId } = await collabSpace.getCellDebugInfo(row, col);

			const debugMapInfo = collabSpace.getReverseMapsDebugInfo();
			const reverseCellInfo = await collabSpace.getReverseMapCellDebugInfo(rowId, colId);
			assert(Object.keys(debugMapInfo.rowMap).length === rows, "rowMapSize is incorrect");
			assert(
				reverseCellInfo.row === row,
				"rowIndex from the actual matrix has to be offset by 1",
			);
			assert(Object.keys(debugMapInfo.colMap).length === cols, "colMapSize is incorrect");
			assert(reverseCellInfo.col === col, "colIndex is correct");
		});

		it("Reverse Mapping: Basic row adding test", async () => {
			const rows = 20;
			const cols = 7;
			const row = 5;
			const col = 3;
			const collabSpace = await initialize(rows, cols);
			const numberOfNewRows = 2;
			// Insert rows to validate the reverse mappings are updated correctly
			collabSpace.insertRows(1, numberOfNewRows);
			collabSpace.setCell(row, col, {
				value: 5,
				type: CounterFactory.Type,
			});
			const { rowId, colId } = await collabSpace.getCellDebugInfo(row, col);
			const debugMapInfo = collabSpace.getReverseMapsDebugInfo();
			const reverseCellInfo = await collabSpace.getReverseMapCellDebugInfo(rowId, colId);

			assert(
				Object.keys(debugMapInfo.rowMap).length === rows + numberOfNewRows,
				"rowMapSize is incorrect",
			);
			assert(
				reverseCellInfo.row === row,
				"rowIndex from the actual matrix has to be offset by 1",
			);
			assert(Object.keys(debugMapInfo.colMap).length === cols, "colMapSize is incorrect");
			assert(reverseCellInfo.col === col, "colIndex is correct");
		});

		it("Reverse Mapping: Basic row removing test", async () => {
			const rows = 20;
			const cols = 7;
			const row = 1;
			const col = 3;
			const collabSpace = await initialize(rows, cols);
			let initialRowNumber = rows;
			for (let it = 0; it < 3; it++) {
				const numberOfRowsToBeRemoved = 2;
				const { rowId: nextRowId, colId: nextColId } = await collabSpace.getCellDebugInfo(
					row + numberOfRowsToBeRemoved,
					col,
				);
				collabSpace.removeRows(row, numberOfRowsToBeRemoved);

				const debugCellInfo = await collabSpace.getCellDebugInfo(row, col);
				assert(
					nextRowId === debugCellInfo.rowId,
					"rowId after removal should be the same as nextRowId",
				);
				assert(
					nextColId === debugCellInfo.colId,
					"colId after removal should be different",
				);

				const debugMapInfo = collabSpace.getReverseMapsDebugInfo();

				const reverseCellInfo = await collabSpace.getReverseMapCellDebugInfo(
					debugCellInfo.rowId,
					debugCellInfo.colId,
				);

				assert(
					Object.keys(debugMapInfo.rowMap).length ===
						initialRowNumber - numberOfRowsToBeRemoved,
					"rowMapSize is incorrect",
				);
				assert(
					reverseCellInfo.row === row,
					"rowIndex from the actual matrix has to be offset by 1",
				);
				assert(Object.keys(debugMapInfo.colMap).length === cols, "colMapSize is incorrect");
				assert(reverseCellInfo.col === col, "colIndex is correct");
				initialRowNumber -= numberOfRowsToBeRemoved;
			}
		});

		it("Reverse Mapping: Basic col removing test", async () => {
			const rows = 20;
			const cols = 7;
			const row = 1;
			const col = 3;
			const collabSpace = await initialize(rows, cols);
			const columnsToBeRemoved = 2;
			const { colId: nextColId } = await collabSpace.getCellDebugInfo(
				row,
				col + columnsToBeRemoved,
			);
			collabSpace.removeCols(col, columnsToBeRemoved);
			const { rowId, colId } = await collabSpace.getCellDebugInfo(row, col);

			assert(nextColId === colId, "colId after removal should be the same as nextColId");

			const debugMapInfo = collabSpace.getReverseMapsDebugInfo();
			const reverseCellInfo = await collabSpace.getReverseMapCellDebugInfo(rowId, colId);

			assert(Object.keys(debugMapInfo.rowMap).length === rows, "rowMapSize is incorrect");
			assert(
				reverseCellInfo.row === row,
				"rowIndex from the actual matrix has to be offset by 1",
			);
			assert(
				Object.keys(debugMapInfo.colMap).length === cols - columnsToBeRemoved,
				"colMapSize is incorrect",
			);
			assert(reverseCellInfo.col === col, "colIndex is correct");
		});

		it("Concurrent insertions", async () => {
			// Cell we will be interrogating
			const row = 5;
			const col = 1;
			const rows = 20;
			const cols = 7;
			const collabSpace = await initialize(rows, cols);

			const { rowId: rowId1, colId: colId1 } = await collabSpace.getCellDebugInfo(row, col);
			const { rowId: rowId2, colId: colId2 } = await collabSpaces[1].getCellDebugInfo(
				row,
				col,
			);
			assert(rowId2 === rowId1, "rowId should be the same");
			assert(colId2 === colId1, "colId should be the same");

			// Concurrent changes - clients do not see each other changes yet
			collabSpace.insertRows(0, 11);
			collabSpaces[1].insertRows(0, 4);

			await provider.ensureSynchronized();

			collabSpace.insertRows(0, 1);
			collabSpaces[1].insertRows(0, 2);

			// synchronize - all containers should see exactly same changes
			await provider.ensureSynchronized();

			const firstCollabResult = collabSpace.getReverseMapsDebugInfo();
			const secondCollabResult = collabSpaces[1].getReverseMapsDebugInfo();

			compareMaps(firstCollabResult.rowMap, secondCollabResult.rowMap);
			compareMaps(firstCollabResult.colMap, secondCollabResult.colMap);
		});

		it("Concurrent operations", async () => {
			const rows = 20;
			const cols = 7;
			const collabSpace = await initialize(rows, cols);

			for (let it = 0; it < 5; it++) {
				// Concurrent changes - clients do not see each other changes yet
				collabSpace.removeRows(1, 1);
				collabSpaces[1].insertRows(1, 4);
				collabSpace.insertCols(1, 1);
				collabSpaces[1].insertCols(1, 1);
				await provider.ensureSynchronized();

				const collabResult1 = collabSpace.getReverseMapsDebugInfo();
				const collabResult2 = collabSpaces[1].getReverseMapsDebugInfo();

				compareMaps(collabResult1.rowMap, collabResult2.rowMap);
				compareMaps(collabResult1.colMap, collabResult2.colMap);

				collabSpace.insertRows(1, 1);
				collabSpaces[1].removeRows(2, 1);
				collabSpace.removeCols(1, 1);
				collabSpaces[1].removeCols(1, 1);

				// synchronize - all containers should see exactly same changes
				await provider.ensureSynchronized();

				const collabResult3 = collabSpace.getReverseMapsDebugInfo();
				const collabResult4 = collabSpaces[1].getReverseMapsDebugInfo();

				compareMaps(collabResult3.rowMap, collabResult4.rowMap);
				compareMaps(collabResult3.colMap, collabResult4.colMap);
			}
		});
	});

	it("Basic test", async () => {
		// Cell we will be interrogating
		const rows = 20;
		const cols = 7;
		const row = 5;
		const col = 3;
		const collabSpace = await initialize(rows, cols);

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

		// implementation detail: due to op grouping and issue with same sequence numbers, we need
		// one more batch to ensure channel could be safely destroyed below (and test to validate it).
		sendNoop(collabSpace);
		await provider.ensureSynchronized();

		// Before channel has a chance to be saved or destroyed, let's load 3rd container from that state
		// and validate it can follow
		await addContainerInstance();

		// implementation detail: due to op grouping and issue with same sequence numbers, we need
		// one more batch to ensure channel could be safely destroyed below (and test to validate it).
		// Make some arbitrary change, but also test insertion flow.
		collabSpace.insertRows(rows, 1);
		await provider.ensureSynchronized();
		ensureSameSize();

		// Also let's grab channel in second container for later manipulations
		channel2 = (await collabSpaces[2].getCellChannel(row, col)) as ISharedCounter;

		await saveAndDestroyChannel(channel, collabSpace, row, col, initialValue);

		await waitForSummary();

		// Add one more container and observe they are all equal
		const cpLoaded = (await addContainerInstance()).collabSpace;
		await ensureSameValues(row, col, initialValue, [channel2]);

		const channelInfo = await cpLoaded.getCellDebugInfo(row, col);
		assert(channelInfo.channel === undefined, "channel was not removed from summary");

		// recreate deleted channel
		channel = (await collabSpace.getCellChannel(row, col)) as ISharedCounter;

		// After one container destroyed the channel (and 3rd container loaded without channel),
		// let's test that op showing up on that channel will be processed correctly by all containers.
		channel2.increment(10);
		initialValue += 10;
		await provider.ensureSynchronized();
		await ensureSameValues(row, col, initialValue, [channel, channel2]);

		await doFinalValidation();

		// Useful mostly if you debug and want measure column reading speed - read one column
		await measureReadSpeed(col, collabSpace);
	});

	it("Concurrent changes", async () => {
		// Cell we will be interrogating
		const row = 6;
		const col = 3;

		const collabSpace = await initialize(20, 7);

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

		// synchronize - all containers should see exactly same changes
		await provider.ensureSynchronized();
		await ensureSameValues(row, col, initialValue + 30, [channel2a, channel2b]);

		await doFinalValidation();
	});

	describe("Channel overwrite tests", () => {
		// Baseline for a number of tests (with different arguments)
		async function ChannelOverwrite(synchronize: boolean, loadSummarizer: boolean) {
			// Cell we will be interrogating
			const row = 7;
			const col = 3;

			const collabSpace = await initialize(20, 7);
			const collabSpace2 = collabSpaces[1];

			const channel2a = (await collabSpace.getCellChannel(row, col)) as ISharedCounter;

			// Make some changes on a channel
			let initialValue = channel2a.value;
			let overwriteValue = initialValue + 100;
			channel2a.increment(10);
			initialValue += 10;

			// We test vastly different scenario depending on if we wait or not.
			// If we do not wait, then we test concurrent changes in channel and overwrite
			// (and thus test what happens if ops arrive to not known to a client unrooted channel).
			// If we wait, then there is not concurrency at all.
			if (synchronize) {
				await provider.ensureSynchronized();
			}

			// Create undo for second container
			let undo2: IRevertible[] = [];
			collabSpace2.openUndo({
				pushToCurrentOperation(revertible: IRevertible) {
					undo2.push(revertible);
				},
			});

			// Overwrite it!
			collabSpace2.setCell(row, col, {
				value: overwriteValue,
				type: CounterFactory.Type,
			});

			// syncrhonize - all containers should see exactly same changes
			await provider.ensureSynchronized();
			await ensureSameValues(row, col, overwriteValue);

			assert(channel2a.value === initialValue, "No impact on unrooted channel");

			// Retrieve channel for same cell
			let channel2b = (await collabSpace.getCellChannel(row, col)) as ISharedCounter;
			let channel2c = (await collabSpace2.getCellChannel(row, col)) as ISharedCounter;
			await ensureSameValues(row, col, overwriteValue, [channel2b, channel2c]);

			channel2c.increment(10);
			overwriteValue += 10;
			await provider.ensureSynchronized();
			await ensureSameValues(row, col, overwriteValue, [channel2b, channel2c]);
			assert(channel2a.value === initialValue, "No impact on unrooted channel");

			// Force summary to test that channel is gone.
			if (loadSummarizer) {
				await waitForSummary();
			}

			await addContainerInstance();
			await ensureSameValues(row, col, overwriteValue, [channel2b, channel2c]);

			/**
			 * Undo all the changes from second container
			 * This includes only matrix changes, i.e. cell overwrite.
			 */
			const toUndo = undo2.reverse();
			undo2 = [];
			for (const record of toUndo) {
				record.revert();
			}
			await provider.ensureSynchronized();
			channel2b = (await collabSpace.getCellChannel(row, col)) as ISharedCounter;
			channel2c = (await collabSpace2.getCellChannel(row, col)) as ISharedCounter;
			await ensureSameValues(row, col, initialValue, [channel2b, channel2c]);

			await doFinalValidation();
		}

		it("Channel overwrite with syncronization", async () => {
			await ChannelOverwrite(true, false);
		});

		it("Channel overwrite with syncronization & summarizer", async () => {
			await ChannelOverwrite(true, true);
		});

		it("Channel overwrite without syncronization", async () => {
			await ChannelOverwrite(false, false);
		});

		it("Channel overwrite without syncronization & summarizer", async () => {
			await ChannelOverwrite(false, true);
		});
	});

	describe("Stress tests", () => {
		type Op = (cp: IMatrix) => Promise<unknown>;
		let commandArray: string[] = [];
		const debugCommandArray = false;
		beforeEach(() => {
			commandArray = [];
			seed = 1; // Every test is independent from another test!
		});

		const addCommandToArray = (command: string) => {
			if (debugCommandArray) {
				commandArray.push(command);
			}
		};
		// collaborate on a cell through collab channel
		const collabFn: Op = async (cp: IMatrix) => {
			// Cell might be undefined. If so, we can't really collab on it.
			// Do some number of iterations to find some cell to collab, otherwise bail out.
			for (let it = 0; it < 10; it++) {
				const row = randNotInclusive(cp.rowCount);
				const col = randNotInclusive(cp.colCount);
				const value = await cp.getCellAsync(row, col);
				if (value !== undefined) {
					const channel = (await cp.getCellChannel(row, col)) as ISharedCounter;
					channel.increment(rand(40));
					break;
				}
			}
		};

		// Overwrite cell value
		const overwriteCellFn: Op = async (cp: IMatrix) => {
			const row = randNotInclusive(cp.rowCount);
			const col = randNotInclusive(cp.colCount);
			const value = rand(100);
			addCommandToArray(`overwriteCell Row Count ${row} ${col} ${value}`);
			cp.setCell(row, col, {
				value,
				type: CounterFactory.Type,
			});
		};

		// write undefined into cell
		const overwriteCellUndefinedFn: Op = async (cp: IMatrix) => {
			addCommandToArray(`overwriteCellUndefined Row Count ${cp.rowCount} ${cp.colCount}`);
			const row = randNotInclusive(cp.rowCount);
			const col = randNotInclusive(cp.colCount);
			cp.setCell(row, col, undefined);
		};

		const addContainerInstanceFn: Op = async () => {
			await waitForSummary();
			await addContainerInstance();
		};

		const insertColsFn: Op = async (cp: IMatrix) => {
			const pos = rand(cp.colCount);
			const count = 1 + rand(3);
			cp.insertCols(pos, count);
			addCommandToArray(
				`insertColsFn post pos ${pos}, count ${count}, cp.colCount ${cp.colCount}`,
			);
		};

		const insertRowsFn: Op = async (cp: IMatrix) => {
			const pos = rand(cp.rowCount);
			const count = 1 + rand(3);
			cp.insertRows(pos, count);
			addCommandToArray(
				`insertRowsFn post pos ${pos}, count ${count}, cp.RowCount ${cp.rowCount}, cp.ColCount ${cp.colCount}`,
			);
		};

		const removeColsFn: Op = async (cp: IMatrix) => {
			const currCount = cp.colCount;
			const pos = randNotInclusive(currCount);
			// delete at most 1/3 of the matrix
			const del = Math.max(randNotInclusive(currCount - pos), Math.round(currCount / 3));
			cp.removeCols(pos, del);
			addCommandToArray(
				`removeColsFn post pos ${pos}, del ${del}, cp.RowCount ${cp.rowCount}, cp.ColCount ${cp.colCount}`,
			);
		};

		const removeRowsFn: Op = async (cp: IMatrix) => {
			const currCount = cp.rowCount;
			const pos = randNotInclusive(currCount);
			// delete at most 1/3 of the matrix
			const del = Math.max(randNotInclusive(currCount - pos), Math.round(currCount / 3));
			cp.removeRows(pos, del);
			addCommandToArray(
				`removeRowsFn post pos ${pos}, del ${del}, cp.RowCount ${cp.rowCount}, cp.ColCount ${cp.colCount}`,
			);
		};

		// collaborate on a cell through collab channel
		const findSomeChannelFn = async (cp: IMatrix) => {
			// Cell might be undefined. If so, we can't really collab on it.
			// Do some number of iterations to find some cell to collab, otherwise bail out.
			for (let it = 0; it < 10; it++) {
				const row = randNotInclusive(cp.rowCount);
				const col = randNotInclusive(cp.colCount);
				const value = await cp.getCellDebugInfo(row, col);
				if (value.channel !== undefined) {
					return value.channel;
				}
				return undefined;
			}
		};

		const saveChannelFn: Op = async (cp: IMatrix) => {
			const channel = await findSomeChannelFn(cp);
			addCommandToArray(`saveChannelFn  ${channel?.value}`);
			if (channel !== undefined) {
				cp.saveChannelState(channel);
			}
		};

		const destroyChannelFn: Op = async (cp: IMatrix) => {
			const channel = await findSomeChannelFn(cp);
			addCommandToArray(`destroyChannelFn  ${channel?.value}`);
			if (channel !== undefined) {
				cp.destroyCellChannel(channel);
			}
		};

		async function stressTest(
			totalSteps: number,
			rows: number,
			cols: number,
			operations: [number, Op][],
		) {
			await initialize(rows, cols);

			let priorityMax = 0;
			for (const [pri] of operations) {
				priorityMax += pri;
			}

			for (let step = 1; step <= totalSteps; step++) {
				// Do operations in accordance with their probabilities
				let opPriority = randNotInclusive(priorityMax);
				for (let index = 0; ; index++) {
					opPriority -= operations[index][0];
					if (opPriority < 0) {
						const op = operations[index][1];
						const cp = collabSpaces[randNotInclusive(collabSpaces.length)];
						await op(cp);
						break;
					}
				}
				assert(opPriority < 0, "logic error");
			}

			await doFinalValidation();
		}

		it("Editing stress test", async () => {
			await stressTest(100, 3, 3, [
				[100, collabFn],
				[20, overwriteCellFn],
				[10, overwriteCellUndefinedFn],
				[10, saveChannelFn],
				[5, addContainerInstanceFn],
				[5, destroyChannelFn],
			]);
		}).timeout(20000);

		it("Structure stress test", async () => {
			try {
				await stressTest(100, 20, 7, [
					[100, collabFn],
					[20, overwriteCellFn],
					[10, overwriteCellUndefinedFn],
					[20, insertColsFn],
					[20, insertRowsFn],
					[10, removeColsFn],
					[10, removeRowsFn],
					[10, saveChannelFn],
					[5, addContainerInstanceFn],
				]);
			} catch (e) {
				console.log("Error in stress test", e);
				for (const item of commandArray) {
					console.log(item);
				}
				throw e;
			}
		}).timeout(120000);

		// TBD(Pri0): This test does not pass
		// It tails on 229th step - one of the containers has a wrong value
		it.skip("Structure stress test 229", async () => {
			try {
				await stressTest(229, 20, 7, [
					[20, collabFn],
					[10, overwriteCellFn],
					[10, overwriteCellUndefinedFn],
					[20, insertColsFn],
					[20, insertRowsFn],
					[10, removeColsFn],
					[10, removeRowsFn],
					[10, saveChannelFn],
					[5, addContainerInstanceFn],
				]);
			} catch (e) {
				console.log("Structure in stress test", e);
				for (const item of commandArray) {
					console.log(item);
				}
				throw e;
			}
		}).timeout(240000);

		it("General Stress test", async () => {
			await stressTest(100, 20, 7, [
				[100, collabFn],
				[20, overwriteCellFn],
				[20, overwriteCellUndefinedFn],
				[10, insertColsFn],
				[10, insertRowsFn],
				[10, saveChannelFn],
				[10, destroyChannelFn],
				[5, removeColsFn],
				[5, removeRowsFn],
				[5, addContainerInstanceFn],
			]);
		}).timeout(10000);
	});
});

/* eslint-enable @typescript-eslint/no-non-null-assertion */
