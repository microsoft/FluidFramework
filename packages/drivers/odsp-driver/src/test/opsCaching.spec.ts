/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { delay } from "@fluidframework/core-utils/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import { IStream } from "@fluidframework/driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";

import { OdspDeltaStorageWithCache } from "../odspDeltaStorageService.js";
import { OdspDocumentStorageService } from "../odspDocumentStorageManager.js";
import { CacheEntry, ICache, IMessage, OpsCache } from "../opsCaching.js";

export type MyDataInput = IMessage & { data: string };

class MockCache implements ICache {
	public writeCount = 0;
	public opsWritten = 0;

	public async write(batchNumber: string, data: string): Promise<void> {
		this.writeCount++;
		this.data[batchNumber] = JSON.parse(data);
		for (const op of this.data[batchNumber] as CacheEntry) {
			// JSON.serialize converts undefined to null
			if (op !== null) {
				this.opsWritten++;
			}
		}
	}

	public async read(batchNumber: string): Promise<string | undefined> {
		const content = this.data[batchNumber];
		if (content === undefined) {
			return undefined;
		}
		return JSON.stringify(content);
	}

	public remove(): void {
		// Do not reset this.writeCount such that we can test that writes happened, but later on data was cleared
		this.writeCount++;
		this.opsWritten++;
		this.data = {};
	}

	public data: { [key: string]: unknown } = {};
}

async function validate(
	mockCache: MockCache,
	expected: { [key: number]: (MyDataInput | undefined)[] },
	cache: OpsCache,
	initialSeq: number,
): Promise<void> {
	assert.deepEqual(mockCache.data, JSON.parse(JSON.stringify(expected)));

	const expectedArr: MyDataInput[] = [];
	for (const values of Object.values(expected)) {
		for (const op of values) {
			if (op !== undefined) {
				expectedArr.push(op);
			}
		}
	}

	let result = await cache.get(initialSeq + 1, undefined);
	assert.deepEqual(result, expectedArr);

	if (initialSeq >= 10) {
		result = await cache.get(1, 10);
		assert(result.length === 0);
	}

	// Asking for one too early should result in empty result, as hit miss should result in no ops.
	if (initialSeq > 0) {
		result = await cache.get(initialSeq, undefined);
		assert(result.length === 0);
	}

	if (expectedArr.length > 0) {
		const last = expectedArr[expectedArr.length - 1].sequenceNumber + 1;

		result = await cache.get(last, undefined);
		assert(result.length === 0);

		result = await cache.get(last + 10, undefined);
		assert(result.length === 0);

		result = await cache.get(initialSeq + 2, last);
		assert.deepEqual(result, expectedArr.slice(1));

		result = await cache.get(initialSeq + 2, last + 100000);
		assert.deepEqual(result, expectedArr.slice(1));

		result = await cache.get(initialSeq + 2, last - 1);
		assert.deepEqual(result, expectedArr.slice(1, -1));
	}
}

async function runTestNoTimer(
	batchSize: number,
	initialSeq: number,
	mockData: MyDataInput[],
	expected: { [key: number]: (MyDataInput | undefined)[] },
	initialWritesExpected: number,
	totalOpsWritten?: number,
): Promise<void> {
	const mockCache = new MockCache();
	const logger = new MockLogger();
	const cache = new OpsCache(
		initialSeq,
		logger.toTelemetryLogger(),
		mockCache,
		batchSize,
		-1, // timerGranularity
		10, // totalOpsToCache
	);

	cache.addOps(mockData);

	const writes = mockCache.writeCount;
	assert.equal(writes, initialWritesExpected, "initialWrites should match");

	// Validate that writing same ops is not going to change anything
	cache.addOps(mockData);
	assert.equal(writes, mockCache.writeCount);

	await validate(mockCache, expected, cache, initialSeq);

	// ensure all ops are flushed properly
	cache.flushOps();
	assert.equal(mockCache.opsWritten, totalOpsWritten ?? mockData.length);

	// ensure adding same ops and flushing again is doing nothing
	cache.addOps(mockData);
	cache.flushOps();
	assert.equal(
		mockCache.opsWritten,
		totalOpsWritten ?? mockData.length,
		"ops written does not match",
	);
	logger.assertMatchNone([{ category: "error" }]);
}

