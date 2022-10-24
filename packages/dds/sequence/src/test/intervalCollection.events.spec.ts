/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, strict as assert } from "assert";
import { PropertySet, toRemovalInfo } from "@fluidframework/merge-tree";
import {
    MockFluidDataStoreRuntime,
    MockContainerRuntimeFactory,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { SharedString } from "../sharedString";
import { SharedStringFactory } from "../sequenceFactory";
import { IntervalCollection, IntervalType, SequenceInterval } from "../intervalCollection";

interface IntervalEventInfo {
    interval: { start: number; end: number; };
    local: boolean;
    op: ISequencedDocumentMessage | undefined;
}

describe("SharedString interval collection event spec", () => {
    let sharedString: SharedString;
    let dataStoreRuntime1: MockFluidDataStoreRuntime;

    let sharedString2: SharedString;
    let containerRuntimeFactory: MockContainerRuntimeFactory;
    let collection: IntervalCollection<SequenceInterval>;

    beforeEach(() => {
        dataStoreRuntime1 = new MockFluidDataStoreRuntime();
        sharedString = new SharedString(dataStoreRuntime1, "shared-string-1", SharedStringFactory.Attributes);
        containerRuntimeFactory = new MockContainerRuntimeFactory();

        // Connect the first SharedString.
        dataStoreRuntime1.local = false;
        const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
        const services1 = {
            deltaConnection: containerRuntime1.createDeltaConnection(),
            objectStorage: new MockStorage(),
        };
        sharedString.initializeLocal();
        sharedString.connect(services1);

        // Create and connect a second SharedString.
        const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
        const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
        const services2 = {
            deltaConnection: containerRuntime2.createDeltaConnection(),
            objectStorage: new MockStorage(),
        };

        sharedString2 = new SharedString(dataStoreRuntime2, "shared-string-2", SharedStringFactory.Attributes);
        sharedString2.initializeLocal();
        sharedString2.connect(services2);

        sharedString.insertText(0, "hello world");
        collection = sharedString.getIntervalCollection("test");
        containerRuntimeFactory.processAllMessages();
    });

    describe("addInterval", () => {
        const eventLog: IntervalEventInfo[] = [];
        beforeEach(() => {
            collection.on("addInterval", ({ start, end }, local, op) => eventLog.push({
                interval: {
                    start: sharedString.localReferencePositionToPosition(start),
                    end: sharedString.localReferencePositionToPosition(end),
                },
                local,
                op,
            }));
            eventLog.length = 0;
        });

        it("is emitted on initial local add but not ack of that add", () => {
            collection.add(0, 1, IntervalType.SlideOnRemove);
            assert.equal(eventLog.length, 1);
            {
                const [{ interval, local, op }] = eventLog;
                assert.deepEqual(interval, { start: 0, end: 1 });
                assert.equal(local, true);
                assert.equal(op, undefined);
            }
            containerRuntimeFactory.processAllMessages();
            assert.equal(eventLog.length, 1);
        });

        it("is emitted on ack of a remote add", () => {
            const collection2 = sharedString2.getIntervalCollection("test");
            collection2.add(0, 1, IntervalType.SlideOnRemove);
            assert.equal(eventLog.length, 0);
            containerRuntimeFactory.processAllMessages();
            assert.equal(eventLog.length, 1);
            {
                const [{ interval, local, op }] = eventLog;
                assert.deepEqual(interval, { start: 0, end: 1 });
                assert.equal(local, false);
                assert.equal(op?.contents.type, "act");
            }
        });
    });

    describe("deleteInterval", () => {
        const eventLog: IntervalEventInfo[] = [];
        let intervalId: string;
        beforeEach(() => {
            collection.on("deleteInterval", ({ start, end }, local, op) => eventLog.push({
                interval: {
                    start: sharedString.localReferencePositionToPosition(start),
                    end: sharedString.localReferencePositionToPosition(end),
                },
                local,
                op,
            }));
            const interval = collection.add(0, 1, IntervalType.SlideOnRemove);
            intervalId = interval.getIntervalId() ?? assert.fail("Expected interval to have id");
            containerRuntimeFactory.processAllMessages();
            eventLog.length = 0;
        });

        it("is emitted on initial local delete but not ack of that delete", () => {
            collection.removeIntervalById(intervalId);
            assert.equal(eventLog.length, 1);
            {
                const [{ interval, local, op }] = eventLog;
                assert.deepEqual(interval, { start: 0, end: 1 });
                assert.equal(local, true);
                assert.equal(op, undefined);
            }
            containerRuntimeFactory.processAllMessages();
            assert.equal(eventLog.length, 1);
        });

        it("is emitted on ack of a remote delete", () => {
            const collection2 = sharedString2.getIntervalCollection("test");
            collection2.removeIntervalById(intervalId);
            assert.equal(eventLog.length, 0);
            containerRuntimeFactory.processAllMessages();
            assert.equal(eventLog.length, 1);
            {
                const [{ interval, local, op }] = eventLog;
                assert.deepEqual(interval, { start: 0, end: 1 });
                assert.equal(local, false);
                assert.equal(op?.contents.type, "act");
            }
        });
    });

    describe("changeInterval", () => {
        const eventLog: (IntervalEventInfo & {
            previousEndpoints: { start: number; end: number; };
            previousInterval: SequenceInterval;
        })[] = [];
        let intervalId: string;
        beforeEach(() => {
            collection.on("changeInterval",
                ({ start, end }, previousInterval, local, op) => eventLog.push({
                    interval: {
                        start: sharedString.localReferencePositionToPosition(start),
                        end: sharedString.localReferencePositionToPosition(end),
                    },
                    previousEndpoints: {
                        start: sharedString.localReferencePositionToPosition(previousInterval.start),
                        end: sharedString.localReferencePositionToPosition(previousInterval.end),
                    },
                    previousInterval,
                    local,
                    op,
                }),
            );
            const _intervalId = collection.add(0, 1, IntervalType.SlideOnRemove).getIntervalId();
            assert(_intervalId);
            intervalId = _intervalId;
            containerRuntimeFactory.processAllMessages();
            eventLog.length = 0;
        });

        it("is emitted on initial local change but not ack of that change", () => {
            collection.change(intervalId, 2, 3);
            assert.equal(eventLog.length, 1);
            {
                const [{ interval, previousEndpoints, local, op }] = eventLog;
                assert.deepEqual(interval, { start: 2, end: 3 });
                assert.deepEqual(previousEndpoints, { start: 0, end: 1 });
                assert.equal(local, true);
                assert.equal(op, undefined);
            }
            containerRuntimeFactory.processAllMessages();
            assert.equal(eventLog.length, 1);
        });

        it("is emitted on a remote change", () => {
            const collection2 = sharedString2.getIntervalCollection("test");
            collection2.change(intervalId, 2, 3);
            assert.equal(eventLog.length, 0);
            containerRuntimeFactory.processAllMessages();
            assert.equal(eventLog.length, 1);
            {
                const [{ interval, previousEndpoints, local, op }] = eventLog;
                assert.deepEqual(interval, { start: 2, end: 3 });
                assert.deepEqual(previousEndpoints, { start: 0, end: 1 });
                assert.equal(local, false);
                assert.equal(op?.contents.type, "act");
            }
        });

        it("is not emitted on a property change", () => {
            collection.changeProperties(intervalId, { foo: "bar" });
            assert.equal(eventLog.length, 0);
            containerRuntimeFactory.processAllMessages();
            assert.equal(eventLog.length, 0);
        });

        describe("is emitted on a change due to an endpoint sliding", () => {
            it("on ack of a segment remove containing a ref", () => {
                sharedString.removeRange(1, 3);
                assert.equal(eventLog.length, 0);
                containerRuntimeFactory.processAllMessages();
                assert.equal(eventLog.length, 1);
                {
                    const [{ interval, previousInterval, previousEndpoints, local, op }] = eventLog;
                    assert.deepEqual(interval, { start: 0, end: 1 });
                    assert(toRemovalInfo(previousInterval.end.getSegment()) !== undefined);
                    assert.deepEqual(previousEndpoints, { start: 0, end: 1 });
                    assert.equal(local, true);
                    assert.equal(op, undefined);
                }
            });

            it("on ack of an add to a concurrently removed segment", () => {
                sharedString2.removeRange(3, sharedString2.getLength());
                collection.add(4, 4, IntervalType.SlideOnRemove);
                assert.equal(eventLog.length, 0);
                containerRuntimeFactory.processAllMessages();
                assert.equal(eventLog.length, 1);
                {
                    const [{ interval, previousInterval, previousEndpoints, local, op }] = eventLog;
                    assert.deepEqual(interval, { start: 2, end: 2 });
                    assert(toRemovalInfo(previousInterval.start.getSegment()) !== undefined);
                    // Note: this isn't 4 because we're interpreting the segment+offset from the current view.
                    assert.deepEqual(previousEndpoints, { start: 3, end: 3 });
                    assert.equal(local, true);
                    assert.equal(op?.contents.type, "act");
                }
            });

            it("on ack of a change to a concurrently removed segment", () => {
                sharedString2.removeRange(3, sharedString2.getLength());
                collection.change(intervalId, 4, 4);
                assert.equal(eventLog.length, 1);
                containerRuntimeFactory.processAllMessages();
                assert.equal(eventLog.length, 2);
                {
                    const { interval, previousInterval, previousEndpoints, local, op } = eventLog[1];
                    assert.deepEqual(interval, { start: 2, end: 2 });
                    assert(toRemovalInfo(previousInterval.start.getSegment()) !== undefined);
                    // Note: this isn't 4 because we're interpreting the segment+offset from the current view.
                    assert.deepEqual(previousEndpoints, { start: 3, end: 3 });
                    assert.equal(local, true);
                    assert.equal(op?.contents.type, "act");
                }
            });
        });
    });

    describe("propertyChanged", () => {
        const eventLog: (Omit<IntervalEventInfo, "interval"> & {
            id: string;
            deltas: PropertySet;
        })[] = [];
        let intervalId: string;
        beforeEach(() => {
            collection.on("propertyChanged",
                (interval, deltas, local, op) => eventLog.push({
                    id: interval.getIntervalId() ?? assert.fail("Expected interval to have id"),
                    deltas,
                    local,
                    op,
                }),
            );
            intervalId = collection.add(0, 1, IntervalType.SlideOnRemove, { initialProp: "baz" }).getIntervalId()
                ?? fail("Expected interval to have id");
            containerRuntimeFactory.processAllMessages();
            eventLog.length = 0;
        });

        it("is emitted on initial local property change but not ack of that change", () => {
            collection.changeProperties(intervalId, { foo: "bar" });
            assert.equal(eventLog.length, 1);
            {
                const [{ id, deltas, local, op }] = eventLog;
                assert.equal(id, intervalId);
                assert.equal(local, true);
                assert.equal(op, undefined);
                assert.deepEqual(deltas, { foo: null });
            }
            containerRuntimeFactory.processAllMessages();
            assert.equal(eventLog.length, 1);
        });

        it("is emitted on ack of remote property change", () => {
            const collection2 = sharedString2.getIntervalCollection("test");
            collection2.changeProperties(intervalId, { foo: "bar" });
            assert.equal(eventLog.length, 0);
            containerRuntimeFactory.processAllMessages();
            assert.equal(eventLog.length, 1);
            {
                const [{ id, deltas, local, op }] = eventLog;
                assert.equal(id, intervalId);
                assert.equal(local, false);
                assert.equal(op?.contents.type, "act");
                assert.deepEqual(deltas, { foo: null });
            }
        });

        it("only includes deltas for values that actually changed", () => {
            const collection2 = sharedString2.getIntervalCollection("test");
            collection2.changeProperties(intervalId, { applies: true, conflictedDoesNotApply: 5 });
            assert.equal(eventLog.length, 0);
            collection.changeProperties(intervalId, { conflictedDoesNotApply: 2 });
            assert.equal(eventLog.length, 1);
            containerRuntimeFactory.processAllMessages();
            assert.equal(eventLog.length, 2);
            {
                const { id, deltas, local, op } = eventLog[1];
                assert.equal(id, intervalId);
                assert.equal(local, false);
                assert.equal(op?.contents.type, "act");
                assert.deepEqual(deltas, { applies: null });
            }
        });
    });
});
