"use strict";
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Trace = void 0;
const indexNode_js_1 = require("./indexNode.js");
/**
 * Helper class for tracing performance of events
 * Time measurements are in milliseconds as a floating point with a decimal
 *
 * @internal
 */
class Trace {
    static start() {
        const startTick = indexNode_js_1.performance.now();
        return new Trace(startTick);
    }
    constructor(startTick) {
        this.startTick = startTick;
        this.lastTick = startTick;
    }
    trace() {
        const tick = indexNode_js_1.performance.now();
        const event = {
            totalTimeElapsed: tick - this.startTick,
            duration: tick - this.lastTick,
            tick,
        };
        this.lastTick = tick;
        return event;
    }
}
exports.Trace = Trace;
//# sourceMappingURL=trace.js.map