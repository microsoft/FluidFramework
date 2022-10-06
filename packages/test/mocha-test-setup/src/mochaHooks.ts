/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { Context } from "mocha";
import { pkgName } from "./packageVersion";

const testVariant = process.env.FLUID_TEST_VARIANT;

const _global: any = global;
class TestLogger implements ITelemetryBufferedLogger {
    send(event: ITelemetryBaseEvent) {
        // TODO: Remove when issue #7061 is resolved.
        // Don't log this event as we generate too much.
        if (event.eventName === "fluid:telemetry:RouterliciousDriver:readBlob_end") {
            return;
        }

        event.testName = this.testName;
        event.testVariant = testVariant;
        event.hostName = pkgName;
        this.parentLogger.send(event);
    }
    async flush() {
        return this.parentLogger.flush();
    }
    constructor(private readonly parentLogger: ITelemetryBufferedLogger,
        private readonly testName: string) { }
}
const nullLogger: ITelemetryBufferedLogger = {
    send: () => { },
    flush: async () => { },
};

const log = console.log;
const error = console.log;
const warn = console.warn;
let currentTestLogger: ITelemetryBufferedLogger | undefined;
let currentTestName: string | undefined;
let originalLogger: ITelemetryBufferedLogger;
export const mochaHooks = {
    beforeAll() {
        originalLogger = _global.getTestLogger?.() ?? nullLogger;
        _global.getTestLogger = () => {
            // If it hasn't been created yet, create a test logger that will log the test name on demand
            if (!currentTestLogger && currentTestName !== undefined) {
                currentTestLogger = new TestLogger(originalLogger, currentTestName);
            }
            return currentTestLogger ?? originalLogger;
        };
    },
    beforeEach() {
        // Suppress console.log if not verbose mode
        if (process.env.FLUID_TEST_VERBOSE === undefined) {
            console.log = () => { };
            console.error = () => { };
            console.warn = () => { };
        }
        // save the test name can and clear the previous logger (if afterEach didn't get ran and it got left behind)
        const context = this as any as Context;
        currentTestName = context.currentTest?.fullTitle();
        currentTestLogger = undefined;

        // send event on test start
        originalLogger.send({
            category: "generic",
            eventName: "fluid:telemetry:Test_start",
            testName: currentTestName,
            testVariant,
            hostName: pkgName,
        });
    },
    afterEach() {
        // send event on test end
        const context = this as any as Context;
        originalLogger.send({
            category: "generic",
            eventName: "fluid:telemetry:Test_end",
            testName: currentTestName,
            state: context.currentTest?.state,
            duration: context.currentTest?.duration,
            timedOut: context.currentTest?.timedOut,
            testVariant,
            hostName: pkgName,
        });

        console.log = log;
        console.error = error;
        console.warn = warn;

        // clear the test logger and test name after each test
        currentTestLogger = undefined;
        currentTestName = undefined;
    },
};

// Add ability to register code to run before and after the test code. This is different
// than beforeEach/AfterEach in that the injected code is counted as part of the test.
// It would be good for code that needs to run closer to the test (e.g. tracking timeout).
// Also, error in this code count as error of the test, instead of part of the hook, which
// would avoid rest of tests in the suite being skipped because of the hook error.

let newTestFunction: Mocha.TestFunction | undefined;

type BeforeTestFunc<T = any> = (this: Mocha.Context) => T;
type AfterTestFunc<T = any> = (this: Mocha.Context, beforeTestResult: T) => void;

const testFuncs: { beforeTestFunc: BeforeTestFunc; afterTestFunc: AfterTestFunc; }[] = [];
function runBeforeTestFuncs(context: Mocha.Context): any[] {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return testFuncs.map((v) => v.beforeTestFunc.call(context));
}

function runAfterTestFuncs(context: Mocha.Context, values: any[]) {
    for (let index = testFuncs.length - 1; index >= 0; index--) {
        testFuncs[index].afterTestFunc.call(context, values[index]);
    }
}
function getWrappedFunction(fn: Mocha.Func | Mocha.AsyncFunc) {
    if (fn.length > 0) {
        return function(this: Mocha.Context, done) {
            const values = runBeforeTestFuncs(this);
            try {
                (fn as Mocha.Func).call(this, done);
            } finally {
                runAfterTestFuncs(this, values);
            }
        };
    }
    return function(this: Mocha.Context) {
        const values = runBeforeTestFuncs(this);

        let ret: PromiseLike<any> | void;
        try {
            ret = (fn as Mocha.AsyncFunc).call(this);
        } finally {
            runAfterTestFuncs(this, values);
        }

        if (typeof ret?.then === "function") {
            // Start the timer again to wait for async
            const asyncValues = runBeforeTestFuncs(this);
            // Clear the timer if the promise resolves.
            // use the id to avoid clearing the end time if it resolves after timing out
            const clearFunc = () => { runAfterTestFuncs(this, asyncValues); };
            ret?.then(clearFunc, clearFunc);
        }
        return ret;
    };
}

function setupCustomTestHooks() {
    const currentTestFunction = globalThis.it;
    // the function `it` is reassign per test files. Trap it.
    Object.defineProperty(globalThis, "it", {
        get: () => { return newTestFunction; },
        set: (oldTestFunction: Mocha.TestFunction | undefined) => {
            if (oldTestFunction === undefined) { newTestFunction = undefined; return; }
            newTestFunction = ((title: string, fn?: Mocha.Func | Mocha.AsyncFunc) => {
                return oldTestFunction(title, fn && typeof fn.call === "function" ?
                    getWrappedFunction(fn)
                    : fn);
            }) as Mocha.TestFunction;
            newTestFunction.skip = oldTestFunction.skip;
            newTestFunction.only = oldTestFunction.only;
        },
    });
    globalThis.it = currentTestFunction;
}

setupCustomTestHooks();

globalThis.registerMochaTestWrapperFuncs =
    function <T>(beforeTestFunc: BeforeTestFunc<T>, afterTestFunc: AfterTestFunc<T>) {
        testFuncs.push({ beforeTestFunc, afterTestFunc });
    };
