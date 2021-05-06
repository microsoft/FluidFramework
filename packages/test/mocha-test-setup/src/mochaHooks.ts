/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { Context } from "mocha";
import { pkgName } from "./packageVersion";

const _global: any = global;
class TestLogger implements ITelemetryBufferedLogger {
    send(event: ITelemetryBaseEvent) {
        if (this.testName !== undefined) {
            event.testName = this.testName;
        }
        event.hostName = pkgName;
        this.parentLogger.send(event);
    }
    async flush() {
        return this.parentLogger.flush();
    }
    setTestName(title: string | undefined) {
        this.testName = title;
    }
    constructor(private readonly parentLogger: ITelemetryBufferedLogger,
        private testName?: string) {}
}
const nullLogger: ITelemetryBufferedLogger = {
    send: () => {},
    flush: async () => {},
};

const log = console.log;
const error = console.log;
const warn = console.warn;
let testLogger: TestLogger;
export const mochaHooks = {
    beforeAll() {
        const parentLogger = _global.getTestLogger?.() ?? nullLogger;
        testLogger = new TestLogger(parentLogger);
        _global.getTestLogger = () => testLogger;
    },
    beforeEach() {
        // Suppress console.log if not verbose mode
        if (process.env.FLUID_TEST_VERBOSE === undefined) {
            console.log = () => { };
            console.error = () => { };
            console.warn = () => { };
        }
        const context = this as any as Context;
        testLogger.setTestName(context.currentTest?.fullTitle());
    },
    afterEach() {
        console.log = log;
        console.error = error;
        console.warn = warn;
        testLogger.setTestName(undefined);
    },
};
