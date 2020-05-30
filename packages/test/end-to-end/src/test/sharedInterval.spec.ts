/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { IFluidCodeDetails, ILoader } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { DocumentDeltaEventManager } from "@fluidframework/local-driver";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import { IntervalType, LocalReference } from "@fluidframework/merge-tree";
import { IBlob } from "@fluidframework/protocol-definitions";
import {
    IntervalCollectionView,
    ISerializedInterval,
    SequenceInterval,
    SharedString,
} from "@fluidframework/sequence";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { ISharedObjectFactory } from "@fluidframework/shared-object-base";
import {
    createLocalLoader,
    ITestFluidComponent,
    initializeLocalContainer,
    TestFluidComponentFactory,
} from "@fluidframework/test-utils";

const assertIntervalsHelper = (
    sharedString: SharedString,
    intervals: IntervalCollectionView<SequenceInterval>,
    expected: readonly { start: number; end: number }[],
) => {
    const actual = intervals.findOverlappingIntervals(0, sharedString.getLength() - 1);
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

describe("SharedInterval", () => {
    const id = "fluid-test://localhost/sharedIntervalTest";
    const codeDetails: IFluidCodeDetails = {
        package: "sharedIntervalTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let containerDeltaEventManager: DocumentDeltaEventManager;

    async function getComponent(componentId: string, container: Container): Promise<ITestFluidComponent> {
        const response = await container.request({ url: componentId });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error(`Component with id: ${componentId} not found`);
        }
        return response.value as ITestFluidComponent;
    }

    async function createContainer(factoryEntries: Iterable<[string, ISharedObjectFactory]>): Promise<Container> {
        const factory = new TestFluidComponentFactory(factoryEntries);
        const loader: ILoader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer);
        return initializeLocalContainer(id, loader, codeDetails);
    }

    describe("one client", () => {
        const stringId = "stringKey";

        let sharedString: SharedString;
        let intervals: IntervalCollectionView<SequenceInterval>;

        const assertIntervals = (expected: readonly {
            start: number; end: number
        }[]) => {
            assertIntervalsHelper(sharedString, intervals, expected);
        };

        beforeEach(async () => {
            deltaConnectionServer = LocalDeltaConnectionServer.create();

            const container = await createContainer([[stringId, SharedString.getFactory()]]);
            const component = await getComponent("default", container);
            sharedString = await component.getSharedObject<SharedString>(stringId);
            sharedString.insertText(0, "012");
            intervals = await sharedString.getIntervalCollection("intervals").getView();

            containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);
            containerDeltaEventManager.registerDocuments(component.runtime);
        });

        it("replace all is included", async () => {
            // Temporarily, append a padding character to the initial string to work around #1761:
            // (See: https://github.com/Microsoft/Prague/issues/1761)
            sharedString.insertText(3, ".");

            intervals.add(0, 3, IntervalType.SlideOnRemove);
            assertIntervals([{ start: 0, end: 3 }]);

            sharedString.replaceText(0, 3, `xxx`);
            assertIntervals([{ start: 0, end: 3 }]);
        });

        it("remove all yields empty range", async () => {
            // Temporarily, appending a padding character to the initial string to work around #1761:
            // (See: https://github.com/Microsoft/Prague/issues/1761)
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

        // Uncomment below test to reproduce issue #2479:
        // https://github.com/microsoft/Prague/issues/2479
        //
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

                await containerDeltaEventManager.process();
            }
        });

        afterEach(async () => {
            await deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("multiple clients", () => {
        it("propagates", async () => {
            const stringId = "stringKey";

            deltaConnectionServer = LocalDeltaConnectionServer.create();
            containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);

            const container1 = await createContainer([[stringId, SharedString.getFactory()]]);
            const component1 = await getComponent("default", container1);
            const sharedString1 = await component1.getSharedObject<SharedString>(stringId);

            sharedString1.insertText(0, "0123456789");
            const intervals1 = await sharedString1.getIntervalCollection("intervals").getView();
            intervals1.add(1, 7, IntervalType.SlideOnRemove);
            assertIntervalsHelper(sharedString1, intervals1, [{ start: 1, end: 7 }]);

            const container2 = await createContainer([[stringId, SharedString.getFactory()]]);
            const component2 = await getComponent("default", container2);
            containerDeltaEventManager.registerDocuments(component1.runtime, component2.runtime);

            const sharedString2 = await component2.getSharedObject<SharedString>(stringId);
            const intervals2 = await sharedString2.getIntervalCollection("intervals").getView();
            assertIntervalsHelper(sharedString2, intervals2, [{ start: 1, end: 7 }]);

            sharedString2.removeRange(4, 5);
            assertIntervalsHelper(sharedString2, intervals2, [{ start: 1, end: 6 }]);

            sharedString2.insertText(4, "x");
            assertIntervalsHelper(sharedString2, intervals2, [{ start: 1, end: 7 }]);

            await containerDeltaEventManager.process();
            assertIntervalsHelper(sharedString1, intervals1, [{ start: 1, end: 7 }]);

            await deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("Handles in value types", () => {
        const mapId = "mapKey";
        const stringId = "stringKey";

        let component1: ITestFluidComponent;
        let sharedMap1: ISharedMap;
        let sharedMap2: ISharedMap;
        let sharedMap3: ISharedMap;

        beforeEach(async () => {
            deltaConnectionServer = LocalDeltaConnectionServer.create();

            const container1 = await createContainer([
                [mapId, SharedMap.getFactory()],
                [stringId, SharedString.getFactory()],
            ]);
            component1 = await getComponent("default", container1);
            sharedMap1 = await component1.getSharedObject<SharedMap>(mapId);

            const container2 = await createContainer([
                [mapId, SharedMap.getFactory()],
                [stringId, SharedString.getFactory()],
            ]);
            const component2 = await getComponent("default", container2);
            sharedMap2 = await component2.getSharedObject<SharedMap>(mapId);

            const container3 = await createContainer([
                [mapId, SharedMap.getFactory()],
                [stringId, SharedString.getFactory()],
            ]);
            const component3 = await getComponent("default", container3);
            sharedMap3 = await component3.getSharedObject<SharedMap>(mapId);

            containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);
            containerDeltaEventManager.registerDocuments(component1.runtime, component2.runtime, component3.runtime);
        });

        // This functionality is used in Word and FlowView's "add comment" functionality.
        it("Can store shared objects in a shared string's interval collection via properties", async () => {
            sharedMap1.set("outerString", SharedString.create(component1.runtime).handle);
            await containerDeltaEventManager.process();

            const outerString1 = await sharedMap1.get<IComponentHandle<SharedString>>("outerString").get();
            const outerString2 = await sharedMap2.get<IComponentHandle<SharedString>>("outerString").get();
            const outerString3 = await sharedMap3.get<IComponentHandle<SharedString>>("outerString").get();
            assert.ok(outerString1, "String did not correctly set as value in container 1's map");
            assert.ok(outerString2, "String did not correctly set as value in container 2's map");
            assert.ok(outerString3, "String did not correctly set as value in container 3's map");

            outerString1.insertText(0, "outer string");

            const intervalCollection1 = outerString1.getIntervalCollection("comments");
            await containerDeltaEventManager.process();

            const intervalCollection2 = outerString2.getIntervalCollection("comments");
            const intervalCollection3 = outerString3.getIntervalCollection("comments");
            assert.ok(intervalCollection1, "Could not get the comments interval collection in container 1");
            assert.ok(intervalCollection2, "Could not get the comments interval collection in container 2");
            assert.ok(intervalCollection3, "Could not get the comments interval collection in container 3");

            const comment1Text = SharedString.create(component1.runtime);
            comment1Text.insertText(0, "a comment...");
            intervalCollection1.add(0, 3, IntervalType.SlideOnRemove, { story: comment1Text.handle });
            const comment2Text = SharedString.create(component1.runtime);
            comment2Text.insertText(0, "another comment...");
            intervalCollection1.add(5, 7, IntervalType.SlideOnRemove, { story: comment2Text.handle });
            const nestedMap = SharedMap.create(component1.runtime);
            nestedMap.set("nestedKey", "nestedValue");
            intervalCollection1.add(8, 9, IntervalType.SlideOnRemove, { story: nestedMap.handle });
            await containerDeltaEventManager.process();

            const serialized1 = intervalCollection1.serializeInternal();
            const serialized2 = intervalCollection2.serializeInternal();
            const serialized3 = intervalCollection3.serializeInternal();
            assert.equal(serialized1.length, 3, "Incorrect interval collection size in container 1");
            assert.equal(serialized2.length, 3, "Incorrect interval collection size in container 2");
            assert.equal(serialized3.length, 3, "Incorrect interval collection size in container 3");

            const interval1From3 = serialized3[0] as ISerializedInterval;
            const comment1From3 = await (interval1From3.properties.story as IComponentHandle<SharedString>).get();
            assert.equal(
                comment1From3.getText(0, 12), "a comment...", "Incorrect text in interval collection's shared string");
            const interval3From3 = serialized3[2] as ISerializedInterval;
            const mapFrom3 = await (interval3From3.properties.story as IComponentHandle<SharedMap>).get();
            assert.equal(
                mapFrom3.get("nestedKey"), "nestedValue", "Incorrect value in interval collection's shared map");

            // SharedString snapshots as a blob
            const snapshotBlob = outerString2.snapshot().entries[0].value as IBlob;
            // Since it's based on a map kernel, its contents parse as
            // an IMapDataObjectSerializable with the "comments" member we set
            const parsedSnapshot = JSON.parse(snapshotBlob.contents);
            // LocalIntervalCollection serializes as an array of ISerializedInterval, let's get the first comment
            const serializedInterval1FromSnapshot =
                (parsedSnapshot["intervalCollections/comments"].value as ISerializedInterval[])[0];
            // The "story" is the ILocalValue of the handle pointing to the SharedString
            const handleLocalValueFromSnapshot = serializedInterval1FromSnapshot.properties.story as { type: string };
            assert.equal(
                handleLocalValueFromSnapshot.type,
                "__fluid_handle__",
                "Incorrect handle type in shared interval's snapshot");
        });

        afterEach(async () => {
            await deltaConnectionServer.webSocketServer.close();
        });
    });
});