export async function runTestWithTimer(
	batchSize: number,
	initialSeq: number,
	mockData: MyDataInput[],
	expected: { [key: number]: (MyDataInput | undefined)[] },
	initialWritesExpected: number,
	totalWritesExpected: number,
	totalOpsWritten?: number,
): Promise<void> {
	const mockCache = new MockCache();
	const logger = new MockLogger();
	const cache = new OpsCache(
		initialSeq,
		logger.toTelemetryLogger(),
		mockCache,
		batchSize,
		1, // timerGranularity
		10, // totalOpsToCache
	);

	cache.addOps(mockData);
	assert.equal(mockCache.writeCount, initialWritesExpected);
	await validate(mockCache, expected, cache, initialSeq);

	while (mockCache.writeCount < totalWritesExpected) {
		await delay(1);
	}
	assert.equal(mockCache.writeCount, totalWritesExpected);
	assert.equal(mockCache.opsWritten, totalOpsWritten ?? mockData.length);
	logger.assertMatchNone([{ category: "error" }]);
}

export async function runTest(
	batchSize: number,
	initialSeq: number,
	mockData: MyDataInput[],
	expected: { [key: string]: (MyDataInput | undefined)[] },
	initialWritesExpected: number,
	totalWritesExpected: number,
	totalOpsWritten?: number,
): Promise<void> {
	await runTestNoTimer(
		batchSize,
		initialSeq,
		mockData,
		expected,
		initialWritesExpected,
		totalOpsWritten,
	);
	await runTestWithTimer(
		batchSize,
		initialSeq,
		mockData,
		expected,
		initialWritesExpected,
		totalWritesExpected,
		totalOpsWritten,
	);
}

describe("OpsCache", () => {
	const mockData1: MyDataInput[] = [
		{ sequenceNumber: 105, data: "105" },
		{ sequenceNumber: 110, data: "110" },
		{ sequenceNumber: 115, data: "115" },
		{ sequenceNumber: 120, data: "120" },
		{ sequenceNumber: 125, data: "125" },
		{ sequenceNumber: 130, data: "130" },
		{ sequenceNumber: 135, data: "135" },
		{ sequenceNumber: 140, data: "140" },
		{ sequenceNumber: 145, data: "140" },
	];

	it("1 element in each batch of 5 should not commit", async () => {
		await runTest(5, 100, mockData1, {}, 0, 9);
	});

	it("2 element in each batch of 10 should not commit", async () => {
		await runTest(10, 100, mockData1, {}, 0, 4, 8);
	});

	it("6 sequential elements with batch of 5 should commit 1 batch", async () => {
		await runTest(
			5,
			100,
			[
				{ sequenceNumber: 101, data: "101" },
				{ sequenceNumber: 102, data: "102" },
				{ sequenceNumber: 103, data: "103" },
				{ sequenceNumber: 104, data: "104" },
				{ sequenceNumber: 105, data: "105" },
			],
			{
				"5_20": [
					undefined,
					{ sequenceNumber: 101, data: "101" },
					{ sequenceNumber: 102, data: "102" },
					{ sequenceNumber: 103, data: "103" },
					{ sequenceNumber: 104, data: "104" },
				],
			},
			1,
			2,
		);
	});

	it("Epmty ops at beginning and end of batch should cause the batch to not be cached", async () => {
		await runTest(
			5,
			100,
			[
				{ sequenceNumber: 101, data: "101" },
				{ sequenceNumber: 102, data: "102" },
				{ sequenceNumber: 103, data: "103" },
			],
			{},
			0,
			0,
			0,
		);
	});

	it("Epmty ops at just the beginning should still cause the batch to be cached", async () => {
		await runTest(
			5,
			100,
			[
				{ sequenceNumber: 101, data: "101" },
				{ sequenceNumber: 102, data: "102" },
				{ sequenceNumber: 103, data: "103" },
				{ sequenceNumber: 104, data: "104" },
			],
			{
				"5_20": [
					undefined,
					{ sequenceNumber: 101, data: "101" },
					{ sequenceNumber: 102, data: "102" },
					{ sequenceNumber: 103, data: "103" },
					{ sequenceNumber: 104, data: "104" },
				],
			},
			1,
			1,
			4,
		);
	});

	const mockData3: MyDataInput[] = [
		{ sequenceNumber: 102, data: "102" },
		{ sequenceNumber: 103, data: "103" },
	];

	it("3 sequential elements with batch of 2 and offset of 1 should commit 2 batches", async () => {
		await runTest(
			2,
			101,
			mockData3,
			{
				"2_51": [
					{ sequenceNumber: 102, data: "102" },
					{ sequenceNumber: 103, data: "103" },
				],
			},
			1,
			1,
		);
	});

	it("with batch size of 1 all ops should commit in own batch", async () => {
		await runTest(
			1,
			101,
			mockData3,
			{
				"1_102": [{ sequenceNumber: 102, data: "102" }],
				"1_103": [{ sequenceNumber: 103, data: "103" }],
			},
			2,
			2,
		);
	});

	it("Too many ops", async () => {
		await runTest(
			5,
			100,
			[
				{ sequenceNumber: 105, data: "105" },
				{ sequenceNumber: 106, data: "106" },
				{ sequenceNumber: 107, data: "107" },
				{ sequenceNumber: 108, data: "108" },
				{ sequenceNumber: 109, data: "109" },
				{ sequenceNumber: 110, data: "110" },
				{ sequenceNumber: 111, data: "111" },
				{ sequenceNumber: 112, data: "112" },
				{ sequenceNumber: 113, data: "113" },
				{ sequenceNumber: 114, data: "114" },
				{ sequenceNumber: 115, data: "115" },
			],
			{},
			3,
			3,
		);
	});

	it("Gap in ops", async () => {
		const mockCache = new MockCache();
		const initialSeq = 100;

		const mockData: MyDataInput[] = [
			{ sequenceNumber: 101, data: "101" },
			{ sequenceNumber: 102, data: "102" },
			{ sequenceNumber: 103, data: "103" },
			{ sequenceNumber: 104, data: "104" },
			{ sequenceNumber: 105, data: "105" },
			{ sequenceNumber: 106, data: "106" },
			// Gap:
			// { sequenceNumber: 107, data: "107" },
			{ sequenceNumber: 108, data: "108" },
			{ sequenceNumber: 109, data: "109" },
			// Start a new butch - that's where we had bug!
			{ sequenceNumber: 110, data: "110" },
			{ sequenceNumber: 111, data: "111" },
		];
		const logger = new MockLogger();
		const cache = new OpsCache(
			initialSeq,
			logger.toTelemetryLogger(),
			mockCache,
			5 /* batchSize */,
			-1, // timerGranularity
			100, // totalOpsToCache
		);

		cache.addOps(mockData);
		cache.flushOps();

		const result = await cache.get(initialSeq + 1, undefined);
		assert.deepEqual(result, [
			{ sequenceNumber: 101, data: "101" },
			{ sequenceNumber: 102, data: "102" },
			{ sequenceNumber: 103, data: "103" },
			{ sequenceNumber: 104, data: "104" },
			{ sequenceNumber: 105, data: "105" },
			{ sequenceNumber: 106, data: "106" },
		]);
		logger.assertMatchNone([{ category: "error" }]);
	});
});

