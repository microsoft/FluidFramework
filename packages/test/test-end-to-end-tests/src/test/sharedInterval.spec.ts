/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidHandle, IFluidLoadable } from "@fluidframework/core-interfaces";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import { DetachedReferencePosition, PropertySet } from "@fluidframework/merge-tree";
import { ISummaryBlob } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    IntervalCollection,
    IntervalType,
    SequenceInterval,
    SharedString,
    ISerializedIntervalCollectionV2,
} from "@fluidframework/sequence";
import {
    ITestObjectProvider,
    ITestContainerConfig,
    DataObjectFactoryType,
    ITestFluidObject,
    ChannelFactoryRegistry,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { TypedEventEmitter } from "@fluidframework/common-utils";

const assertIntervalsHelper = (
    sharedString: SharedString,
    intervalView: IntervalCollection<SequenceInterval>,
    expected: readonly { start: number; end: number; }[],
) => {
    let actual = intervalView.findOverlappingIntervals(0, sharedString.getLength() - 1);
    if (sharedString.getLength() === 0) {
        actual = Array.from(intervalView);
    }
    assert.strictEqual(actual.length, expected.length,
        `findOverlappingIntervals() must return the expected number of intervals`);

    for (const actualInterval of actual) {
        const start = sharedString.localReferencePositionToPosition(actualInterval.start);
        const end = sharedString.localReferencePositionToPosition(actualInterval.end);
        let found = false;

        // console.log(`[${start},${end}): ${sharedString.getText().slice(start, end)}`);

        for (const expectedInterval of expected) {
            if (expectedInterval.start === start && expectedInterval.end === end) {
                found = true;
                break;
            }
        }

        assert(found, `Unexpected interval [${start}..${end}) (expected ${JSON.stringify(expected)})`);
    }
};

function testIntervalOperations(intervalCollection: IntervalCollection<SequenceInterval>) {
    const intervalArray: SequenceInterval[] = [];
    let interval: SequenceInterval;
    let id;

    intervalArray[0] = intervalCollection.add(0, 0, IntervalType.SlideOnRemove);
    intervalArray[1] = intervalCollection.add(0, 0, IntervalType.SlideOnRemove);
    assert.notStrictEqual(intervalArray[0], intervalArray[1], "Unique intervals not added");

    id = intervalArray[0].getIntervalId();
    assert.notStrictEqual(id, undefined, "ID not created");

    intervalCollection.removeIntervalById(id);
    interval = intervalCollection.getIntervalById(id);
    assert.strictEqual(interval, undefined, "Interval not removed");

    id = intervalArray[1].getIntervalId();
    assert.notStrictEqual(id, undefined, "ID not created");
    interval = intervalCollection.getIntervalById(id);
    assert.notStrictEqual(interval, undefined, "Wrong interval removed?");

    intervalCollection.removeIntervalById(id);
    interval = intervalCollection.getIntervalById(id);
    assert.strictEqual(interval, undefined, "Interval not removed");

    intervalArray[0] = intervalCollection.add(0, 0, IntervalType.SlideOnRemove);
    intervalArray[1] = intervalCollection.add(0, 1, IntervalType.SlideOnRemove);
    intervalArray[2] = intervalCollection.add(0, 2, IntervalType.SlideOnRemove);
    intervalArray[3] = intervalCollection.add(1, 0, IntervalType.SlideOnRemove);
    intervalArray[4] = intervalCollection.add(1, 1, IntervalType.SlideOnRemove);
    intervalArray[5] = intervalCollection.add(1, 2, IntervalType.SlideOnRemove);
    intervalArray[6] = intervalCollection.add(2, 0, IntervalType.SlideOnRemove);
    intervalArray[7] = intervalCollection.add(2, 1, IntervalType.SlideOnRemove);
    intervalArray[8] = intervalCollection.add(2, 2, IntervalType.SlideOnRemove);

    let i: number;
    let result;
    let tempArray: SequenceInterval[] = [];
    let iterator = intervalCollection.CreateForwardIteratorWithStartPosition(1);
    tempArray[0] = intervalArray[3];
    tempArray[1] = intervalArray[4];
    tempArray[2] = intervalArray[5];
    for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
        interval = result.value;
        assert.strictEqual(interval, tempArray[i], "Mismatch in forward iteration with start position");
    }
    assert.strictEqual(i, tempArray.length, "Interval omitted from forward iteration with start position");

    iterator = intervalCollection.CreateForwardIteratorWithEndPosition(2);
    tempArray = [];
    tempArray[0] = intervalArray[2];
    tempArray[1] = intervalArray[5];
    tempArray[2] = intervalArray[8];
    for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
        interval = result.value;
        assert.strictEqual(interval, tempArray[i], "Mismatch in forward iteration with start position");
    }
    assert.strictEqual(i, tempArray.length, "Interval omitted from forward iteration with start position");

    iterator = intervalCollection.CreateBackwardIteratorWithStartPosition(0);
    tempArray = [];
    tempArray[0] = intervalArray[2];
    tempArray[1] = intervalArray[1];
    tempArray[2] = intervalArray[0];
    for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
        interval = result.value;
        assert.strictEqual(interval, tempArray[i], "Mismatch in backward iteration with start position");
    }
    assert.strictEqual(i, tempArray.length, "Interval omitted from backward iteration with start position");

    iterator = intervalCollection.CreateForwardIteratorWithEndPosition(2);
    tempArray = [];
    tempArray[0] = intervalArray[2];
    tempArray[1] = intervalArray[5];
    tempArray[2] = intervalArray[8];
    for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
        interval = result.value;
        assert.strictEqual(interval, tempArray[i], "Mismatch in forward iteration with end position");
    }
    assert.strictEqual(i, tempArray.length, "Interval omitted from forward iteration with end position");

    iterator = intervalCollection.CreateBackwardIteratorWithEndPosition(1);
    tempArray = [];
    tempArray[0] = intervalArray[7];
    tempArray[1] = intervalArray[4];
    tempArray[2] = intervalArray[1];
    for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
        interval = result.value;
        assert.strictEqual(interval, tempArray[i], "Mismatch in backward iteration with end position");
    }
    assert.strictEqual(i, tempArray.length, "Interval omitted from backward iteration with end position");

    iterator = intervalCollection.CreateForwardIteratorWithStartPosition(-1);
    for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
        assert(false, "Iterator with OOB position should not produce a result");
    }

    iterator = intervalCollection.CreateForwardIteratorWithEndPosition(99999);
    for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
        assert(false, "Iterator with OOB position should not produce a result");
    }

    iterator = intervalCollection.CreateForwardIteratorWithStartPosition(-1);
    for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
        assert(false, "Iterator with OOB position should not produce a result");
    }

    iterator = intervalCollection.CreateForwardIteratorWithEndPosition(99999);
    for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
        assert(false, "Iterator with OOB position should not produce a result");
    }

    i = 0;
    for (interval of intervalCollection) {
        assert.strictEqual(interval, intervalArray[i], "Mismatch in for...of iteration of collection");
        i++;
    }
    assert.strictEqual(i, intervalArray.length, "Interval omitted from for...of iteration");

    id = intervalArray[0].getIntervalId();
    interval = intervalCollection.getIntervalById(id);
    assert.strictEqual(interval, intervalArray[0]);
    interval = intervalCollection.removeIntervalById(id);
    assert.strictEqual(interval, intervalArray[0]);
    interval = intervalCollection.getIntervalById(id);
    assert.strictEqual(interval, undefined);
    interval = intervalCollection.removeIntervalById(id);
    assert.strictEqual(interval, undefined);

    id = intervalArray[intervalArray.length - 1].getIntervalId();
    interval = intervalCollection.getIntervalById(id);
    assert.strictEqual(interval, intervalArray[intervalArray.length - 1]);
    interval = intervalCollection.removeIntervalById(id);
    assert.strictEqual(interval, intervalArray[intervalArray.length - 1]);
    interval = intervalCollection.getIntervalById(id);
    assert.strictEqual(interval, undefined);
    interval = intervalCollection.removeIntervalById(id);
    assert.strictEqual(interval, undefined);

    for (interval of intervalArray) {
        id = interval.getIntervalId();
        intervalCollection.removeIntervalById(id);
    }
}
describeNoCompat("SharedInterval", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    beforeEach(() => {
        provider = getTestObjectProvider();
    });
    describe("one client", () => {
        const stringId = "stringKey";

        let sharedString: SharedString;
        let intervals: IntervalCollection<SequenceInterval>;
        let dataObject: ITestFluidObject & IFluidLoadable;

        const assertIntervals = (expected: readonly { start: number; end: number; }[]) => {
            // Make sure all ops have been sent before actually asserting
            (dataObject.context.containerRuntime as IContainerRuntime).flush();
            assertIntervalsHelper(sharedString, intervals, expected);
        };

        beforeEach(async () => {
            const registry: ChannelFactoryRegistry = [[stringId, SharedString.getFactory()]];
            const testContainerConfig: ITestContainerConfig = {
                fluidDataObjectType: DataObjectFactoryType.Test,
                registry,
            };
            const container = await provider.makeTestContainer(testContainerConfig);
            dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
            sharedString = await dataObject.getSharedObject<SharedString>(stringId);
            sharedString.insertText(0, "012");

            intervals = sharedString.getIntervalCollection("intervals");
            testIntervalOperations(intervals);
        });

        it("replace all is included", async () => {
            sharedString.insertText(3, ".");
            intervals.add(0, 3, IntervalType.SlideOnRemove);
            assertIntervals([{ start: 0, end: 3 }]);

            sharedString.replaceText(0, 3, `xxx`);
            assertIntervals([{ start: 0, end: 3 }]);
        });

        it("remove all yields empty range", async () => {
            const len = sharedString.getLength();
            intervals.add(0, len - 1, IntervalType.SlideOnRemove);
            assertIntervals([{ start: 0, end: len - 1 }]);

            sharedString.removeRange(0, len);
            await provider.ensureSynchronized();
            assertIntervals([{ start: DetachedReferencePosition, end: DetachedReferencePosition }]);
        });

        it("replace before is excluded", async () => {
            intervals.add(1, 2, IntervalType.SlideOnRemove);
            assertIntervals([{ start: 1, end: 2 }]);

            sharedString.replaceText(0, 1, `x`);
            assertIntervals([{ start: 1, end: 2 }]);
        });

        it("insert at first position is excluded", async () => {
            intervals.add(0, 2, IntervalType.SlideOnRemove);
            assertIntervals([{ start: 0, end: 2 }]);

            sharedString.insertText(0, ".");
            assertIntervals([{ start: 1, end: 3 }]);
        });

        it("replace first is included", async () => {
            sharedString.insertText(0, "012");
            intervals.add(0, 2, IntervalType.SlideOnRemove);
            assertIntervals([{ start: 0, end: 2 }]);

            sharedString.replaceText(0, 1, `x`);
            assertIntervals([{ start: 0, end: 2 }]);
        });

        it("replace last is included", async () => {
            sharedString.insertText(0, "012");
            intervals.add(0, 2, IntervalType.SlideOnRemove);
            assertIntervals([{ start: 0, end: 2 }]);

            sharedString.replaceText(1, 2, `x`);
            assertIntervals([{ start: 0, end: 2 }]);
        });

        it("insert at last position is included", async () => {
            intervals.add(0, 2, IntervalType.SlideOnRemove);
            assertIntervals([{ start: 0, end: 2 }]);

            sharedString.insertText(2, ".");
            assertIntervals([{ start: 0, end: 3 }]);
        });

        it("insert after last position is excluded", async () => {
            intervals.add(0, 2, IntervalType.SlideOnRemove);
            assertIntervals([{ start: 0, end: 2 }]);

            sharedString.insertText(3, ".");
            assertIntervals([{ start: 0, end: 2 }]);
        });

        it("replace after", async () => {
            intervals.add(0, 1, IntervalType.SlideOnRemove);
            assertIntervals([{ start: 0, end: 1 }]);

            sharedString.replaceText(1, 2, `x`);
            assertIntervals([{ start: 0, end: 1 }]);
        });

        it("repeated replacement", async () => {
            sharedString.insertText(0, "012");
            intervals.add(0, 2, IntervalType.SlideOnRemove);
            assertIntervals([{ start: 0, end: 2 }]);

            for (let j = 0; j < 10; j++) {
                for (let i = 0; i < 10; i++) {
                    sharedString.replaceText(0, 1, `x`);
                    assertIntervals([{ start: 0, end: 2 }]);

                    sharedString.replaceText(1, 2, `x`);
                    assertIntervals([{ start: 0, end: 2 }]);

                    sharedString.replaceText(2, 3, `x`);
                    assertIntervals([{ start: 0, end: 2 }]);
                }

                await provider.ensureSynchronized();
            }
        });
    });

    describe("multiple clients", () => {
        it("propagates", async () => {
            const stringId = "stringKey";
            const registry: ChannelFactoryRegistry = [[stringId, SharedString.getFactory()]];
            const testContainerConfig: ITestContainerConfig = {
                fluidDataObjectType: DataObjectFactoryType.Test,
                registry,
            };

            // Create a Container for the first client.
            const container1 = await provider.makeTestContainer(testContainerConfig);
            const dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
            const sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);

            sharedString1.insertText(0, "0123456789");
            const intervals1 = sharedString1.getIntervalCollection("intervals");
            intervals1.add(1, 7, IntervalType.SlideOnRemove);
            assertIntervalsHelper(sharedString1, intervals1, [{ start: 1, end: 7 }]);

            // Load the Container that was created by the first client.
            const container2 = await provider.loadTestContainer(testContainerConfig);
            const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");

            await provider.ensureSynchronized();

            const sharedString2 = await dataObject2.getSharedObject<SharedString>(stringId);
            const intervals2 = sharedString2.getIntervalCollection("intervals");
            assertIntervalsHelper(sharedString2, intervals2, [{ start: 1, end: 7 }]);

            sharedString2.removeRange(4, 5);
            assertIntervalsHelper(sharedString2, intervals2, [{ start: 1, end: 6 }]);

            sharedString2.insertText(4, "x");
            assertIntervalsHelper(sharedString2, intervals2, [{ start: 1, end: 7 }]);

            await provider.ensureSynchronized();
            assertIntervalsHelper(sharedString1, intervals1, [{ start: 1, end: 7 }]);
        });

        it("multi-client interval ops", async () => {
            const stringId = "stringKey";
            const registry: ChannelFactoryRegistry = [[stringId, SharedString.getFactory()]];
            const testContainerConfig: ITestContainerConfig = {
                fluidDataObjectType: DataObjectFactoryType.Test,
                registry,
            };

            // Create a Container for the first client.
            const container1 = await provider.makeTestContainer(testContainerConfig);
            const dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
            const sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);

            sharedString1.insertText(0, "012");
            const intervals1 = sharedString1.getIntervalCollection("intervals");
            const intervalArray: any[] = [];
            let interval: SequenceInterval;

            intervalArray[0] = intervals1.add(0, 0, IntervalType.SlideOnRemove);
            intervalArray[1] = intervals1.add(0, 1, IntervalType.SlideOnRemove);
            intervalArray[2] = intervals1.add(0, 2, IntervalType.SlideOnRemove);
            intervalArray[3] = intervals1.add(1, 0, IntervalType.SlideOnRemove);
            intervalArray[4] = intervals1.add(1, 1, IntervalType.SlideOnRemove);
            intervalArray[5] = intervals1.add(1, 2, IntervalType.SlideOnRemove);
            intervalArray[6] = intervals1.add(2, 0, IntervalType.SlideOnRemove);
            intervalArray[7] = intervals1.add(2, 1, IntervalType.SlideOnRemove);
            intervalArray[8] = intervals1.add(2, 2, IntervalType.SlideOnRemove);

            // Load the Container that was created by the first client.
            const container2 = await provider.loadTestContainer(testContainerConfig);
            const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");

            await provider.ensureSynchronized();

            const sharedString2 = await dataObject2.getSharedObject<SharedString>(stringId);
            const intervals2 = sharedString2.getIntervalCollection("intervals");

            const checkIdEquals = (a: SequenceInterval, b: SequenceInterval, s: string) => {
                assert.strictEqual(a.getIntervalId(), b.getIntervalId(), s);
            };
            let i: number;
            let result;
            let tempArray: SequenceInterval[] = [];
            let iterator = intervals2.CreateForwardIteratorWithStartPosition(1);
            tempArray[0] = intervalArray[3];
            tempArray[1] = intervalArray[4];
            tempArray[2] = intervalArray[5];
            for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
                checkIdEquals(result.value, tempArray[i], "Mismatch in forward iteration with start position");
            }
            assert.strictEqual(i, tempArray.length, "Interval omitted from forward iteration with start position");

            iterator = intervals2.CreateBackwardIteratorWithStartPosition(0);
            tempArray = [];
            tempArray[0] = intervalArray[2];
            tempArray[1] = intervalArray[1];
            tempArray[2] = intervalArray[0];
            for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
                checkIdEquals(result.value, tempArray[i], "Mismatch in backward iteration with start position");
            }
            assert.strictEqual(i, tempArray.length, "Interval omitted from backward iteration with start position");

            iterator = intervals2.CreateBackwardIteratorWithEndPosition(1);
            tempArray = [];
            tempArray[0] = intervalArray[7];
            tempArray[1] = intervalArray[4];
            tempArray[2] = intervalArray[1];
            for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
                checkIdEquals(result.value, tempArray[i], "Mismatch in backward iteration with end position");
            }
            assert.strictEqual(i, tempArray.length, "Interval omitted from backward iteration with end position");

            i = 0;
            for (interval of intervals2) {
                checkIdEquals(interval, intervalArray[i], "Mismatch in for...of iteration of collection");
                i++;
            }
            assert.strictEqual(i, intervalArray.length, "Interval omitted from for...of iteration");

            for (interval of intervalArray) {
                const id = interval.getIntervalId();
                intervals2.removeIntervalById(id as string);
            }

            await provider.ensureSynchronized();

            if (intervals1[Symbol.iterator]) {
                for (interval of intervals1) {
                    assert(false, "intervals1 should be empty after emptying invervals2");
                }
            }
        });

        it("Conflicting ops", async () => {
            const stringId = "stringKey";
            const registry: ChannelFactoryRegistry = [[stringId, SharedString.getFactory()]];
            const testContainerConfig: ITestContainerConfig = {
                fluidDataObjectType: DataObjectFactoryType.Test,
                registry,
            };

            // Create a Container for the first client.
            const container1 = await provider.makeTestContainer(testContainerConfig);
            const dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
            const sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);

            sharedString1.insertText(0, "01234");
            const intervals1 = sharedString1.getIntervalCollection("intervals");
            let interval1: SequenceInterval;
            let interval2: SequenceInterval;
            let id1;
            let id2;

            await provider.ensureSynchronized();

            // Load the Container that was created by the first client.
            const container2 = await provider.loadTestContainer(testContainerConfig);
            const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");
            const sharedString2 = await dataObject2.getSharedObject<SharedString>(stringId);
            const intervals2 = sharedString2.getIntervalCollection("intervals");

            // Conflicting adds
            interval1 = intervals1.add(0, 0, IntervalType.SlideOnRemove);
            id1 = interval1.getIntervalId();
            interval2 = intervals2.add(0, 0, IntervalType.SlideOnRemove);
            id2 = interval2.getIntervalId();

            await provider.ensureSynchronized();

            assert.notStrictEqual(intervals1.getIntervalById(id2), undefined, "Interval not added to collection 1");
            assert.notStrictEqual(intervals1.getIntervalById(id2), interval1, "Unique interval not added");
            assert.notStrictEqual(intervals2.getIntervalById(id1), undefined, "Interval not added to collection 2");
            assert.notStrictEqual(intervals2.getIntervalById(id1), interval2, "Unique interval not added");

            // Conflicting removes
            interval1 = intervals1.removeIntervalById(id2);
            assert.notStrictEqual(interval1, undefined, "Interval not removed by id");
            interval2 = intervals2.removeIntervalById(id1);
            assert.notStrictEqual(interval2, undefined, "Interval not removed by id");

            await provider.ensureSynchronized();

            assert.strictEqual(
                intervals1.getIntervalById(id1), undefined, "Interval not removed from other client");
            assert.strictEqual(
                intervals2.getIntervalById(id2), undefined, "Interval not removed from other client");

            // Conflicting removes + add
            interval1 = intervals1.add(1, 1, IntervalType.SlideOnRemove);
            id1 = interval1.getIntervalId();
            interval2 = intervals2.add(1, 1, IntervalType.SlideOnRemove);
            id2 = interval2.getIntervalId();

            await provider.ensureSynchronized();

            intervals2.removeIntervalById(id1);
            intervals1.removeIntervalById(id2);
            interval1 = intervals1.add(1, 1, IntervalType.SlideOnRemove);
            id1 = interval1.getIntervalId();

            await provider.ensureSynchronized();

            assert.strictEqual(interval1, intervals1.getIntervalById(id1), "Interval missing from collection 1");
            for (const interval of intervals1) {
                assert.strictEqual(interval, interval1, "Oddball interval found in client 1");
            }

            interval2 = intervals2.getIntervalById(id1);
            assert.notStrictEqual(interval2, undefined, "Interval missing from collection 2");
            for (const interval of intervals2) {
                assert.strictEqual(interval, interval2, "Oddball interval found in client 2");
            }

            if (typeof (intervals1.change) === "function" &&
                typeof (intervals2.change) === "function") {
                // Conflicting changes
                intervals1.change(id1, 1, 2);
                intervals2.change(id1, 2, 1);

                await provider.ensureSynchronized();

                assert.strictEqual(interval1?.getIntervalId(), id1);
                assert.strictEqual(interval2?.getIntervalId(), id1);
                for (interval1 of intervals1) {
                    const id: string = interval1.getIntervalId() as string;
                    assert.strictEqual(interval1.start.getOffset(),
                        intervals2.getIntervalById(id)?.start.getOffset(),
                        "Conflicting changes");
                    assert.strictEqual(interval1.end.getOffset(),
                        intervals2.getIntervalById(id)?.end.getOffset(),
                        "Conflicting changes");
                }
                for (interval2 of intervals2) {
                    const id: string = interval2.getIntervalId() as string;
                    assert.strictEqual(interval2.start.getOffset(),
                        intervals1.getIntervalById(id)?.start.getOffset(),
                        "Conflicting changes");
                    assert.strictEqual(interval2.end.getOffset(),
                        intervals1.getIntervalById(id)?.end.getOffset(),
                        "Conflicting changes");
                }

                intervals1.change(id1, 4, 4);
                await provider.opProcessingController.processOutgoing();
                intervals2.change(id1, 2, undefined);
                await provider.ensureSynchronized();

                interval1 = intervals1.getIntervalById(id1);
                assert.strictEqual(interval1.start.getOffset(), 2, "Conflicting transparent change");
                assert.strictEqual(interval1.end.getOffset(), 4, "Conflicting transparent change");

                interval2 = intervals2.getIntervalById(id1);
                assert.strictEqual(interval2.start.getOffset(), 2, "Conflicting transparent change");
                assert.strictEqual(interval2.end.getOffset(), 4, "Conflicting transparent change");

                intervals1.change(id1, undefined, 3);
                await provider.opProcessingController.processOutgoing();
                intervals2.change(id1, undefined, 2);

                await provider.ensureSynchronized();

                interval1 = intervals1.getIntervalById(id1);
                assert.strictEqual(interval1.start.getOffset(), 2, "Conflicting transparent change");
                assert.strictEqual(interval1.end.getOffset(), 2, "Conflicting transparent change");

                interval2 = intervals2.getIntervalById(id1);
                assert.strictEqual(interval2.start.getOffset(), 2, "Conflicting transparent change");
                assert.strictEqual(interval2.end.getOffset(), 2, "Conflicting transparent change");
            }

            if (typeof (intervals1.changeProperties) === "function" &&
                typeof (intervals2.changeProperties) === "function") {
                const assertPropertyChangedArg = (p: any, v: any, m: string) => {
                    // Check expected values of args passed to the propertyChanged event only if IntervalCollection
                    // is a TypedEventEmitter. (This is not true of earlier versions,
                    // which will not capture the values.)
                    if (intervals1 instanceof TypedEventEmitter && intervals2 instanceof TypedEventEmitter) {
                        assert.strictEqual(p, v, m);
                    }
                };
                let deltaArgs1: PropertySet = {};
                let deltaArgs2: PropertySet = {};
                intervals1.on("propertyChanged", (interval: SequenceInterval, propertyDeltas: PropertySet) => {
                    deltaArgs1 = propertyDeltas;
                });
                intervals2.on("propertyChanged", (interval: SequenceInterval, propertyDeltas: PropertySet) => {
                    deltaArgs2 = propertyDeltas;
                });
                intervals1.changeProperties(id1, { prop1: "prop1" });
                assertPropertyChangedArg(deltaArgs1.prop1, null, "Mismatch in property-changed event arg 1");
                await provider.opProcessingController.processOutgoing();
                intervals2.changeProperties(id1, { prop2: "prop2" });
                assertPropertyChangedArg(deltaArgs2.prop2, null, "Mismatch in property-changed event arg 2");

                await provider.ensureSynchronized();
                assertPropertyChangedArg(deltaArgs1.prop2, null, "Mismatch in property-changed event arg 3");
                assertPropertyChangedArg(deltaArgs2.prop1, null, "Mismatch in property-changed event arg 4");

                interval1 = intervals1.getIntervalById(id1);
                assert.strictEqual(interval1.properties.prop1, "prop1", "Mismatch in changed properties 1");
                assert.strictEqual(interval1.properties.prop2, "prop2", "Mismatch in changed properties 2");
                interval2 = intervals2.getIntervalById(id1);
                assert.strictEqual(interval2.properties.prop1, "prop1", "Mismatch in changed properties 3");
                assert.strictEqual(interval2.properties.prop2, "prop2", "Mismatch in changed properties 4");

                intervals1.changeProperties(id1, { prop1: "no" });
                assertPropertyChangedArg(deltaArgs1.prop1, "prop1", "Mismatch in property-changed event arg 5");
                await provider.opProcessingController.processOutgoing();
                intervals2.changeProperties(id1, { prop1: "yes" });
                assertPropertyChangedArg(deltaArgs2.prop1, "prop1", "Mismatch in property-changed event arg 6");

                await provider.ensureSynchronized();
                assertPropertyChangedArg(deltaArgs1.prop1, "no", "Mismatch in property-changed event arg 7");
                assertPropertyChangedArg(Object.hasOwnProperty.call(deltaArgs2, "prop1"), false,
                    "Mismatch in property-changed event arg 8");

                assert.strictEqual(interval1.properties.prop1, "yes", "Mismatch in changed properties 5");
                assert.strictEqual(interval1.properties.prop2, "prop2", "Mismatch in changed properties 6");
                assert.strictEqual(interval2.properties.prop1, "yes", "Mismatch in changed properties 7");
                assert.strictEqual(interval2.properties.prop2, "prop2", "Mismatch in changed properties 8");

                intervals1.changeProperties(id1, { prop1: "maybe" });
                assertPropertyChangedArg(deltaArgs1.prop1, "yes", "Mismatch in property-changed event arg 9");
                await provider.opProcessingController.processOutgoing();
                intervals2.changeProperties(id1, { prop1: null });
                assertPropertyChangedArg(deltaArgs2.prop1, "yes", "Mismatch in property-changed event arg 10");

                await provider.ensureSynchronized();

                assertPropertyChangedArg(deltaArgs1.prop1, "maybe", "Mismatch in property-changed event arg 11");
                assertPropertyChangedArg(Object.hasOwnProperty.call(deltaArgs2, "prop1"), false,
                    "Mismatch in property-changed event arg 12");

                assert.strictEqual(Object.prototype.hasOwnProperty.call(interval1.properties, "prop1"), false,
                    "Property not deleted 1");
                assert.strictEqual(interval1.properties.prop2, "prop2", "Mismatch in changed properties 9");
                assert.strictEqual(Object.prototype.hasOwnProperty.call(interval2.properties, "prop1"), false,
                    "Property not deleted 2");
                assert.strictEqual(interval2.properties.prop2, "prop2", "Mismatch in changed properties 10");
            }

            // Conflicting removes
            intervals1.removeIntervalById(id1);
            intervals2.removeIntervalById(id1);

            await provider.ensureSynchronized();

            for (interval1 of intervals1) {
                assert.fail("Interval not removed from collection 1");
            }

            for (interval2 of intervals2) {
                assert.fail("Interval not removed from collection 2");
            }
        });
    });

    describe("Handles in value types", () => {
        const mapId = "mapKey";
        const stringId = "stringKey";

        const registry: ChannelFactoryRegistry = [
            [mapId, SharedMap.getFactory()],
            [stringId, SharedString.getFactory()],
        ];
        const testContainerConfig: ITestContainerConfig = {
            fluidDataObjectType: DataObjectFactoryType.Test,
            registry,
        };

        let dataObject1: ITestFluidObject;
        let sharedMap1: ISharedMap;
        let sharedMap2: ISharedMap;
        let sharedMap3: ISharedMap;

        beforeEach(async () => {
            // Create a Container for the first client.
            const container1 = await provider.makeTestContainer(testContainerConfig);
            dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
            sharedMap1 = await dataObject1.getSharedObject<SharedMap>(mapId);

            // Load the Container that was created by the first client.
            const container2 = await provider.loadTestContainer(testContainerConfig);
            const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");
            sharedMap2 = await dataObject2.getSharedObject<SharedMap>(mapId);

            // Load the Container that was created by the first client.
            const container3 = await provider.loadTestContainer(testContainerConfig);
            const dataObject3 = await requestFluidObject<ITestFluidObject>(container3, "default");
            sharedMap3 = await dataObject3.getSharedObject<SharedMap>(mapId);
        });

        // This functionality is used in Word and FlowView's "add comment" functionality.
        it("Can store shared objects in a shared string's interval collection via properties", async () => {
            sharedMap1.set("outerString", SharedString.create(dataObject1.runtime).handle);
            await provider.ensureSynchronized();

            const outerString1 = await sharedMap1.get<IFluidHandle<SharedString>>("outerString")?.get();
            const outerString2 = await sharedMap2.get<IFluidHandle<SharedString>>("outerString")?.get();
            const outerString3 = await sharedMap3.get<IFluidHandle<SharedString>>("outerString")?.get();
            assert.ok(outerString1, "String did not correctly set as value in container 1's map");
            assert.ok(outerString2, "String did not correctly set as value in container 2's map");
            assert.ok(outerString3, "String did not correctly set as value in container 3's map");

            outerString1.insertText(0, "outer string");

            const intervalCollection1 = outerString1.getIntervalCollection("comments");
            await provider.ensureSynchronized();

            const intervalCollection2 = outerString2.getIntervalCollection("comments");
            const intervalCollection3 = outerString3.getIntervalCollection("comments");
            assert.ok(intervalCollection1, "Could not get the comments interval collection in container 1");
            assert.ok(intervalCollection2, "Could not get the comments interval collection in container 2");
            assert.ok(intervalCollection3, "Could not get the comments interval collection in container 3");

            const comment1Text = SharedString.create(dataObject1.runtime);
            comment1Text.insertText(0, "a comment...");
            intervalCollection1.add(0, 3, IntervalType.SlideOnRemove, { story: comment1Text.handle });
            const comment2Text = SharedString.create(dataObject1.runtime);
            comment2Text.insertText(0, "another comment...");
            intervalCollection1.add(5, 7, IntervalType.SlideOnRemove, { story: comment2Text.handle });
            const nestedMap = SharedMap.create(dataObject1.runtime);
            nestedMap.set("nestedKey", "nestedValue");
            intervalCollection1.add(8, 9, IntervalType.SlideOnRemove, { story: nestedMap.handle });
            await provider.ensureSynchronized();

            const serialized1 = intervalCollection1.serializeInternal();
            const serialized2 = intervalCollection2.serializeInternal();
            const serialized3 = intervalCollection3.serializeInternal();
            assert.equal(serialized1.intervals.length, 3, "Incorrect interval collection size in container 1");
            assert.equal(serialized2.intervals.length, 3, "Incorrect interval collection size in container 2");
            assert.equal(serialized3.intervals.length, 3, "Incorrect interval collection size in container 3");

            const interval1From3Properties = serialized3.intervals[0][4];
            assert(interval1From3Properties);
            const comment1From3 = await (interval1From3Properties.story as IFluidHandle<SharedString>).get();
            assert.equal(
                comment1From3.getText(0, 12), "a comment...", "Incorrect text in interval collection's shared string");
            const interval3From3Properties = serialized3.intervals[2][4];
            assert(interval3From3Properties);
            const mapFrom3 = await (interval3From3Properties.story as IFluidHandle<SharedMap>).get();
            assert.equal(
                mapFrom3.get("nestedKey"), "nestedValue", "Incorrect value in interval collection's shared map");

            const summaryBlob = (await outerString2.summarize()).summary.tree.header as ISummaryBlob;
            // Since it's based on a map kernel, its contents parse as
            // an IMapDataObjectSerializable with the "comments" member we set
            const parsedContent = JSON.parse(summaryBlob.content as string);
            // LocalIntervalCollection serializes as ISerializedIntervalCollectionV2,
            // let's get the first comment
            const serializedInterval1FromSnapshotProperties =
                (parsedContent.comments.value as ISerializedIntervalCollectionV2).intervals[0][4];
            // The "story" is the ILocalValue of the handle pointing to the SharedString
            assert(serializedInterval1FromSnapshotProperties);
            const handleLocalValueFromSnapshot = serializedInterval1FromSnapshotProperties.story as { type: string; };
            assert.equal(
                handleLocalValueFromSnapshot.type,
                "__fluid_handle__",
                "Incorrect handle type in shared interval's summary");
        });
    });
});
