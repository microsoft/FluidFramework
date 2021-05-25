/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import { IntervalType, LocalReference } from "@fluidframework/merge-tree";
import { ISummaryBlob } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    IntervalCollection,
    ISerializedInterval,
    SequenceInterval,
    SharedString,
} from "@fluidframework/sequence";
import {
    ITestObjectProvider,
    ITestContainerConfig,
    DataObjectFactoryType,
    ITestFluidObject,
    ChannelFactoryRegistry,
} from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";

const assertIntervalsHelper = (
    sharedString: SharedString,
    intervalView,
    expected: readonly { start: number; end: number }[],
) => {
    const actual = intervalView.findOverlappingIntervals(0, sharedString.getLength() - 1);
    assert.strictEqual(actual.length, expected.length,
        `findOverlappingIntervals() must return the expected number of intervals`);

    for (const actualInterval of actual) {
        const start = sharedString.localRefToPos(actualInterval.start);
        const end = sharedString.localRefToPos(actualInterval.end);
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

function testIntervalCollection(intervalCollection: IntervalCollection<SequenceInterval>) {
    if (!intervalCollection[Symbol.iterator]) {
        // Check for prior version that doesn't support iteration
        return;
    }

    const intervalArray: SequenceInterval[] = [];
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
        const interval = result.value;
        assert.strictEqual(interval, tempArray[i], "Mismatch in forward iteration with start position");
    }
    assert.strictEqual(i, tempArray.length, "Interval omitted from forward iteration with start position");

    iterator = intervalCollection.CreateBackwardIteratorWithStartPosition(0);
    tempArray = [];
    tempArray[0] = intervalArray[2];
    tempArray[1] = intervalArray[1];
    tempArray[2] = intervalArray[0];
    for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
        const interval = result.value;
        assert.strictEqual(interval, tempArray[i], "Mismatch in backward iteration with start position");
    }
    assert.strictEqual(i, tempArray.length, "Interval omitted from backward iteration with start position");

    iterator = intervalCollection.CreateBackwardIteratorWithEndPosition(1);
    tempArray = [];
    tempArray[0] = intervalArray[7];
    tempArray[1] = intervalArray[4];
    tempArray[2] = intervalArray[1];
    for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
        const interval = result.value;
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

    for (const interval of intervalCollection) {
        assert.strictEqual(interval, intervalArray[i], "Mismatch in for...of iteration of collection");
        i++;
    }
    assert.strictEqual(i, intervalArray.length, "Interval omitted from for...of iteration");

    if (typeof(intervalArray[0]?.getIntervalId) === "function") {
        let interval: SequenceInterval;

        let id = intervalArray[0].getIntervalId();
        assert.notStrictEqual(id, undefined, "Unique Id should have been assigned");
        if (id !== undefined) {
            interval = intervalCollection.getIntervalById(id);
            assert.strictEqual(interval, intervalArray[0]);
            interval = intervalCollection.removeIntervalById(id);
            assert.strictEqual(interval, intervalArray[0]);
            interval = intervalCollection.getIntervalById(id);
            assert.strictEqual(interval, undefined);
            interval = intervalCollection.removeIntervalById(id);
            assert.strictEqual(interval, undefined);
        }

        id = intervalArray[intervalArray.length - 1].getIntervalId();
        assert.notStrictEqual(id, undefined, "Unique Id should have been assigned");
        if (id !== undefined) {
            interval = intervalCollection.getIntervalById(id);
            assert.strictEqual(interval, intervalArray[intervalArray.length - 1]);
            interval = intervalCollection.removeIntervalById(id);
            assert.strictEqual(interval, intervalArray[intervalArray.length - 1]);
            interval = intervalCollection.getIntervalById(id);
            assert.strictEqual(interval, undefined);
            interval = intervalCollection.removeIntervalById(id);
            assert.strictEqual(interval, undefined);
        }
    }

    for (const interval of intervalArray) {
        const id = typeof(interval.getIntervalId) === "function" ? interval.getIntervalId() : undefined;
        if (id !== undefined) {
            intervalCollection.removeIntervalById(id);
        }
        else {
            intervalCollection.delete(interval.start.getOffset(), interval.end.getOffset());
        }
    }
}

