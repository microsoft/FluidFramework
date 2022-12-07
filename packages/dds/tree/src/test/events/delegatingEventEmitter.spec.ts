/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { DelegatingEventEmitter } from "../../events";

interface TestEvents {
    open: () => void;
    close: (error: boolean) => void;
}

describe("DelegatingEventEmitter", () => {
    it("emits events", () => {
        const emitter = DelegatingEventEmitter.create<TestEvents>();
        let opened = false;
        emitter.on("open", () => {
            opened = true;
        });
        emitter.emit("open");
        assert(opened);
    });

    it("passes arguments to events", () => {
        const emitter = DelegatingEventEmitter.create<TestEvents>();
        let error = false;
        emitter.on("close", (e: boolean) => {
            error = e;
        });
        emitter.emit("close", true);
        assert.strictEqual(error, true);
    });

    it("emits multiple events", () => {
        const emitter = DelegatingEventEmitter.create<TestEvents>();
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
        const emitter = DelegatingEventEmitter.create<TestEvents>();
        let error = false;
        const deregister = emitter.on("close", (e: boolean) => {
            error = e;
        });
        deregister();
        emitter.emit("close", true);
        assert.strictEqual(error, true);
    });

    it("emits events more than once", () => {
        const emitter = DelegatingEventEmitter.create<TestEvents>();
        let error = false;
        emitter.on("close", (e: boolean) => {
            error = e;
        }, false);
        emitter.emit("close", true);
        assert.strictEqual(error, true);
        emitter.emit("close", false);
        assert.strictEqual(error, false);
    });

    it("emits events more than once by default", () => {
        const emitter = DelegatingEventEmitter.create<TestEvents>();
        let error = false;
        emitter.on("close", (e: boolean) => {
            error = e;
        });
        emitter.emit("close", true);
        assert.strictEqual(error, true);
        emitter.emit("close", false);
        assert.strictEqual(error, false);
    });

    it("emits events only once", () => {
        const emitter = DelegatingEventEmitter.create<TestEvents>();
        let error = false;
        emitter.on("close", (e: boolean) => {
            error = e;
        }, true);
        emitter.emit("close", true);
        assert.strictEqual(error, true);
        emitter.emit("close", false);
        assert.strictEqual(error, true);
    });

    it("appends events", () => {
        const emitter = DelegatingEventEmitter.create<TestEvents>();
        let listener = -1;
        emitter.on("open", () => {
            listener = 0;
        });
        emitter.on("open", () => {
            listener = 1;
        }, undefined, "append");
        emitter.emit("open");
        assert.strictEqual(listener, 1);
    });

    it("appends events by default", () => {
        const emitter = DelegatingEventEmitter.create<TestEvents>();
        let listener = -1;
        emitter.on("open", () => {
            listener = 0;
        });
        emitter.on("open", () => {
            listener = 1;
        });
        emitter.emit("open");
        assert.strictEqual(listener, 1);
    });

    it("prepends events", () => {
        const emitter = DelegatingEventEmitter.create<TestEvents>();
        let listener = -1;
        emitter.on("open", () => {
            listener = 0;
        });
        emitter.on("open", () => {
            listener = 1;
        }, undefined, "prepend");
        emitter.emit("open");
        assert.strictEqual(listener, 0);
    });
});
