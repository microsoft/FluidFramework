/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { Context } from "mocha";

const _global: any = global;
class TestLogger implements ITelemetryBufferedLogger {
    send(event: ITelemetryBaseEvent) {
        event.testName = this.context.currentTest?.fullTitle();
        this.parentLogger.send(event);
    }
    async flush() {
        return this.parentLogger.flush();
    }
    constructor(private readonly parentLogger: ITelemetryBufferedLogger,
        private readonly context: Context) {}
}
const nullLogger: ITelemetryBufferedLogger = {
    send: () => {},
    flush: async () => {},
};

const log = console.log;
const error = console.log;

export const mochaHooks = {
    beforeAll() {
        const parentLogger = _global.getTestLogger() ?? nullLogger;
        const testLogger = new TestLogger(parentLogger, this as any as Context);
        _global.getTestLogger = () => testLogger;
    },
    beforeEach() {
        // Suppress console.log if not verbose mode
        if (process.env.FLUID_TEST_VERBOSE === undefined) {
            console.log = () => { };
            console.error = () => { };
        }
    },
    afterEach() {
        console.log = log;
        console.error = error;
    },
};