describeFullCompat("SharedInterval", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    beforeEach(() => {
        provider = getTestObjectProvider();
    });
    describe("one client", () => {
        const stringId = "stringKey";

        let sharedString: SharedString;
        let intervals: IntervalCollection<SequenceInterval>;
        let intervalView;

        const assertIntervals = (expected: readonly { start: number; end: number }[]) => {
            assertIntervalsHelper(sharedString, intervalView, expected);
        };

        beforeEach(async () => {
            const registry: ChannelFactoryRegistry = [[stringId, SharedString.getFactory()]];
            const testContainerConfig: ITestContainerConfig = {
                fluidDataObjectType: DataObjectFactoryType.Test,
                registry,
            };
            const container = await provider.makeTestContainer(testContainerConfig);
            const dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
            sharedString = await dataObject.getSharedObject<SharedString>(stringId);
            sharedString.insertText(0, "012");

            intervals = sharedString.getIntervalCollection("intervals");
            intervalView = await intervals.getView();
            testIntervalCollection(intervals);
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
            assertIntervals([{ start: LocalReference.DetachedPosition, end: LocalReference.DetachedPosition }]);
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
            const intervalView1 = await intervals1.getView();
            intervals1.add(1, 7, IntervalType.SlideOnRemove);
            assertIntervalsHelper(sharedString1, intervalView1, [{ start: 1, end: 7 }]);

            // Load the Container that was created by the first client.
            const container2 = await provider.loadTestContainer(testContainerConfig);
            const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");

            await provider.ensureSynchronized();

            const sharedString2 = await dataObject2.getSharedObject<SharedString>(stringId);
            const intervals2 = sharedString2.getIntervalCollection("intervals");
            const intervalView2 = await intervals2.getView();
            assertIntervalsHelper(sharedString2, intervalView2, [{ start: 1, end: 7 }]);

            sharedString2.removeRange(4, 5);
            assertIntervalsHelper(sharedString2, intervalView2, [{ start: 1, end: 6 }]);

            sharedString2.insertText(4, "x");
            assertIntervalsHelper(sharedString2, intervalView2, [{ start: 1, end: 7 }]);

            await provider.ensureSynchronized();
            assertIntervalsHelper(sharedString1, intervalView1, [{ start: 1, end: 7 }]);
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
            assert.equal(serialized1.length, 3, "Incorrect interval collection size in container 1");
            assert.equal(serialized2.length, 3, "Incorrect interval collection size in container 2");
            assert.equal(serialized3.length, 3, "Incorrect interval collection size in container 3");

            const interval1From3 = serialized3[0] as ISerializedInterval;
            assert(interval1From3.properties);
            const comment1From3 = await (interval1From3.properties.story as IFluidHandle<SharedString>).get();
            assert.equal(
                comment1From3.getText(0, 12), "a comment...", "Incorrect text in interval collection's shared string");
            const interval3From3 = serialized3[2] as ISerializedInterval;
            assert(interval3From3.properties);
            const mapFrom3 = await (interval3From3.properties.story as IFluidHandle<SharedMap>).get();
            assert.equal(
                mapFrom3.get("nestedKey"), "nestedValue", "Incorrect value in interval collection's shared map");

            const summaryBlob = outerString2.summarize().summary.tree.header as ISummaryBlob;
            // Since it's based on a map kernel, its contents parse as
            // an IMapDataObjectSerializable with the "comments" member we set
            const parsedContent = JSON.parse(summaryBlob.content as string);
            // LocalIntervalCollection serializes as an array of ISerializedInterval, let's get the first comment
            const serializedInterval1FromSnapshot =
                (parsedContent["intervalCollections/comments"].value as ISerializedInterval[])[0];
            // The "story" is the ILocalValue of the handle pointing to the SharedString
            assert(serializedInterval1FromSnapshot.properties);
            const handleLocalValueFromSnapshot = serializedInterval1FromSnapshot.properties.story as { type: string };
            assert.equal(
                handleLocalValueFromSnapshot.type,
                "__fluid_handle__",
                "Incorrect handle type in shared interval's summary");
        });
    });
});
