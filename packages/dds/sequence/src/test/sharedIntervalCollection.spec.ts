/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
    MockContainerRuntime,
    MockContainerRuntimeFactory,
    MockContainerRuntimeFactoryForReconnection,
    MockContainerRuntimeForReconnection,
    MockFluidDataStoreRuntime,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { SharedIntervalCollection, SharedIntervalCollectionFactory } from "../sharedIntervalCollection";
import { Interval, IntervalCollection, IntervalType } from "../intervalCollection";

const assertIntervals = (
    intervalCollection: IntervalCollection<Interval>,
    expected: readonly { start: number; end: number; }[],
    validateOverlapping: boolean = true,
) => {
    const actual = Array.from(intervalCollection);
    if (validateOverlapping) {
        const overlapping = intervalCollection.findOverlappingIntervals(
            Number.NEGATIVE_INFINITY,
            Number.POSITIVE_INFINITY,
        );
        assert.deepEqual(actual, overlapping, "Interval search returned inconsistent results");
    }
    assert.strictEqual(actual.length, expected.length,
        `findOverlappingIntervals() must return the expected number of intervals`);

    const actualPos = actual.map((interval) => {
        assert(interval);
        return { start: interval.start, end: interval.end };
    });
    assert.deepEqual(actualPos, expected, "intervals are not as expected");
};

function createConnectedIntervalCollection(id: string, runtimeFactory: MockContainerRuntimeFactoryForReconnection): {
    intervals: SharedIntervalCollection;
    containerRuntime: MockContainerRuntimeForReconnection;
};
function createConnectedIntervalCollection(id: string, runtimeFactory: MockContainerRuntimeFactory): {
    intervals: SharedIntervalCollection;
    containerRuntime: MockContainerRuntime;
};
function createConnectedIntervalCollection(
    id: string,
    runtimeFactory: MockContainerRuntimeFactory | MockContainerRuntimeFactoryForReconnection,
) {
    const dataStoreRuntime = new MockFluidDataStoreRuntime();
    const intervals = new SharedIntervalCollection(id, dataStoreRuntime, SharedIntervalCollectionFactory.Attributes);
    const containerRuntime = runtimeFactory.createContainerRuntime(dataStoreRuntime);
    const services = {
        deltaConnection: containerRuntime.createDeltaConnection(),
        objectStorage: new MockStorage(undefined),
    };
    intervals.connect(services);
    intervals.initializeLocal();
    return { intervals, containerRuntime };
}

describe("SharedIntervalCollection", () => {
    describe("In a connected state", () => {
        let runtimeFactory: MockContainerRuntimeFactory;
        let intervals1: SharedIntervalCollection;
        let intervals2: SharedIntervalCollection;
        let collection1: IntervalCollection<Interval>;
        let collection2: IntervalCollection<Interval>;

        beforeEach(() => {
            runtimeFactory = new MockContainerRuntimeFactory();
            intervals1 = createConnectedIntervalCollection("collection 1", runtimeFactory).intervals;
            intervals2 = createConnectedIntervalCollection("collection 2", runtimeFactory).intervals;
            collection1 = intervals1.getIntervalCollection("test");
            collection2 = intervals2.getIntervalCollection("test");
        });

        it("Can add intervals from multiple clients", () => {
            collection1.add(0, 20, IntervalType.Simple);
            collection2.add(10, 30, IntervalType.Simple);
            assertIntervals(collection1, [{ start: 0, end: 20 }]);
            assertIntervals(collection2, [{ start: 10, end: 30 }]);
            assert.equal(Array.from(collection1.findOverlappingIntervals(1, 3)).length, 1);
            assert.equal(Array.from(collection2.findOverlappingIntervals(1, 3)).length, 0);
            assert.equal(Array.from(collection1.findOverlappingIntervals(1, 19)).length, 1);
            assert.equal(Array.from(collection2.findOverlappingIntervals(1, 19)).length, 1);

            runtimeFactory.processAllMessages();
            const expected = [{ start: 0, end: 20 }, { start: 10, end: 30 }];
            assertIntervals(collection1, expected);
            assertIntervals(collection2, expected);
            assert.equal(Array.from(collection1.findOverlappingIntervals(1, 3)).length, 1);
            assert.equal(Array.from(collection2.findOverlappingIntervals(1, 3)).length, 1);
            assert.equal(Array.from(collection1.findOverlappingIntervals(1, 19)).length, 2);
            assert.equal(Array.from(collection2.findOverlappingIntervals(1, 19)).length, 2);
        });

        it("Can remove intervals that were added", () => {
            const interval = collection1.add(0, 20, IntervalType.Simple);
            collection2.add(10, 30, IntervalType.Simple);
            runtimeFactory.processAllMessages();

            const id = interval.getIntervalId() ?? assert.fail("expected interval to have id");
            collection1.removeIntervalById(id);
            assertIntervals(collection1, [{ start: 10, end: 30 }]);
            assertIntervals(collection2, [{ start: 0, end: 20 }, { start: 10, end: 30 }]);

            runtimeFactory.processAllMessages();
            assertIntervals(collection1, [{ start: 10, end: 30 }]);
            assertIntervals(collection2, [{ start: 10, end: 30 }]);
        });

        it("Can change intervals", () => {
            const interval = collection1.add(0, 20, IntervalType.Simple);
            collection2.add(10, 30, IntervalType.Simple);
            runtimeFactory.processAllMessages();

            const id = interval.getIntervalId() ?? assert.fail("expected interval to have id");
            collection1.change(id, 10);
            assertIntervals(collection1, [{ start: 10, end: 20 }, { start: 10, end: 30 }]);
            assertIntervals(collection2, [{ start: 0, end: 20 }, { start: 10, end: 30 }]);

            runtimeFactory.processAllMessages();
            assertIntervals(collection1, [{ start: 10, end: 20 }, { start: 10, end: 30 }]);
            assertIntervals(collection2, [{ start: 10, end: 20 }, { start: 10, end: 30 }]);
        });
    });

    describe("on reconnect", () => {
        let runtimeFactory: MockContainerRuntimeFactoryForReconnection;
        let intervals1: SharedIntervalCollection;
        let intervals2: SharedIntervalCollection;
        let runtime1: MockContainerRuntimeForReconnection;
        let collection1: IntervalCollection<Interval>;
        let collection2: IntervalCollection<Interval>;

        beforeEach(() => {
            runtimeFactory = new MockContainerRuntimeFactoryForReconnection();
            const client1 = createConnectedIntervalCollection("collection 1", runtimeFactory);
            runtime1 = client1.containerRuntime;
            intervals1 = client1.intervals;
            intervals2 = createConnectedIntervalCollection("collection 2", runtimeFactory).intervals;
            collection1 = intervals1.getIntervalCollection("test");
            collection2 = intervals2.getIntervalCollection("test");
        });

        it("can rebase add ops", () => {
            runtime1.connected = false;
            collection1.add(15, 17, IntervalType.Simple);
            runtimeFactory.processAllMessages();

            assertIntervals(collection1, [{ start: 15, end: 17 }]);
            assertIntervals(collection2, []);

            runtime1.connected = true;
            runtimeFactory.processAllMessages();

            assertIntervals(collection1, [{ start: 15, end: 17 }]);
            assertIntervals(collection2, [{ start: 15, end: 17 }]);
        });
    });
});
