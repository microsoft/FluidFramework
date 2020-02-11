/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import * as api from "@fluid-internal/client-api";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import {
    DocumentDeltaEventManager,
    TestDocumentServiceFactory,
    TestHost,
    TestResolver,
} from "@microsoft/fluid-local-test-server";
import { ITestDeltaConnectionServer, TestDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import { IntervalType, LocalReference } from "@microsoft/fluid-merge-tree";
import { IBlob } from "@microsoft/fluid-protocol-definitions";
import {
    IntervalCollectionView,
    ISerializedInterval,
    SequenceInterval,
    SharedString,
    SharedStringFactory,
} from "@microsoft/fluid-sequence";

const assertIntervalsHelper = (
    sharedString: SharedString,
    intervals: IntervalCollectionView<SequenceInterval>,
    expected: readonly {start: number; end: number}[],
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
    describe("one client", () => {
        let host: TestHost;
        let sharedString: SharedString;
        let intervals: IntervalCollectionView<SequenceInterval>;

        const assertIntervals = (expected: readonly {start: number; end: number}[]) => {
            assertIntervalsHelper(sharedString, intervals, expected);
        };

        beforeEach(async () => {
            host = new TestHost([], [SharedString.getFactory()]);
            sharedString = await host.createType("text", SharedStringFactory.Type);
            sharedString.insertText(0, "012");
            intervals = await sharedString.getIntervalCollection("intervals").getView();
        });

        afterEach(async () => {
            await host.close();
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

                await TestHost.sync(host);
            }
        });
    });

    describe("multiple clients", () => {
        it("propagates", async () => {
            const host1 = new TestHost([], [SharedString.getFactory()]);
            const sharedString1 = await host1.createType<SharedString>("text", SharedStringFactory.Type);
            sharedString1.insertText(0, "0123456789");
            const intervals1 = await sharedString1.getIntervalCollection("intervals").getView();
            intervals1.add(1, 7, IntervalType.SlideOnRemove);
            assertIntervalsHelper(sharedString1, intervals1, [{ start: 1, end: 7 }]);

            const host2 = host1.clone();
            await TestHost.sync(host1, host2);

            const sharedString2 = await host2.getType<SharedString>("text");
            const intervals2 = await sharedString2.getIntervalCollection("intervals").getView();
            assertIntervalsHelper(sharedString2, intervals2, [{ start: 1, end: 7 }]);

            sharedString2.removeRange(4, 5);
            assertIntervalsHelper(sharedString2, intervals2, [{ start: 1, end: 6 }]);

            sharedString2.insertText(4, "x");
            assertIntervalsHelper(sharedString2, intervals2, [{ start: 1, end: 7 }]);

            await TestHost.sync(host1, host2);
            assertIntervalsHelper(sharedString1, intervals1, [{ start: 1, end: 7 }]);
        });
    });

    describe("Handles in value types", () => {
        const id = "fluid://test.com/test/test";

        let testDeltaConnectionServer: ITestDeltaConnectionServer;
        let documentDeltaEventManager: DocumentDeltaEventManager;
        let user1Document: api.Document;
        let user2Document: api.Document;
        let user3Document: api.Document;
        let root1: ISharedMap;
        let root2: ISharedMap;
        let root3: ISharedMap;

        beforeEach(async () => {
            testDeltaConnectionServer = TestDeltaConnectionServer.create();
            documentDeltaEventManager = new DocumentDeltaEventManager(testDeltaConnectionServer);
            const serviceFactory = new TestDocumentServiceFactory(testDeltaConnectionServer);
            const resolver = new TestResolver();
            user1Document = await api.load(
                id, resolver, {}, serviceFactory);
            documentDeltaEventManager.registerDocuments(user1Document);

            user2Document = await api.load(
                id, resolver, {}, serviceFactory);
            documentDeltaEventManager.registerDocuments(user2Document);

            user3Document = await api.load(
                id, resolver, {}, serviceFactory);
            documentDeltaEventManager.registerDocuments(user3Document);
            root1 = user1Document.getRoot();
            root2 = user2Document.getRoot();
            root3 = user3Document.getRoot();
            await documentDeltaEventManager.pauseProcessing();
        });

        // This functionality is used in Word and FlowView's "add comment" functionality.
        it("Can store shared objects in a shared string's interval collection via properties", async () => {
            root1.set("outerString", user1Document.createString().handle);
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

            const outerString1 = await root1.get<IComponentHandle>("outerString").get<SharedString>();
            const outerString2 = await root2.get<IComponentHandle>("outerString").get<SharedString>();
            const outerString3 = await root3.get<IComponentHandle>("outerString").get<SharedString>();
            assert.ok(outerString1);
            assert.ok(outerString2);
            assert.ok(outerString3);

            outerString1.insertText(0, "outer string");

            const intervalCollection1 = outerString1.getIntervalCollection("comments");
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

            const intervalCollection2 = outerString2.getIntervalCollection("comments");
            const intervalCollection3 = outerString3.getIntervalCollection("comments");
            assert.ok(intervalCollection1);
            assert.ok(intervalCollection2);
            assert.ok(intervalCollection3);

            const comment1Text = user1Document.createString();
            comment1Text.insertText(0, "a comment...");
            intervalCollection1.add(0, 3, IntervalType.SlideOnRemove, { story: comment1Text.handle });
            const comment2Text = user1Document.createString();
            comment2Text.insertText(0, "another comment...");
            intervalCollection1.add(5, 7, IntervalType.SlideOnRemove, { story: comment2Text.handle });
            const nestedMap = user1Document.createMap();
            nestedMap.set("nestedKey", "nestedValue");
            intervalCollection1.add(8, 9, IntervalType.SlideOnRemove, { story: nestedMap.handle });
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

            const serialized1 = intervalCollection1.serializeInternal();
            const serialized2 = intervalCollection2.serializeInternal();
            const serialized3 = intervalCollection3.serializeInternal();
            assert.equal(serialized1.length, 3);
            assert.equal(serialized2.length, 3);
            assert.equal(serialized3.length, 3);

            const interval1From3 = serialized3[0] as ISerializedInterval;
            const comment1From3 = await (interval1From3.properties.story as IComponentHandle).get<SharedString>();
            assert.equal(comment1From3.getText(0, 12), "a comment...");
            const interval3From3 = serialized3[2] as ISerializedInterval;
            const mapFrom3 = await (interval3From3.properties.story as IComponentHandle).get<SharedMap>();
            assert.equal(mapFrom3.get("nestedKey"), "nestedValue");

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
            assert.equal(handleLocalValueFromSnapshot.type, "__fluid_handle__");
        });

        afterEach(async () => {
            await Promise.all([
                user1Document.close(),
                user2Document.close(),
                user3Document.close(),
            ]);
            await testDeltaConnectionServer.webSocketServer.close();
        });
    });
});