describe("OdspDeltaStorageWithCache", () => {
	async function readAll(
		stream: IStream<ISequencedDocumentMessage[]>,
	): Promise<ISequencedDocumentMessage[]> {
		const ops: ISequencedDocumentMessage[] = [];
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const result = await stream.read();
			if (result.done) {
				break;
			}
			ops.push(...result.value);
		}
		return ops;
	}

	function createOps(fromArg: number, length: number): ISequencedDocumentMessage[] {
		const ops: ISequencedDocumentMessage[] = [];
		let from = fromArg;
		const to = from + length;
		while (from < to) {
			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			ops.push({ sequenceNumber: from } as ISequencedDocumentMessage);
			from++;
		}
		return ops;
	}

	function filterOps(
		ops: ISequencedDocumentMessage[],
		from: number,
		to: number,
	): ISequencedDocumentMessage[] {
		return ops.filter((op) => op.sequenceNumber >= from && op.sequenceNumber < to);
	}

	function validateOps(ops: ISequencedDocumentMessage[], from: number, to: number): void {
		if (to < from) {
			assert(ops.length === 0);
		} else {
			assert(ops.length === to - from);
			assert(ops.length === 0 || ops[0].sequenceNumber === from);
			assert(ops.length === 0 || ops[ops.length - 1].sequenceNumber === to - 1);
		}
	}

	async function testStorage(
		fromTotal: number,
		toTotal: number | undefined,
		cacheOnly: boolean,
		opsFromSnapshot: number,
		opsFromCache: number,
		opsFromStorage: number,
		concurrency = 1,
		batchSize = 100,
	): Promise<void> {
		const snapshotOps = createOps(fromTotal, opsFromSnapshot);
		const cachedOps = createOps(fromTotal + opsFromSnapshot, opsFromCache);
		const storageOps = createOps(fromTotal + opsFromSnapshot + opsFromCache, opsFromStorage);

		let totalOps = opsFromSnapshot + opsFromCache + (cacheOnly ? 0 : opsFromStorage);
		const actualTo = toTotal ?? fromTotal + totalOps;
		assert(actualTo <= fromTotal + totalOps); // code will deadlock if that's not the case
		const askingOps = actualTo - fromTotal;
		totalOps = Math.min(totalOps, askingOps);

		let opsToCache: ISequencedDocumentMessage[] = [];
		const logger = new MockLogger();
		const storage = new OdspDeltaStorageWithCache(
			snapshotOps,
			logger.toTelemetryLogger(),
			batchSize,
			concurrency,
			// getFromStorage
			async (from: number, to: number) => {
				return { messages: filterOps(storageOps, from, to), partialResult: false };
			},
			// getCached
			async (from: number, to: number) => filterOps(cachedOps, from, to),
			// requestFromSocket
			(from: number, to: number) => {},
			// opsReceived
			(ops: ISequencedDocumentMessage[]) => opsToCache.push(...ops),
			() => ({ isFirstSnapshotFromNetwork: false }) as unknown as OdspDocumentStorageService,
		);

		const stream = storage.fetchMessages(
			fromTotal,
			toTotal,
			undefined, // abortSignal
			cacheOnly,
		);

		const opsAll = await readAll(stream);

		validateOps(opsAll, fromTotal, fromTotal + totalOps);
		if (cacheOnly) {
			assert(opsToCache.length === 0);
		} else {
			opsToCache = opsToCache.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
			validateOps(
				opsToCache,
				fromTotal + opsFromSnapshot + opsFromCache,
				fromTotal + totalOps,
			);
		}
		logger.assertMatchNone([{ category: "error" }]);
	}

	it("basic permutations", async () => {
		await testStorage(105, undefined, false, 0, 0, 0);
		await testStorage(105, undefined, false, 110, 0, 0);
		await testStorage(105, undefined, false, 110, 245, 0);
		await testStorage(105, undefined, false, 110, 245, 1000);
		await testStorage(105, undefined, false, 110, 9001, 8002);

		await testStorage(105, undefined, false, 0, 245, 0);
		await testStorage(105, undefined, false, 0, 9000, 0);
		await testStorage(105, undefined, false, 0, 245, 150);

		await testStorage(105, undefined, false, 110, 0, 150);
		await testStorage(105, undefined, false, 0, 0, 150);
	});

	it("cached", async () => {
		await testStorage(105, undefined, true, 0, 0, 0);
		await testStorage(105, undefined, true, 110, 0, 0);
		await testStorage(105, undefined, true, 110, 245, 0);
		await testStorage(105, undefined, true, 1001, 8001, 0);
		await testStorage(105, undefined, true, 110, 245, 1000);

		await testStorage(105, undefined, true, 0, 245, 0);
		await testStorage(105, undefined, true, 0, 245, 150);

		await testStorage(105, undefined, true, 110, 0, 150);
		await testStorage(105, undefined, true, 0, 0, 150);
	});

	it("fixed to", async () => {
		await testStorage(105, 105 + 110, false, 110, 0, 0);
		await testStorage(105, 105 + 110 + 245, false, 110, 245, 0);
		await testStorage(105, 105 + 110 + 245 + 500, false, 110, 245, 1000);

		await testStorage(105, 105 + 245 + 150, false, 0, 245, 150);

		await testStorage(105, 105 + 110 + 150, false, 110, 0, 150);
		await testStorage(105, 105 + 140, false, 0, 0, 150);
	});

	it("concurency", async () => {
		await testStorage(105, undefined, false, 0, 0, 0, 2);
		await testStorage(105, undefined, false, 110, 0, 0, 2);
		await testStorage(105, undefined, false, 110, 245, 0, 2);
		await testStorage(105, undefined, false, 110, 245, 1000, 2);
		await testStorage(105, undefined, false, 110, 9001, 8002, 2);

		await testStorage(105, undefined, false, 0, 245, 0, 2);
		await testStorage(105, undefined, false, 0, 9000, 0, 2);
		await testStorage(105, undefined, false, 0, 245, 150, 2);

		await testStorage(105, undefined, false, 110, 0, 150, 2);
		await testStorage(105, undefined, false, 0, 0, 150, 2);
	});
});
