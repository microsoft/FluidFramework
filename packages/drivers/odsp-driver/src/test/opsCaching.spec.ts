/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { TelemetryUTLogger } from "@fluidframework/telemetry-utils";
import { OpsCache, ICache, IMessage, CacheEntry } from "../opsCaching";

export type MyDataInput = IMessage & { data: string; };

async function delay(timeMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(() => resolve(), timeMs));
}

class MockCache implements ICache {
    public writeCount = 0;
    public opsWritten = 0;

    public async write(batchNumber: string, data: string) {
        this.writeCount++;
        this.data[batchNumber] = JSON.parse(data);
        for (const op of this.data[batchNumber] as CacheEntry) {
            // JSON.serialize converts undefined to null
            if (op !== null) {
                this.opsWritten++;
            }
        }
    }

    public async read(batchNumber: string) {
        const content = this.data[batchNumber];
        if (content === undefined) {
            return undefined;
        }
        return JSON.stringify(content);
    }

    public readonly data: { [key: string]: any; } = {};
}

async function validate(
    mockCache: MockCache,
    expected: { [key: number]: (MyDataInput | undefined)[]; },
    cache: OpsCache, initialSeq: number)
{
    assert.deepEqual(mockCache.data, JSON.parse(JSON.stringify(expected)));

    const expectedArr: MyDataInput[] = [];
    for (const values of Object.values(expected)) {
        for (const op of values) {
            if (op !== undefined) {
                expectedArr.push(op);
            }
        }
    }

    let result = await cache.get(initialSeq, undefined);
    assert.deepEqual(result, expectedArr);

    if (initialSeq >= 10) {
        result = await cache.get(0, 10);
        assert(result.length === 0);
    }

    // Asking for one too early should result in empty result, as hit miss should result in no ops.
    if (initialSeq > 0) {
        result = await cache.get(initialSeq - 1, undefined);
        assert(result.length === 0);
    }

    if (expectedArr.length > 0) {
        const last = expectedArr[expectedArr.length - 1].sequenceNumber;

        result = await cache.get(last, undefined);
        assert(result.length === 0);

        result = await cache.get(last + 10, undefined);
        assert(result.length === 0);

        result = await cache.get(initialSeq + 1, last);
        assert.deepEqual(result, expectedArr.slice(1, -1));

        result = await cache.get(initialSeq + 1, last + 100000);
        assert.deepEqual(result, expectedArr.slice(1));
    }
}

async function runTestNoTimer(
    batchSize: number,
    initialSeq: number,
    mockData: MyDataInput[],
    expected: { [key: number]: (MyDataInput | undefined)[] })
{
    const mockCache = new MockCache();

    const cache = new OpsCache(
        initialSeq,
        new TelemetryUTLogger(),
        mockCache,
        batchSize,
        -1, // timerGranularity
        5000, // totalOpsToCache
    );

    cache.addOps(mockData);

    // Validate that writing same ops is not going to change anything
    const writes = mockCache.writeCount;
    cache.addOps(mockData);
    assert.equal(writes, mockCache.writeCount);

    await validate(mockCache, expected, cache, initialSeq);
}

export async function runTestWithTimer(
    batchSize: number,
    initialSeq: number,
    mockData: MyDataInput[],
    expected: { [key: number]: (MyDataInput | undefined)[] },
    initialWritesExpected: number,
    totalWritesExpected: number)
{
    const mockCache = new MockCache();

    const cache = new OpsCache(
        initialSeq,
        new TelemetryUTLogger(),
        mockCache,
        batchSize,
        1, // timerGranularity
        5000, // totalOpsToCache
    );

    cache.addOps(mockData);
    assert.equal(mockCache.writeCount, initialWritesExpected);
    await validate(mockCache, expected, cache, initialSeq);

    while (mockCache.writeCount < totalWritesExpected) {
        await delay(1);
    }
    assert.equal(mockCache.writeCount, totalWritesExpected);
    assert.equal(mockCache.opsWritten, mockData.length);
}

export async function runTest(
    batchSize: number,
    initialSeq: number,
    mockData: MyDataInput[],
    expected: { [key: number]: (MyDataInput | undefined)[] },
    initialWritesExpected: number,
    totalWritesExpected: number)
{
    await runTestNoTimer(batchSize, initialSeq, mockData, expected);
    await runTestWithTimer(batchSize, initialSeq, mockData, expected, initialWritesExpected, totalWritesExpected);
}

describe("OpsCache write", () => {
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
        await runTest(10, 100, mockData1, {}, 0, 5);
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
                20: [
                undefined,
                { sequenceNumber: 101, data: "101" },
                { sequenceNumber: 102, data: "102" },
                { sequenceNumber: 103, data: "103" },
                { sequenceNumber: 104, data: "104" },
                ],
            },
            1,
            2);
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
            51: [
                { sequenceNumber: 102, data: "102" },
                { sequenceNumber: 103, data: "103" },
            ],
            },
            1,
            1);
    });

    it("with batch size of 1 all ops should commit in own batch", async () => {
        await runTest(
            1,
            101,
            mockData3,
            {
            102: [{ sequenceNumber: 102, data: "102" }],
            103: [{ sequenceNumber: 103, data: "103" }],
            },
            2,
            2);
    });
});
