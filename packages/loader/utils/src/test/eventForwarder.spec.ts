/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { EventEmitter } from "events";
import { EventForwarder } from "../eventForwarder";

describe("Loader", () => {
    describe("Utils", () => {
        describe("Event Forwarder", () => {
            describe("Forwarding", () => {
                let source: EventEmitter;
                let forwarder: EventForwarder;
                const testEvent = "testEvent";
                const errorEvent = "error";

                beforeEach(() => {
                    source = new EventEmitter();
                    forwarder = new EventForwarder(source);
                });

                afterEach(() => {
                    if (!forwarder.disposed) {
                        forwarder.dispose();
                    }
                });

                it("Should forward events", () => {
                    let emitted = false;
                    forwarder.on(testEvent, () => { emitted = true; });
                    source.emit(testEvent);
                    assert(emitted);
                });

                it("Should forward events in correct order", () => {
                    let emitCount = 0;
                    forwarder.on(testEvent, () => { assert.strictEqual(emitCount++, 2); });
                    forwarder.once(testEvent, () => { assert.strictEqual(emitCount++, 3); });
                    forwarder.prependListener(testEvent, () => { assert.strictEqual(emitCount++, 1); });
                    forwarder.prependOnceListener(testEvent, () => { assert.strictEqual(emitCount++, 0); });
                    source.emit(testEvent);
                    assert.strictEqual(emitCount, 4);
                });

                it("Should forward event args", () => {
                    const expectedName = "Try It";
                    const expectedCount = 11;
                    let emitted = false;
                    forwarder.on(testEvent, (name, count) => {
                        assert.strictEqual(name, expectedName);
                        assert.strictEqual(count, expectedCount);
                        emitted = true;
                    });
                    source.emit(testEvent, expectedName, expectedCount);
                    assert(emitted);
                });

                it("Should emit correct number of times", () => {
                    let listener1Count = 0;
                    let listener2Count = 0;
                    let listenerOnceCount = 0;
                    forwarder.on(testEvent, () => { listener1Count++; });
                    forwarder.once(testEvent, () => { listenerOnceCount++; });
                    forwarder.on(testEvent, () => { listener2Count++; });
                    source.emit(testEvent);
                    source.emit(testEvent);
                    source.emit(testEvent);
                    assert.strictEqual(listener1Count, 3);
                    assert.strictEqual(listener2Count, 3);
                    assert.strictEqual(listenerOnceCount, 1);
                });

                it("Should remove listeners", () => {
                    let listener1Results = "";
                    let listener2Results = "";
                    const listener1 = (value: string) => { listener1Results += value; };
                    const listener2 = (value: string) => { listener2Results += value; };
                    forwarder.on(testEvent, listener1);
                    forwarder.on(testEvent, listener2);
                    source.emit(testEvent, "a");
                    forwarder.off(testEvent, listener2);
                    source.emit(testEvent, "b");
                    forwarder.off(testEvent, listener1);
                    source.emit(testEvent, "c");
                    forwarder.once(testEvent, listener2);
                    source.emit(testEvent, "d");
                    forwarder.once(testEvent, listener1);
                    source.emit(testEvent, "e");
                    source.emit(testEvent, "f");
                    assert.strictEqual(listener1Results, "abe");
                    assert.strictEqual(listener2Results, "ad");
                });

                it("Forwarder should not be considered a listener to source unless forwarder has listeners", () => {
                    let sourceCount = 0;
                    let forwarderCount = 0;
                    const sourceListener = () => sourceCount++;
                    const forwarderListener = () => forwarderCount++;

                    // no listeners should throw
                    assert.throws(() => source.emit(errorEvent));

                    // source listener should raise event
                    source.on(errorEvent, sourceListener);
                    source.emit(errorEvent);
                    assert.strictEqual(sourceCount, 1);

                    // removed source listeners should throw
                    source.off(errorEvent, sourceListener);
                    assert.throws(() => source.emit(errorEvent));

                    // forwarder listener only should raise event
                    forwarder.on(errorEvent, forwarderListener);
                    source.emit(errorEvent);
                    assert.strictEqual(forwarderCount, 1);

                    // both listeners should raise event
                    source.on(errorEvent, sourceListener);
                    source.emit(errorEvent);
                    assert.strictEqual(sourceCount, 2);
                    assert.strictEqual(forwarderCount, 2);

                    // removed forwarder listener should not throw
                    // it is important that this case does not throw
                    forwarder.off(errorEvent, forwarderListener);
                    source.emit(errorEvent);
                    assert.strictEqual(sourceCount, 3);
                    assert.strictEqual(forwarderCount, 2);
                });
            });
        });
    });
});
