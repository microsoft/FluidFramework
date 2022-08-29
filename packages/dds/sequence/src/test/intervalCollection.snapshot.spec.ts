/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { ReferenceType } from "@fluidframework/merge-tree";
import {
    MockFluidDataStoreRuntime,
    MockContainerRuntimeFactory,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { SharedString } from "../sharedString";
import { SharedStringFactory } from "../sequenceFactory";
import { IntervalCollection, intervalLocatorFromEndpoint, IntervalType, SequenceInterval } from "../intervalCollection";

const assertIntervals = (
    sharedString: SharedString,
    intervalCollection: IntervalCollection<SequenceInterval>,
    expected: readonly { start: number; end: number; }[],
    validateOverlapping: boolean = true,
) => {
    const actual = Array.from(intervalCollection);
    if (validateOverlapping && sharedString.getLength() > 0) {
        const overlapping = intervalCollection.findOverlappingIntervals(0, sharedString.getLength() - 1);
        assert.deepEqual(actual, overlapping, "Interval search returned inconsistent results");
    }
    assert.strictEqual(actual.length, expected.length,
        `findOverlappingIntervals() must return the expected number of intervals`);

    const actualPos = actual.map((interval) => {
        assert(interval);
        const start = sharedString.localReferencePositionToPosition(interval.start);
        const end = sharedString.localReferencePositionToPosition(interval.end);
        return { start, end };
    });
    assert.deepEqual(actualPos, expected, "intervals are not as expected");
};

async function loadSharedString(
    containerRuntimeFactory: MockContainerRuntimeFactory,
    id: string,
    summary: ISummaryTree,
): Promise<SharedString> {
    const dataStoreRuntime = new MockFluidDataStoreRuntime();
    const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
    dataStoreRuntime.deltaManager.lastSequenceNumber = containerRuntimeFactory.sequenceNumber;
    const services = {
        deltaConnection: containerRuntime.createDeltaConnection(),
        objectStorage: MockStorage.createFromSummary(summary),
    };
    const sharedString = new SharedString(dataStoreRuntime, id, SharedStringFactory.Attributes);
    await sharedString.load(services);
    await sharedString.loaded;
    return sharedString;
}

async function getSingleIntervalSummary(): Promise<{ summary: ISummaryTree; seq: number; }> {
    const containerRuntimeFactory = new MockContainerRuntimeFactory();
    const dataStoreRuntime = new MockFluidDataStoreRuntime();
    dataStoreRuntime.local = false;
    const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
    const services = {
        deltaConnection: containerRuntime1.createDeltaConnection(),
        objectStorage: new MockStorage(),
    };
    const sharedString = new SharedString(dataStoreRuntime, "", SharedStringFactory.Attributes);
    sharedString.initializeLocal();
    sharedString.connect(services);
    sharedString.insertText(0, "ABCDEF");
    const collection = sharedString.getIntervalCollection("test");
    collection.add(0, 2, IntervalType.SlideOnRemove);
    containerRuntimeFactory.processAllMessages();
    const { summary } = await sharedString.summarize();
    return { summary, seq: containerRuntimeFactory.sequenceNumber };
}

describe("IntervalCollection snapshotting", () => {
    let summary: ISummaryTree;
    let seq: number;
    before(async () => {
        ({ summary, seq } = await getSingleIntervalSummary());
    });

    let containerRuntimeFactory: MockContainerRuntimeFactory;
    beforeEach(() => {
        containerRuntimeFactory = new MockContainerRuntimeFactory();
        containerRuntimeFactory.sequenceNumber = seq;
    });

    it("creates the correct reference type on reload", async () => {
        // This is a direct regression test for an issue with interval collection deserialization logic.
        // It manifested in later failures demonstrated by the "enable operations on reload" suite.
        const sharedString = await loadSharedString(containerRuntimeFactory, "1", summary);
        const collection = sharedString.getIntervalCollection("test");
        const intervals = Array.from(collection);
        assert.equal(intervals.length, 1);
        const interval = intervals[0] ?? assert.fail();
        /* eslint-disable no-bitwise */
        assert(interval.start.refType === (ReferenceType.RangeBegin | ReferenceType.SlideOnRemove));
        assert(interval.end.refType === (ReferenceType.RangeEnd | ReferenceType.SlideOnRemove));
        /* eslint-enable no-bitwise */
    });

    describe("enables operations on reload", () => {
        let sharedString: SharedString;
        let sharedString2: SharedString;
        let collection: IntervalCollection<SequenceInterval>;
        let collection2: IntervalCollection<SequenceInterval>;
        let id: string;
        beforeEach(async () => {
            sharedString = await loadSharedString(containerRuntimeFactory, "1", summary);
            sharedString2 = await loadSharedString(containerRuntimeFactory, "2", summary);
            containerRuntimeFactory.processAllMessages();
            collection = sharedString.getIntervalCollection("test");
            collection2 = sharedString2.getIntervalCollection("test");
            containerRuntimeFactory.processAllMessages();
            const intervals = Array.from(collection);
            assert.equal(intervals.length, 1);
            const interval = intervals[0] ?? assert.fail("collection should have interval");
            id = interval.getIntervalId() ?? assert.fail("interval should have id");
        });

        it("reloaded interval can be changed", async () => {
            collection.change(id, 1, 3);
            assertIntervals(sharedString, collection, [{ start: 1, end: 3 }]);
            assertIntervals(sharedString2, collection2, [{ start: 0, end: 2 }]);
            containerRuntimeFactory.processAllMessages();
            assertIntervals(sharedString2, collection2, [{ start: 1, end: 3 }]);
        });

        it("reloaded interval can be deleted", async () => {
            collection.removeIntervalById(id);
            assert.equal(Array.from(collection).length, 0);
            assert.equal(Array.from(collection2).length, 1);
            containerRuntimeFactory.processAllMessages();
            assert.equal(Array.from(collection2).length, 0);
        });

        it("new interval can be added after reload", async () => {
            collection.add(2, 4, IntervalType.SlideOnRemove);
            assertIntervals(sharedString, collection, [{ start: 0, end: 2 }, { start: 2, end: 4 }]);
            assertIntervals(sharedString2, collection2, [{ start: 0, end: 2 }]);
            containerRuntimeFactory.processAllMessages();
            assertIntervals(sharedString2, collection2, [{ start: 0, end: 2 }, { start: 2, end: 4 }]);
        });

        it("intervals can be retrieved from endpoints", async () => {
            const interval1 = collection.getIntervalById(id) ?? assert.fail("collection should have interval");
            const locator1 = intervalLocatorFromEndpoint(interval1.start);
            assert.deepEqual(locator1, { interval: interval1, label: "test" });
            const interval2 = collection.add(1, 2, IntervalType.SlideOnRemove);
            const locator2 = intervalLocatorFromEndpoint(interval2.start);
            assert.deepEqual(locator2, { interval: interval2, label: "test" });
        });
    });
});
