/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Eventful } from "../../events";

interface TestEvents {
    open: () => void;
    close: (error: boolean) => void;
    ping: () => number;
}

describe("EventEmitter", () => {
    it("emits events", () => {
        const emitter = Eventful.create<TestEvents>();
        let opened = false;
        emitter.on("open", () => {
            assert(!opened, "Event should only be fired once");
            opened = true;
        });
        emitter.emit("open");
        assert(opened);
    });

    it("passes arguments to events", () => {
        const emitter = Eventful.create<TestEvents>();
        let error = false;
        emitter.on("close", (e: boolean) => {
            error = e;
        });
        emitter.emit("close", true);
        assert.strictEqual(error, true);
    });

    it("emits multiple events", () => {
        const emitter = Eventful.create<TestEvents>();
        let opened = false;
        let closed = false;
        emitter.on("open", () => {
            opened = true;
        });
        emitter.on("close", (_) => {
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
        const emitter = Eventful.create<TestEvents>();
        let error = false;
        const deregister = emitter.on("close", (e: boolean) => {
            error = e;
        });
        deregister();
        emitter.emit("close", true);
        assert.strictEqual(error, false);
    });

    it("deregisters multiple events", () => {
        const emitter = Eventful.create<TestEvents>();
        let opened = false;
        let closed = false;
        const deregisterOpen = emitter.on("open", () => {
            opened = true;
        });
        const deregisterClosed = emitter.on("close", (_) => {
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
        const emitter = Eventful.create<TestEvents>();
        let count = 0;
        const listener = () => (count += 1);
        emitter.on("open", listener);
        emitter.on("open", listener);
        emitter.emit("open");
        // Count should be 1, not 2, even though `listener` was registered twice
        assert.strictEqual(count, 1);
    });

    it("collects event return values", () => {
        const emitter = Eventful.create<TestEvents>();
        emitter.on("ping", () => 1);
        emitter.on("ping", () => 2);
        emitter.on("ping", () => 3);
        const values = [...emitter.emit("ping")].sort((a, b) => a - b);
        assert.deepStrictEqual(values, [1, 2, 3]);
    });
});
