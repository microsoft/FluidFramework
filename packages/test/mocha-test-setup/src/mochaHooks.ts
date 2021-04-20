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
        event.testName = this.testName;
        console.log("helloimhere",event.testName);
        this.parentLogger.send(event);
    }
    async flush() {
        return this.parentLogger.flush();
    }
    pass(title: string | undefined) {
        this.testName = title;
    }
    constructor(private readonly parentLogger: ITelemetryBufferedLogger,
        private testName: string | undefined) {}
}
const nullLogger: ITelemetryBufferedLogger = {
    send: () => {},
    flush: async () => {},
};

const log = console.log;
const error = console.log;
let testLogger: TestLogger;
export const mochaHooks = {
    beforeAll() {
        const parentLogger = _global.getTestLogger ?? nullLogger;
        testLogger = new TestLogger(parentLogger, "");
        console.log(parentLogger,"parent logger");
        _global.getTestLogger = () => testLogger;
    },
    beforeEach() {
        // Suppress console.log if not verbose mode
        // if (process.env.FLUID_TEST_VERBOSE === undefined) {
        //     console.log = () => { };
        //     console.error = () => { };
        // }
        const context = this as any as Context;
        console.log("isthisworking",context.currentTest?.fullTitle());
        testLogger.pass(context.currentTest?.fullTitle());
    },
    afterEach() {
        console.log = log;
        console.error = error;
        testLogger.pass(undefined);
    },
};
