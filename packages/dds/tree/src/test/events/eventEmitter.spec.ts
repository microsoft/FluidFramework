/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitter } from "../../events";

interface TestEvents {
    open: () => void;
    close: (error: boolean) => void;
}

describe("EventEmitter", () => {
    it("emits events", () => {
        const emitter = EventEmitter.create<TestEvents>();
        let opened = false;
        emitter.on("open", () => {
            assert(!opened, "Event should only be fired once");
            opened = true;
        });
        emitter.emit("open");
        assert(opened);
    });

    it("passes arguments to events", () => {
        const emitter = EventEmitter.create<TestEvents>();
        let error = false;
        emitter.on("close", (e: boolean) => {
            error = e;
        });
        emitter.emit("close", true);
        assert.strictEqual(error, true);
    });

    it("emits multiple events", () => {
        const emitter = EventEmitter.create<TestEvents>();
        let opened = false;
        let closed = false;
        emitter.on("open", () => {
            opened = true;
        });
        emitter.on("close", () => {
            closed = true;
        });
        emitter.emit("open");
        assert(opened);
        assert(!closed);
        emitter.emit("close", false);
        assert(opened);
        assert(closed);
    });

    it("deregisters events", () => {
        const emitter = EventEmitter.create<TestEvents>();
        let error = false;
        const deregister = emitter.on("close", (e: boolean) => {
            error = e;
        });
        deregister();
        emitter.emit("close", true);
        assert.strictEqual(error, false);
    });

    it("deregisters multiple events", () => {
        const emitter = EventEmitter.create<TestEvents>();
        let opened = false;
        let closed = false;
        const deregisterOpen = emitter.on("open", () => {
            opened = true;
        });
        const deregisterClosed = emitter.on("close", () => {
            closed = true;
        });
        deregisterOpen();
        deregisterClosed();
        emitter.emit("open");
        assert(!opened);
        assert(!closed);
        emitter.emit("close", false);
        assert(!opened);
        assert(!closed);
    });

    it("ignores duplicate events", () => {
        const emitter = EventEmitter.create<TestEvents>();
        let count = 0;
        const listener = () => (count += 1);
        emitter.on("open", listener);
        emitter.on("open", listener);
        emitter.emit("open");
        // Count should be 1, not 2, even though `listener` was registered twice
        assert.strictEqual(count, 1);
    });
});
