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

type AfterTestFunc = (context: Mocha.Context) => void;
type BeforeTestFunc = (context: Mocha.Context) => AfterTestFunc | undefined;

const testFuncs: BeforeTestFunc[] = [];
function patchAndRunBeforeTestFuncs(context: Mocha.Context, done: Mocha.Done) {
    const afterTestFuncs: (AfterTestFunc | undefined)[] = [];
    // Run after test funcs when done is call
    const newDone = function(err?: any) {
        runAfterTestFuncs(context, afterTestFuncs);
        done(err);
    };

    // patch the timeout callback;
    context.runnable().callback = newDone;

    // Actually run it and capture the variable
    testFuncs.forEach((v) => afterTestFuncs.unshift(v(context)));
    return { afterTestFuncs, newDone };
}

function runAfterTestFuncs(context: Mocha.Context, afterTestFuncs: (AfterTestFunc | undefined)[]) {
    afterTestFuncs.forEach((func) => { if (func) { func(context); } });
}

function getWrappedFunction(fn: Mocha.Func | Mocha.AsyncFunc) {
    if (fn.length > 0) {
        return function(this: Mocha.Context, done: Mocha.Done) {
            // Run before test funcs
            const { afterTestFuncs, newDone } = patchAndRunBeforeTestFuncs(this, done);
            let success = false;
            try {
                // call the actual test function
                (fn as Mocha.Func).call(this, newDone);
                success = true;
            } finally {
                if (!success) {
                    // run the after test funcs if there is an exception
                    runAfterTestFuncs(this, afterTestFuncs);
                }
            }
        };
    }
    return function(this: Mocha.Context) {
        // Run the before test funcs
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const { afterTestFuncs } = patchAndRunBeforeTestFuncs(this, this.runnable().callback!);

        let ret: PromiseLike<any> | void;
        try {
            // Run the test
            ret = (fn as Mocha.AsyncFunc).call(this);
        } finally {
            if (typeof ret?.then === "function") {
                // Wait for the promise to resolve
                const clearFunc = () => { runAfterTestFuncs(this, afterTestFuncs); };
                ret?.then(clearFunc, clearFunc);
            } else {
                runAfterTestFuncs(this, afterTestFuncs);
            }
        }
        return ret;
    };
}

let newTestFunction: Mocha.TestFunction | undefined;
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

globalThis.registerMochaTestWrapperFunc = (beforeTestFunc: BeforeTestFunc) => {
    testFuncs.push(beforeTestFunc);
};
